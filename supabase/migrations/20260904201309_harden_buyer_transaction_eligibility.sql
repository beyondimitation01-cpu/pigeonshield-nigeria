BEGIN;

-- Keep the existing buyer transaction policy permissive for the normal
-- marketplace eligibility rules, then add account-state eligibility as a
-- separate restrictive policy. This preserves the existing purchase path
-- while making the buyer's current security state an independent gate.
DROP POLICY IF EXISTS "buyers create transactions" ON public.transactions;

CREATE POLICY "buyers create transactions"
ON public.transactions
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  buyer_id = (SELECT auth.uid())
  AND buyer_id IS DISTINCT FROM breeder_id
  AND listing_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id = transactions.listing_id
      AND l.is_active = true
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id = transactions.listing_id
      AND l.breeder_id = (SELECT auth.uid())
  )
);

-- Independent, restrictive gate: each account control can be enabled or
-- disabled by Admin without changing the purchase policy or other flags.
CREATE POLICY "eligible buyers may create transactions"
ON public.transactions
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.is_banned = false
      AND p.is_frozen = false
      AND p.escrow_paused = false
  )
);

-- Defense in depth: the existing transaction canonicalization boundary also
-- rejects restricted accounts. This protects direct database/API callers even
-- if transaction policy behavior changes in the future.
CREATE OR REPLACE FUNCTION private.canonicalize_buyer_transaction_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  listing_row public.listings%rowtype;
  buyer_profile public.profiles%rowtype;
  commission_pct numeric;
  canonical_commission bigint;
begin
  if auth.uid() is null or private.has_role(auth.uid(), 'admin'::app_role) then
    return new;
  end if;

  select * into buyer_profile
  from public.profiles
  where id = auth.uid();

  if not found then
    raise exception 'Your marketplace account is not ready for purchases';
  end if;

  if buyer_profile.is_banned is true then
    raise exception 'Your account is not permitted to create purchases';
  end if;

  if buyer_profile.is_frozen is true then
    raise exception 'Your account is temporarily frozen from creating purchases';
  end if;

  if buyer_profile.escrow_paused is true then
    raise exception 'Escrow activity is temporarily paused for your account';
  end if;

  if new.listing_id is null then
    raise exception 'A marketplace transaction requires a listing';
  end if;

  select * into listing_row
  from public.listings
  where id = new.listing_id
  for update;
  if not found then
    raise exception 'This listing does not exist';
  end if;
  if listing_row.is_active is not true then
    raise exception 'This listing is no longer available';
  end if;
  if listing_row.breeder_id is null then
    raise exception 'This listing is not available for purchase';
  end if;
  if listing_row.breeder_id = auth.uid() then
    raise exception 'You cannot message or buy your own product';
  end if;
  select coalesce((select s.commission_pct from public.app_settings s where s.id = 1), 12)
    into commission_pct;
  canonical_commission := round((listing_row.price_ngn::numeric * coalesce(listing_row.commission_override, commission_pct)) / 100)::bigint;
  new.buyer_id := auth.uid();
  new.breeder_id := listing_row.breeder_id;
  new.listing_name := listing_row.custom_bird_name;
  new.amount_naira := listing_row.price_ngn;
  new.calculated_commission := canonical_commission;
  new.status := 'Escrow Funded';
  new.dispute_status := 'None';
  new.verification_pin := null;
  new.delivery_marked_at := now();
  new.auto_release_at := now() + interval '48 hours';
  new.payout_paid_at := null;
  new.payout_paid_by := null;
  new.payout_reference := null;
  new.payout_notes := null;
  new.driver_phone := null;
  new.waybill_image_url := null;
  new.proof_file_name := null;
  new.receipt_uploaded_at := case when new.receipt_url is not null then now() else null end;
  new.created_at := now();
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION private.canonicalize_buyer_transaction_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.canonicalize_buyer_transaction_insert() FROM anon;
REVOKE ALL ON FUNCTION private.canonicalize_buyer_transaction_insert() FROM authenticated;

COMMIT;

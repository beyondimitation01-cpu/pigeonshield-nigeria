begin;

-- The existing hardened transaction trigger intentionally canonicalizes legacy
-- transactions to Escrow Funded. Unit-priced purchases need the normal manual
-- verification step because inventory must only be consumed after an admin has
-- verified the buyer's payment.
create or replace function private.canonicalize_buyer_transaction_insert()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  listing_row public.listings%rowtype;
  commission_pct numeric;
  canonical_commission bigint;
  requested_quantity integer;
  canonical_amount bigint;
  canonical_unit text;
begin
  if auth.uid() is null or private.has_role(auth.uid(), 'admin'::app_role) then
    return new;
  end if;

  if new.listing_id is null then
    raise exception 'A marketplace transaction requires a listing';
  end if;

  requested_quantity := greatest(coalesce(new.quantity_purchased, 1), 1);

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

  canonical_unit := coalesce(nullif(listing_row.pricing_unit, ''), 'listing');

  if canonical_unit = 'listing' then
    if requested_quantity <> 1 then
      raise exception 'This listing can only be purchased as one complete listing';
    end if;
    canonical_amount := listing_row.price_ngn;
  else
    if requested_quantity > listing_row.batch_quantity then
      raise exception 'Only % unit(s) are currently available for this listing', listing_row.batch_quantity;
    end if;
    canonical_amount := listing_row.price_ngn * requested_quantity;
  end if;

  select coalesce((select s.commission_pct from public.app_settings s where s.id = 1), 12)
    into commission_pct;
  canonical_commission := round((canonical_amount::numeric * coalesce(listing_row.commission_override, commission_pct)) / 100)::bigint;

  new.buyer_id := auth.uid();
  new.breeder_id := listing_row.breeder_id;
  new.listing_name := listing_row.custom_bird_name;
  new.amount_naira := canonical_amount;
  new.calculated_commission := canonical_commission;
  new.quantity_purchased := requested_quantity;
  new.pricing_unit := canonical_unit;
  new.unit_price_naira := listing_row.price_ngn;

  -- Preserve the existing legacy transaction lifecycle. Unit-priced orders
  -- must remain Pending Verification until an admin verifies the receipt.
  new.status := case when canonical_unit = 'listing' then 'Escrow Funded' else 'Pending Verification' end;
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
$$;

revoke all on function private.canonicalize_buyer_transaction_insert() from public;

commit;

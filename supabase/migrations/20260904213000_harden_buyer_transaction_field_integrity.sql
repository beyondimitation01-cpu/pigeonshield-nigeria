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
begin
  -- Only canonicalize normal authenticated marketplace buyers. Privileged
  -- backend/admin transaction creators keep their existing behavior.
  if auth.uid() is null or private.has_role(auth.uid(), 'admin'::app_role) then
    return new;
  end if;

  if new.listing_id is null then
    raise exception 'A marketplace transaction requires a listing';
  end if;

  -- Lock the listing while deriving the transaction snapshot so a concurrent
  -- listing change cannot produce a mismatched seller/price/name/commission.
  select *
    into listing_row
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

  -- These fields are authoritative database snapshots, never buyer input.
  new.buyer_id := auth.uid();
  new.breeder_id := listing_row.breeder_id;
  new.listing_name := listing_row.custom_bird_name;
  new.amount_naira := listing_row.price_ngn;
  new.calculated_commission := canonical_commission;

  -- The initial marketplace state/timestamps are server controlled.
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

  if new.receipt_url is not null then
    new.receipt_uploaded_at := coalesce(new.receipt_uploaded_at, now());
  else
    new.receipt_uploaded_at := null;
  end if;

  new.created_at := now();

  return new;
end;
$$;

revoke all on function private.canonicalize_buyer_transaction_insert() from public;

drop trigger if exists canonicalize_buyer_transaction_insert on public.transactions;
create trigger canonicalize_buyer_transaction_insert
before insert on public.transactions
for each row
execute function private.canonicalize_buyer_transaction_insert();

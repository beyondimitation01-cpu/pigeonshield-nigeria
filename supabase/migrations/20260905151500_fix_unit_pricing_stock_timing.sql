begin;

-- Payment receipts are manually verified by an administrator. Do not consume
-- unit-priced inventory merely because a buyer submitted an unverified order.
-- The original unit-pricing migration remains additive; this migration corrects
-- its stock timing and preserves the legacy listing lifecycle.
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
$$;

revoke all on function private.canonicalize_buyer_transaction_insert() from public;

-- Only verified unit-priced purchases consume inventory. The listing row is
-- locked together with the verification update to prevent overselling.
create or replace function public.verify_payment(_transaction_id uuid)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  tx_row public.transactions%rowtype;
  listing_row public.listings%rowtype;
begin
  if (select auth.uid()) is null or not private.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise exception 'Administrator access required';
  end if;

  select * into tx_row
  from public.transactions
  where id = _transaction_id
    and status = 'Pending Verification'
  for update;

  if not found then
    raise exception 'Payment is not awaiting verification';
  end if;

  if tx_row.listing_id is not null then
    select * into listing_row
    from public.listings
    where id = tx_row.listing_id
    for update;

    if tx_row.pricing_unit in ('each', 'pair') then
      if not found or listing_row.is_active is not true then
        raise exception 'This listing is no longer available';
      end if;
      if tx_row.quantity_purchased > listing_row.batch_quantity then
        raise exception 'Only % unit(s) remain available for this listing', listing_row.batch_quantity;
      end if;

      update public.listings
      set batch_quantity = batch_quantity - tx_row.quantity_purchased,
          is_active = case when batch_quantity - tx_row.quantity_purchased <= 0 then false else is_active end
      where id = tx_row.listing_id;
    end if;
  end if;

  update public.transactions
  set status = 'Escrow Funded'
  where id = _transaction_id and status = 'Pending Verification';
end;
$$;

revoke all on function public.verify_payment(uuid) from PUBLIC, anon;
grant execute on function public.verify_payment(uuid) to authenticated;

create or replace function public.confirm_receipt_and_reveal_pin(_transaction_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  pin text;
  listing uuid;
  unit text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select verification_pin, listing_id, pricing_unit into pin, listing, unit
  from public.transactions
  where id = _transaction_id and buyer_id = (select auth.uid()) and status = 'In Transit'
  for update;
  if not found then raise exception 'Order is not available for receipt confirmation'; end if;
  if pin is null then raise exception 'The seller has not dispatched this order yet'; end if;
  update public.transactions
  set status = 'Ready for Admin Payout', dispute_status = 'None'
  where id = _transaction_id and buyer_id = (select auth.uid());
  -- Legacy listings keep the existing completion behavior. Unit-priced
  -- listings remain active until their verified inventory reaches zero.
  if listing is not null and coalesce(unit, 'listing') = 'listing' then
    update public.listings set is_active = false where id = listing;
  elsif listing is not null then
    update public.listings set is_active = (batch_quantity > 0) where id = listing;
  end if;
  return pin;
end;
$$;

commit;

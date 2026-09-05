begin;

-- Canonical unit-pricing migration.
-- This migration is intentionally additive and preserves legacy whole-listing
-- pricing. Existing listings default to pricing_unit = 'listing', while new
-- listings may use 'each' or 'pair'. Historical transaction amounts are not
-- rewritten.

alter table public.listings
  add column if not exists pricing_unit text not null default 'listing';

alter table public.listings
  drop constraint if exists listings_pricing_unit_check;
alter table public.listings
  add constraint listings_pricing_unit_check
  check (pricing_unit in ('listing', 'each', 'pair'));

alter table public.transactions
  add column if not exists quantity_purchased integer not null default 1,
  add column if not exists pricing_unit text not null default 'listing',
  add column if not exists unit_price_naira bigint;

update public.transactions
set unit_price_naira = amount_naira
where unit_price_naira is null;

alter table public.transactions
  drop constraint if exists transactions_quantity_purchased_check;
alter table public.transactions
  add constraint transactions_quantity_purchased_check
  check (quantity_purchased > 0);

alter table public.transactions
  drop constraint if exists transactions_pricing_unit_check;
alter table public.transactions
  add constraint transactions_pricing_unit_check
  check (pricing_unit in ('listing', 'each', 'pair'));

create or replace function private.canonicalize_buyer_transaction_insert()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  listing_row public.listings%rowtype;
  buyer_profile public.profiles%rowtype;
  commission_pct numeric;
  canonical_commission bigint;
  requested_quantity integer;
  canonical_amount bigint;
  canonical_unit text;
  total_numeric numeric;
begin
  if auth.uid() is null or private.has_role(auth.uid(), 'admin'::app_role) then return new; end if;
  select * into buyer_profile from public.profiles where id = auth.uid();
  if not found then raise exception 'Your marketplace account is not ready for purchases'; end if;
  if buyer_profile.is_banned is true then raise exception 'Your account is not permitted to create purchases'; end if;
  if buyer_profile.is_frozen is true then raise exception 'Your account is temporarily frozen from creating purchases'; end if;
  if buyer_profile.escrow_paused is true then raise exception 'Escrow activity is temporarily paused for your account'; end if;
  if new.listing_id is null then raise exception 'A marketplace transaction requires a listing'; end if;
  requested_quantity := coalesce(new.quantity_purchased, 1);
  if requested_quantity < 1 then raise exception 'Purchase quantity must be at least 1'; end if;
  select * into listing_row from public.listings where id = new.listing_id for update;
  if not found then raise exception 'This listing does not exist'; end if;
  if listing_row.is_active is not true then raise exception 'This listing is no longer available'; end if;
  if listing_row.breeder_id is null then raise exception 'This listing is not available for purchase'; end if;
  if listing_row.breeder_id = auth.uid() then raise exception 'You cannot message or buy your own product'; end if;
  canonical_unit := coalesce(nullif(listing_row.pricing_unit, ''), 'listing');
  if canonical_unit = 'listing' then
    if requested_quantity <> 1 then raise exception 'This listing can only be purchased as one complete listing'; end if;
  elsif requested_quantity > listing_row.batch_quantity then
    raise exception 'Only % unit(s) are currently available for this listing', listing_row.batch_quantity;
  end if;
  total_numeric := listing_row.price_ngn::numeric * requested_quantity::numeric;
  if total_numeric > 9223372036854775807 or total_numeric < -9223372036854775808 then raise exception 'The calculated transaction amount is outside the supported range'; end if;
  canonical_amount := total_numeric::bigint;
  select coalesce((select s.commission_pct from public.app_settings s where s.id = 1), 12) into commission_pct;
  canonical_commission := round((canonical_amount::numeric * coalesce(listing_row.commission_override, commission_pct)) / 100)::bigint;
  new.buyer_id := auth.uid();
  new.breeder_id := listing_row.breeder_id;
  new.listing_name := listing_row.custom_bird_name;
  new.amount_naira := canonical_amount;
  new.calculated_commission := canonical_commission;
  new.quantity_purchased := requested_quantity;
  new.pricing_unit := canonical_unit;
  new.unit_price_naira := listing_row.price_ngn;
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

create or replace function private.prevent_seller_listing_privileged_changes()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare caller_is_admin boolean := false; caller_handle text; caller_verified boolean := false;
begin
  caller_is_admin := auth.uid() is not null and private.has_role(auth.uid(), 'admin'::app_role);
  if caller_is_admin or auth.uid() is null then return new; end if;
  if tg_op = 'insert' then
    select p.public_handle, coalesce(p.is_verified_seller, false) into caller_handle, caller_verified from public.profiles p where p.id = auth.uid();
    if caller_handle is null then raise exception 'A valid seller profile is required to publish a listing'; end if;
    new.id := gen_random_uuid(); new.breeder_id := auth.uid(); new.breeder_handle := caller_handle; new.is_active := true; new.is_featured := false; new.is_mock := false; new.is_verified_seller := caller_verified; new.commission_override := null; new.creation_timestamp := now(); new.expiry_date := now() + interval '7 days';
    return new;
  end if;
  if new.id is distinct from old.id or new.breeder_id is distinct from old.breeder_id or new.breeder_handle is distinct from old.breeder_handle or new.commission_override is distinct from old.commission_override or new.is_featured is distinct from old.is_featured or new.is_verified_seller is distinct from old.is_verified_seller or new.is_mock is distinct from old.is_mock or new.creation_timestamp is distinct from old.creation_timestamp or new.expiry_date is distinct from old.expiry_date then raise exception 'Protected listing fields can only be changed by an administrator'; end if;
  if new.pricing_unit is distinct from old.pricing_unit and exists (select 1 from public.transactions t where t.listing_id = old.id) then raise exception 'Pricing unit cannot be changed after a transaction exists for this listing'; end if;
  if old.is_active = false and new.is_active = true then raise exception 'A deactivated listing cannot be reactivated by a seller'; end if;
  return new;
end;
$$;
revoke all on function private.prevent_seller_listing_privileged_changes() from public;

create or replace function public.verify_payment(_transaction_id uuid)
returns void language plpgsql security invoker set search_path = ''
as $$
declare tx_row public.transactions%rowtype; listing_row public.listings%rowtype;
begin
  if (select auth.uid()) is null or not private.has_role((select auth.uid()), 'admin'::public.app_role) then raise exception 'Administrator access required'; end if;
  select * into tx_row from public.transactions where id = _transaction_id and status = 'Pending Verification' for update;
  if not found then raise exception 'Payment is not awaiting verification'; end if;
  if tx_row.pricing_unit in ('each', 'pair') then
    select * into listing_row from public.listings where id = tx_row.listing_id for update;
    if not found or listing_row.is_active is not true then raise exception 'This listing is no longer available'; end if;
    if tx_row.quantity_purchased < 1 then raise exception 'Transaction quantity is invalid'; end if;
    if tx_row.quantity_purchased > listing_row.batch_quantity then raise exception 'Only % unit(s) remain available for this listing', listing_row.batch_quantity; end if;
    update public.listings set batch_quantity = batch_quantity - tx_row.quantity_purchased, is_active = case when batch_quantity - tx_row.quantity_purchased <= 0 then false else is_active end where id = tx_row.listing_id;
  end if;
  update public.transactions set status = 'Escrow Funded' where id = _transaction_id and status = 'Pending Verification';
end;
$$;
revoke all on function public.verify_payment(uuid) from public, anon;
grant execute on function public.verify_payment(uuid) to authenticated;

create or replace function public.force_mark_delivered(_transaction_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare tx_row public.transactions%rowtype;
begin
  if (select auth.uid()) is null or not private.has_role((select auth.uid()), 'admin'::public.app_role) then raise exception 'Administrator access required'; end if;
  select * into tx_row from public.transactions where id = _transaction_id and status not in ('Ready for Admin Payout','Seller Paid','Refunded to Buyer','Disputed') for update;
  if not found then raise exception 'Order is not active'; end if;
  if tx_row.status = 'Pending Verification' then raise exception 'Payment must be verified before delivery can be marked'; end if;
  update public.transactions set status = 'Ready for Admin Payout', dispute_status = 'None' where id = _transaction_id;
  if tx_row.listing_id is not null then
    if coalesce(tx_row.pricing_unit, 'listing') = 'listing' then update public.listings set is_active = false where id = tx_row.listing_id;
    else update public.listings set is_active = (batch_quantity > 0) where id = tx_row.listing_id; end if;
  end if;
end;
$$;
revoke all on function public.force_mark_delivered(uuid) from public, anon;
grant execute on function public.force_mark_delivered(uuid) to authenticated;

create or replace function public.confirm_receipt_and_reveal_pin(_transaction_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare pin text; listing uuid; unit text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select verification_pin, listing_id, pricing_unit into pin, listing, unit from public.transactions where id = _transaction_id and buyer_id = (select auth.uid()) and status = 'In Transit' for update;
  if not found then raise exception 'Order is not available for receipt confirmation'; end if;
  if pin is null then raise exception 'The seller has not dispatched this order yet'; end if;
  update public.transactions set status = 'Ready for Admin Payout', dispute_status = 'None' where id = _transaction_id and buyer_id = (select auth.uid());
  if listing is not null and coalesce(unit, 'listing') = 'listing' then update public.listings set is_active = false where id = listing;
  elsif listing is not null then update public.listings set is_active = (batch_quantity > 0) where id = listing; end if;
  return pin;
end;
$$;
revoke all on function public.confirm_receipt_and_reveal_pin(uuid) from public, anon;
grant execute on function public.confirm_receipt_and_reveal_pin(uuid) to authenticated;

create or replace function public.get_public_store(input_username text)
returns table(user_id uuid, username text, full_name text, loft_name text, home_state text, avatar_url text, is_verified_seller boolean, is_online boolean, listings jsonb)
language sql security definer stable set search_path = public, pg_temp
as $$
  with resolved as (
    select a.user_id, p.username, p.real_name, p.loft_name, p.home_state, p.avatar_url, p.is_verified_seller, p.is_online
    from public.username_aliases a join public.profiles p on p.id = a.user_id
    where a.username = public.normalize_username(input_username)
    order by a.is_current desc limit 1
  )
  select r.user_id, r.username, r.real_name, r.loft_name, r.home_state, r.avatar_url, r.is_verified_seller, r.is_online,
    coalesce((select jsonb_agg(to_jsonb(x) order by x.is_featured desc, x.is_verified_seller desc, x.creation_timestamp desc)
      from (select l.id,l.slug,l.category_type,l.breeder_id,l.custom_bird_name,l.breed_type,l.gender,l.price_ngn,l.pricing_unit,l.images,l.pedigree_json,l.vaccinated,l.state,l.description,l.batch_quantity,l.is_active,l.creation_timestamp,l.expiry_date,l.is_featured,l.is_verified_seller
        from public.listings l where l.breeder_id = r.user_id and l.is_active = true and l.expiry_date > now()) x), '[]'::jsonb)
  from resolved r;
$$;
grant execute on function public.get_public_store(text) to anon, authenticated;

commit;

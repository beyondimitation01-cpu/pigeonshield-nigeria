begin;

-- Existing listings keep their current transaction semantics. New listings can
-- opt into explicit per-unit pricing without changing historical records.
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

-- Historical transactions remain exactly the same amount-wise, while gaining
-- an explicit legacy snapshot for the newly added fields.
update public.transactions
set unit_price_naira = amount_naira
where unit_price_naira is null;

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

  -- Lock the listing while validating stock and deriving the transaction
  -- snapshot. This makes the stock decrement safe against concurrent buyers.
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
      raise exception 'Only % unit(s) are available for this listing', listing_row.batch_quantity;
    end if;
    canonical_amount := listing_row.price_ngn * requested_quantity;
  end if;

  select coalesce((select s.commission_pct from public.app_settings s where s.id = 1), 12)
    into commission_pct;
  canonical_commission := round((canonical_amount::numeric * coalesce(listing_row.commission_override, commission_pct)) / 100)::bigint;

  -- These fields are authoritative database snapshots, never buyer input.
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

  -- Unit-priced listings consume the exact number of units purchased. Legacy
  -- listings retain their existing stock semantics until explicitly migrated.
  if canonical_unit <> 'listing' then
    update public.listings
    set batch_quantity = batch_quantity - requested_quantity,
        is_active = case when batch_quantity - requested_quantity <= 0 then false else is_active end
    where id = listing_row.id;
  end if;

  return new;
end;
$$;

revoke all on function private.canonicalize_buyer_transaction_insert() from public;

-- Keep the public-store RPC output aligned with the new listing field.
create or replace function public.get_public_store(input_username text)
returns table(user_id uuid, username text, full_name text, loft_name text, home_state text, avatar_url text, is_verified_seller boolean, is_online boolean, listings jsonb)
language sql security definer stable set search_path=public,pg_temp
as $$
  with resolved as (
    select a.user_id, p.username, p.real_name, p.loft_name, p.home_state, p.avatar_url, p.is_verified_seller, p.is_online
    from public.username_aliases a join public.profiles p on p.id=a.user_id
    where a.username=public.normalize_username(input_username)
    order by a.is_current desc limit 1
  )
  select r.user_id,r.username,r.real_name,r.loft_name,r.home_state,r.avatar_url,r.is_verified_seller,r.is_online,
    coalesce((select jsonb_agg(to_jsonb(x) order by x.is_featured desc,x.is_verified_seller desc,x.creation_timestamp desc)
      from (select l.id,l.slug,l.category_type,l.breeder_id,l.custom_bird_name,l.breed_type,l.gender,l.price_ngn,l.pricing_unit,l.images,l.pedigree_json,l.vaccinated,l.state,l.description,l.batch_quantity,l.is_active,l.creation_timestamp,l.expiry_date,l.is_featured,l.is_verified_seller
            from public.listings l where l.breeder_id=r.user_id and l.is_active=true and l.expiry_date>now()) x), '[]'::jsonb)
  from resolved r;
$$;

grant execute on function public.get_public_store(text) to anon,authenticated;

commit;

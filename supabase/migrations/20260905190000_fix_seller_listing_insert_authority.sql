begin;

-- Corrective migration for seller listing creation.
--
-- The earlier unit-pricing migration redefined
-- private.prevent_seller_listing_privileged_changes() and combined INSERT
-- initialization with UPDATE protection. This corrective migration separates
-- those responsibilities so a seller INSERT can never fall through into the
-- UPDATE protection branch.
--
-- Security invariants preserved:
--   * Seller ownership/lifecycle/security fields are DB-authoritative.
--   * Admin/system paths retain privileged control.
--   * Seller UPDATEs cannot mutate protected fields.
--   * Pricing-unit immutability after a transaction is preserved.
--   * Seller reactivation of a deactivated listing remains forbidden.
--   * Existing rows and transaction history are not rewritten.

create or replace function private.initialize_seller_listing()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  caller_handle text;
  caller_verified boolean := false;
begin
  -- Only an authenticated, non-admin seller needs initialization here.
  -- Admin/system callers already supply authoritative values and must retain
  -- their existing behavior.
  if auth.uid() is null or private.has_role(auth.uid(), 'admin'::app_role) then
    return new;
  end if;

  select p.public_handle, coalesce(p.is_verified_seller, false)
    into caller_handle, caller_verified
  from public.profiles p
  where p.id = auth.uid();

  if caller_handle is null or btrim(caller_handle) = '' then
    raise exception 'A valid seller profile is required to publish a listing';
  end if;

  -- id already has a secure database default, but retain a fallback so this
  -- trigger remains correct if the column default is ever changed.
  new.id := coalesce(new.id, gen_random_uuid());
  new.breeder_id := auth.uid();
  new.breeder_handle := caller_handle;
  new.is_active := true;
  new.is_featured := false;
  new.is_mock := false;
  new.is_verified_seller := caller_verified;
  new.commission_override := null;
  new.creation_timestamp := now();
  new.expiry_date := now() + interval '7 days';

  return new;
end;
$$;

revoke all on function private.initialize_seller_listing() from public;

create or replace function private.prevent_seller_listing_privileged_changes()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  -- Admin/system paths retain full control.
  if auth.uid() is null or private.has_role(auth.uid(), 'admin'::app_role) then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.breeder_id is distinct from old.breeder_id
     or new.breeder_handle is distinct from old.breeder_handle
     or new.commission_override is distinct from old.commission_override
     or new.is_featured is distinct from old.is_featured
     or new.is_verified_seller is distinct from old.is_verified_seller
     or new.is_mock is distinct from old.is_mock
     or new.creation_timestamp is distinct from old.creation_timestamp
     or new.expiry_date is distinct from old.expiry_date then
    raise exception 'Protected listing fields can only be changed by an administrator';
  end if;

  -- A seller may retire/deactivate their own listing, but may not reactivate it.
  if old.is_active = false and new.is_active = true then
    raise exception 'A deactivated listing cannot be reactivated by a seller';
  end if;

  -- Once any transaction exists, the pricing unit becomes part of the
  -- transaction's commercial meaning and cannot be changed by the seller.
  if new.pricing_unit is distinct from old.pricing_unit
     and exists (select 1 from public.transactions t where t.listing_id = old.id) then
    raise exception 'Pricing unit cannot be changed after a transaction exists for this listing';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_seller_listing_privileged_changes() from public;

-- Remove the ambiguous combined trigger and install explicit operation-scoped
-- triggers. The initialize trigger name sorts before the slug trigger, so the
-- database-generated listing id exists before slug generation on INSERT.
drop trigger if exists protect_seller_listing_privileged_fields on public.listings;
drop trigger if exists initialize_seller_listing_trg on public.listings;
drop trigger if exists a_initialize_seller_listing_trg on public.listings;

auto_explain: off;

create trigger a_initialize_seller_listing_trg
before insert on public.listings
for each row
execute function private.initialize_seller_listing();

create trigger protect_seller_listing_privileged_fields
before update on public.listings
for each row
execute function private.prevent_seller_listing_privileged_changes();

commit;

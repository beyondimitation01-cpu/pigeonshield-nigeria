create or replace function private.prevent_seller_listing_privileged_changes()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  caller_is_admin boolean := false;
  caller_handle text;
  caller_verified boolean := false;
begin
  caller_is_admin := auth.uid() is not null and private.has_role(auth.uid(), 'admin'::app_role);

  -- Admin/system paths retain full control. Normal authenticated users are
  -- constrained to seller-owned listing data below.
  if caller_is_admin or auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Establish identity and lifecycle/security fields from trusted server data;
    -- never accept these values from a seller-supplied INSERT payload.
    select p.public_handle, coalesce(p.is_verified_seller, false)
      into caller_handle, caller_verified
    from public.profiles p
    where p.id = auth.uid();

    if caller_handle is null then
      raise exception 'A valid seller profile is required to publish a listing';
    end if;

    new.id := gen_random_uuid();
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
  end if;

  -- Seller UPDATE: explicitly protect every platform-controlled/identity field.
  -- Sellers may still edit normal product data and may deactivate a listing.
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

  -- A seller may retire/deactivate their listing, but may not reactivate a
  -- listing once it has been deactivated by the seller/system/admin.
  if old.is_active = false and new.is_active = true then
    raise exception 'A deactivated listing cannot be reactivated by a seller';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_seller_listing_privileged_changes() from public;

drop trigger if exists protect_seller_listing_privileged_fields on public.listings;
create trigger protect_seller_listing_privileged_fields
before insert or update on public.listings
for each row
execute function private.prevent_seller_listing_privileged_changes();

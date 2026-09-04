create or replace function private.prevent_seller_listing_privileged_changes()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if auth.uid() is not null and not private.has_role(auth.uid(), 'admin'::app_role) then
    if new.is_verified_seller is distinct from old.is_verified_seller
       or new.commission_override is distinct from old.commission_override then
      raise exception 'Protected listing fields can only be changed by an administrator';
    end if;

    -- Sellers may retire their own listing, but cannot reactivate a listing
    -- that has already been deactivated by the platform/order/account flows.
    if old.is_active = false and new.is_active = true then
      raise exception 'A deactivated listing cannot be reactivated by a seller';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_seller_listing_privileged_changes() from public;

drop trigger if exists protect_seller_listing_privileged_fields on public.listings;
create trigger protect_seller_listing_privileged_fields
before update on public.listings
for each row
execute function private.prevent_seller_listing_privileged_changes();

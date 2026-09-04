-- Prevent marketplace users from changing privileged account-security flags.
-- Admin-role operations remain allowed; ordinary profile edits remain unchanged.
create or replace function private.prevent_user_security_flag_changes()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if auth.uid() is not null and not private.has_role(auth.uid(), 'admin'::app_role) then
    if new.is_verified_seller is distinct from old.is_verified_seller
       or new.is_banned is distinct from old.is_banned
       or new.is_frozen is distinct from old.is_frozen
       or new.escrow_paused is distinct from old.escrow_paused then
      raise exception 'Protected account security flags can only be changed by an administrator';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_user_security_flag_changes() from public;

drop trigger if exists protect_profile_security_flags on public.profiles;
create trigger protect_profile_security_flags
before update on public.profiles
for each row
execute function private.prevent_user_security_flag_changes();

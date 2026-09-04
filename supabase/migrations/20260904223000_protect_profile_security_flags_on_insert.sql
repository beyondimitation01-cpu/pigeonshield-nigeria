-- Security boundary: ordinary authenticated users may create only an
-- unprivileged initial marketplace profile. Keep the existing signup paths
-- unchanged; omitted security flags continue to receive their false defaults.
-- Admin identities are already prevented from becoming marketplace profiles
-- by prevent_admin_marketplace_profile().

drop policy if exists "insert own profile" on public.profiles;

create policy "insert own profile"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and is_banned = false
  and is_verified_seller = false
  and is_frozen = false
  and escrow_paused = false
);

-- Reconcile the live admin authentication session contract without changing
-- the master passphrase or the application's broad authorization helper.
-- This is intentionally forward-only and idempotent to repair migration drift.

create table if not exists public.admin_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

grant select on public.admin_sessions to authenticated;
grant all on public.admin_sessions to service_role;

alter table public.admin_sessions enable row level security;

drop policy if exists "admin session owner readable" on public.admin_sessions;
create policy "admin session owner readable"
  on public.admin_sessions
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.touch_admin_session()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.admin_sessions
  set last_activity_at = now(),
      expires_at = now() + interval '10 minutes'
  where user_id = auth.uid()
    and exists (
      select 1
      from public.user_roles
      where user_id = auth.uid()
        and role = 'admin'
    )
    and expires_at > now()
    and last_activity_at > now() - interval '10 minutes';

  return found;
end;
$$;

revoke all on function public.touch_admin_session() from public;
grant execute on function public.touch_admin_session() to authenticated, service_role;

notify pgrst, 'reload schema';

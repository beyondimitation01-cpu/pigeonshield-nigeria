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
create policy "admin session owner readable" on public.admin_sessions
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.admin_sessions s on s.user_id = ur.user_id
    where ur.user_id = _user_id
      and ur.role = _role
      and s.expires_at > now()
      and s.last_activity_at > now() - interval '10 minutes'
  )
$$;

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
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
    and expires_at > now()
    and last_activity_at > now() - interval '10 minutes';

  return found;
end;
$$;

revoke all on function public.touch_admin_session() from public;
grant execute on function public.touch_admin_session() to authenticated, service_role;

-- The passphrase verifier is intentionally callable without a marketplace login.
-- The verifier itself only compares against the server-side hash.
revoke execute on function public.verify_admin_passphrase(text) from anon;
grant execute on function public.verify_admin_passphrase(text) to anon, authenticated, service_role;

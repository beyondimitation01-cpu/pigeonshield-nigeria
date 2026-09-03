create extension if not exists pgcrypto;

create schema if not exists admin_secrets;

create table if not exists admin_secrets.passphrase (
  id boolean primary key default true check (id = true),
  passphrase_sha256 text not null check (length(passphrase_sha256) = 64)
);

insert into admin_secrets.passphrase (id, passphrase_sha256)
values (true, '14ac68f5126ffff295ec15dbeeb7d44a54c4c2db31ad316e59102c6d4b4a2616')
on conflict (id) do update
set passphrase_sha256 = excluded.passphrase_sha256;

revoke all on schema admin_secrets from public, anon, authenticated;
revoke all on table admin_secrets.passphrase from public, anon, authenticated;

create or replace function public.verify_admin_passphrase(passphrase text)
returns boolean
language sql
security definer
set search_path = admin_secrets, pg_catalog, extensions
as $$
  select coalesce(
    encode(extensions.digest(passphrase, 'sha256'), 'hex') =
      (select passphrase_sha256 from admin_secrets.passphrase where id = true),
    false
  );
$$;

revoke all on function public.verify_admin_passphrase(text) from public;
grant execute on function public.verify_admin_passphrase(text) to anon, authenticated;

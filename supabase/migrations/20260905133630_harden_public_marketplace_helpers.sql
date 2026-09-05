begin;

create index if not exists listings_breeder_id_marketplace_idx on public.listings(breeder_id);

create or replace function public.normalize_username(value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select left(regexp_replace(lower(trim(coalesce(value,''))), '[^a-z0-9_-]+', '-', 'g'), 32);
$$;

create or replace function public.make_listing_slug(name text, listing_id uuid)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select left(coalesce(nullif(regexp_replace(lower(trim(coalesce(name,''))), '[^a-z0-9]+', '-', 'g'), ''), 'listing') || '-' || substr(replace(listing_id::text, '-', ''), 1, 8), 80);
$$;

create or replace function public.prevent_listing_slug_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.slug is not null and new.slug is distinct from old.slug then
    new.slug := old.slug;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_profile_username_and_alias() from anon, authenticated;

commit;

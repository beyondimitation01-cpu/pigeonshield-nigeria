begin;

alter table public.profiles add column if not exists username text;
alter table public.listings add column if not exists slug text;

create table if not exists public.username_aliases (
  username text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  retired_at timestamptz null
);

create index if not exists username_aliases_user_id_idx on public.username_aliases(user_id);
create index if not exists username_aliases_current_idx on public.username_aliases(is_current);
create unique index if not exists profiles_username_lower_unique_idx on public.profiles (lower(username)) where username is not null and username <> '';
create unique index if not exists listings_slug_unique_idx on public.listings(slug) where slug is not null and slug <> '';

create or replace function public.normalize_username(value text)
returns text language sql immutable
as $$ select left(regexp_replace(lower(trim(coalesce(value,''))), '[^a-z0-9_-]+', '-', 'g'), 32); $$;

create or replace function public.make_listing_slug(name text, listing_id uuid)
returns text language sql immutable
as $$ select left(coalesce(nullif(regexp_replace(lower(trim(coalesce(name,''))), '[^a-z0-9]+', '-', 'g'), ''), 'listing') || '-' || substr(replace(listing_id::text, '-', ''), 1, 8), 80); $$;

with candidates as (
  select p.id, public.normalize_username(p.public_handle) as candidate,
         row_number() over (partition by public.normalize_username(p.public_handle) order by p.created_at, p.id) as rn
  from public.profiles p
  where coalesce(trim(p.public_handle),'') <> ''
)
update public.profiles p
set username = case when c.rn = 1 then c.candidate else left(c.candidate, 23) || '-' || substr(replace(p.id::text,'-',''),1,8) end
from candidates c where p.id=c.id and (p.username is null or p.username='');

insert into public.username_aliases(username,user_id,is_current)
select lower(p.username), p.id, true from public.profiles p
where coalesce(p.username,'') <> ''
on conflict (username) do update set user_id=excluded.user_id, is_current=true, retired_at=null;

create or replace function public.sync_profile_username_and_alias()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare normalized text; prior text;
begin
  normalized := public.normalize_username(coalesce(new.public_handle, new.username));
  if normalized='' then normalized := 'user-' || substr(replace(new.id::text,'-',''),1,8); end if;
  if length(normalized)<3 then normalized := normalized || '-' || substr(replace(new.id::text,'-',''),1,8); end if;
  prior := public.normalize_username(coalesce(old.username, old.public_handle));
  if tg_op='INSERT' or prior is distinct from normalized then
    begin
      insert into public.username_aliases(username,user_id,is_current) values(normalized,new.id,true);
    exception when unique_violation then
      if not exists(select 1 from public.username_aliases a where a.username=normalized and a.user_id=new.id) then
        raise exception 'Username is already taken';
      end if;
    end;
    if prior<>'' and prior<>normalized then
      update public.username_aliases set is_current=false, retired_at=coalesce(retired_at,now()) where username=prior and user_id=new.id;
    end if;
  end if;
  new.username := normalized;
  return new;
end;
$$;

drop trigger if exists sync_profile_username_and_alias_trg on public.profiles;
create trigger sync_profile_username_and_alias_trg before insert or update of public_handle, username on public.profiles for each row execute function public.sync_profile_username_and_alias();

create or replace function public.ensure_listing_slug()
returns trigger language plpgsql set search_path=public,pg_temp
as $$ begin if coalesce(trim(new.slug),'')='' then new.slug:=public.make_listing_slug(new.custom_bird_name,new.id); end if; return new; end; $$;

drop trigger if exists ensure_listing_slug_trg on public.listings;
create trigger ensure_listing_slug_trg before insert or update of custom_bird_name,slug on public.listings for each row execute function public.ensure_listing_slug();

update public.listings set slug=public.make_listing_slug(custom_bird_name,id) where coalesce(trim(slug),'')='';

create or replace function public.prevent_listing_slug_change()
returns trigger language plpgsql
as $$ begin if tg_op='UPDATE' and old.slug is not null and new.slug is distinct from old.slug then new.slug:=old.slug; end if; return new; end; $$;

drop trigger if exists prevent_listing_slug_change_trg on public.listings;
create trigger prevent_listing_slug_change_trg before update of slug on public.listings for each row execute function public.prevent_listing_slug_change();

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
      from (select l.id,l.slug,l.category_type,l.breeder_id,l.custom_bird_name,l.breed_type,l.gender,l.price_ngn,l.images,l.pedigree_json,l.vaccinated,l.state,l.description,l.batch_quantity,l.is_active,l.creation_timestamp,l.expiry_date,l.is_featured,l.is_verified_seller
            from public.listings l where l.breeder_id=r.user_id and l.is_active=true and l.expiry_date>now()) x), '[]'::jsonb)
  from resolved r;
$$;

grant execute on function public.get_public_store(text) to anon,authenticated;

create or replace function public.search_marketplace(search_text text, result_kind text default 'all', result_limit integer default 20, result_offset integer default 0)
returns table(kind text, id text, title text, subtitle text, image_url text, url_key text, username text)
language sql security definer stable set search_path=public,pg_temp
as $$
  with q as (select lower(trim(coalesce(search_text,''))) as term), results as (
    select 'product'::text as kind, l.id::text as id, l.custom_bird_name as title,
           concat_ws(' · ',l.breed_type,l.category_type,l.state) as subtitle,
           l.images[1] as image_url, coalesce(l.slug,l.id::text) as url_key, p.username as username
    from public.listings l join public.profiles p on p.id=l.breeder_id cross join q
    where l.is_active=true and l.expiry_date>now()
      and (q.term='' or lower(concat_ws(' ',l.custom_bird_name,l.breed_type,l.category_type,l.state)) like '%'||q.term||'%')
      and result_kind in ('all','products')
    union all
    select 'store'::text, p.id::text, coalesce(nullif(p.real_name,''),p.username),
           concat_ws(' · ',p.username,p.loft_name,p.home_state), p.avatar_url, p.username, p.username
    from public.profiles p cross join q
    where coalesce(p.username,'')<>''
      and (q.term='' or lower(concat_ws(' ',p.username,p.real_name,p.loft_name,p.home_state)) like '%'||q.term||'%')
      and result_kind in ('all','stores')
  )
  select kind,id,title,subtitle,image_url,url_key,username from results order by kind,title limit greatest(1,least(coalesce(result_limit,20),50)) offset greatest(0,coalesce(result_offset,0));
$$;

grant execute on function public.search_marketplace(text,text,integer,integer) to anon,authenticated;
revoke all on public.username_aliases from anon,authenticated;

commit;

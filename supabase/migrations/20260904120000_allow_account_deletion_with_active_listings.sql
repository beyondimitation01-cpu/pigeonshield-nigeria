create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  if exists (
    select 1
    from public.transactions t
    where (t.buyer_id = uid or t.breeder_id = uid)
      and t.status not in ('Seller Paid', 'Completed', 'Refunded to Buyer')
  ) then
    raise exception 'Account deletion is blocked while you have active or unresolved marketplace transactions. Resolve all outstanding orders, payments, escrow, payouts, refunds, or disputes first.';
  end if;

  update public.transactions
    set buyer_id = null
  where buyer_id = uid;

  update public.listings
    set breeder_id = null,
        breeder_handle = 'Deleted User',
        is_active = false
  where breeder_id = uid;

  update public.app_feedback
    set user_id = null,
        name = 'Deleted User',
        contact = ''
  where user_id = uid;

  delete from auth.users where id = uid;

  if not found then
    raise exception 'Account could not be deleted';
  end if;
end;
$$;

revoke execute on function public.delete_my_account() from public;
revoke execute on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;

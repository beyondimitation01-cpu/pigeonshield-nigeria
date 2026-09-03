-- Remove the admin-only auth identity from marketplace profile data.
-- The Supabase Auth user and its admin role remain intact; only the ordinary
-- marketplace profile is removed. No listings, transactions, messages,
-- notifications, referrals, or auth users are deleted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = 'e00173c9-6034-4235-9cd1-4372fcd1b013'::uuid
      AND public.profiles.public_handle = 'SuperAdmin'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.listings WHERE breeder_id = 'e00173c9-6034-4235-9cd1-4372fcd1b013'::uuid)
       OR EXISTS (SELECT 1 FROM public.transactions WHERE buyer_id = 'e00173c9-6034-4235-9cd1-4372fcd1b013'::uuid OR breeder_id = 'e00173c9-6034-4235-9cd1-4372fcd1b013'::uuid)
       OR EXISTS (SELECT 1 FROM public.messages WHERE from_id = 'e00173c9-6034-4235-9cd1-4372fcd1b013'::uuid OR to_id = 'e00173c9-6034-4235-9cd1-4372fcd1b013'::uuid)
       OR EXISTS (SELECT 1 FROM public.notifications WHERE recipient_id = 'e00173c9-6034-4235-9cd1-4372fcd1b013'::uuid)
       OR EXISTS (SELECT 1 FROM public.referrals WHERE referrer_id = 'e00173c9-6034-4235-9cd1-4372fcd1b013'::uuid OR referred_id = 'e00173c9-6034-4235-9cd1-4372fcd1b013'::uuid) THEN
      RAISE EXCEPTION 'Admin-only profile has marketplace records; aborting profile removal';
    END IF;

    DELETE FROM public.profiles
    WHERE id = 'e00173c9-6034-4235-9cd1-4372fcd1b013'::uuid
      AND public_handle = 'SuperAdmin';
  END IF;
END $$;

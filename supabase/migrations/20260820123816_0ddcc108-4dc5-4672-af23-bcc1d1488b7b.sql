ALTER TABLE public.listings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.listings;
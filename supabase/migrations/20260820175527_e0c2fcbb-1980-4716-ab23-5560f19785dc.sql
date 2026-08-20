DROP FUNCTION IF EXISTS public.purge_mock_listings();

CREATE OR REPLACE FUNCTION public.purge_mock_listings_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.is_mock IS NOT TRUE AND NEW.breeder_id IS NOT NULL THEN
    DELETE FROM public.listings WHERE is_mock = true;
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER purge_mock_listings_after_insert
AFTER INSERT ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.purge_mock_listings_trg();
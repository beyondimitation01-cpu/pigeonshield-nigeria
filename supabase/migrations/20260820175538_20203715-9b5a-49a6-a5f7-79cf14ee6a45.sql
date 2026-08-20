REVOKE ALL ON FUNCTION public.purge_mock_listings_trg() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_mock_listings_trg() FROM anon;
REVOKE ALL ON FUNCTION public.purge_mock_listings_trg() FROM authenticated;
REVOKE ALL ON FUNCTION public.sanitize_feedback() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sanitize_feedback() FROM anon;
REVOKE ALL ON FUNCTION public.sanitize_feedback() FROM authenticated;
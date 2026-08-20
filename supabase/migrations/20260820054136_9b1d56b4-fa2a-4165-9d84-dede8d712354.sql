REVOKE ALL ON FUNCTION public.sanitize_text(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sanitize_listing() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sanitize_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sanitize_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_escrow_amounts() FROM PUBLIC, anon, authenticated;
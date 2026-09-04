-- Enforce uniqueness on the existing profile identity fields without changing
-- their current case-sensitive semantics. Empty loft names remain allowed.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_handle_unique
  ON public.profiles (public_handle);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_loft_name_unique
  ON public.profiles (loft_name)
  WHERE loft_name <> '';

-- Registration needs a narrow availability check because normal profile RLS
-- intentionally prevents users from reading other profiles. This function
-- returns only availability booleans and exposes no profile rows.
CREATE OR REPLACE FUNCTION public.check_registration_name_availability(
  _public_handle text,
  _loft_name text DEFAULT ''
)
RETURNS TABLE(username_taken boolean, loft_name_taken boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE public_handle = coalesce(_public_handle, '')
    ),
    CASE
      WHEN coalesce(_loft_name, '') = '' THEN false
      ELSE EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE loft_name = _loft_name
      )
    END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_registration_name_availability(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_registration_name_availability(text, text) TO anon, authenticated;

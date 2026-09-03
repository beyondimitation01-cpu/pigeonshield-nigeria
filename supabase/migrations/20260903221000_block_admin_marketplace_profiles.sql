-- Defense-in-depth: admin-only Auth identities must never be materialized
-- as marketplace profiles, even if an older deployed edge function attempts it.
CREATE OR REPLACE FUNCTION private.prevent_admin_marketplace_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = NEW.id
      AND role = 'admin'::public.app_role
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_admin_marketplace_profile_trg ON public.profiles;
CREATE TRIGGER prevent_admin_marketplace_profile_trg
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.prevent_admin_marketplace_profile();

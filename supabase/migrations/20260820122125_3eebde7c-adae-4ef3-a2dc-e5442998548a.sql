
DROP VIEW IF EXISTS public.public_profiles;

CREATE TABLE IF NOT EXISTS public.public_profiles (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  public_handle text NOT NULL DEFAULT '',
  avatar_url text NOT NULL DEFAULT '',
  is_verified_seller boolean NOT NULL DEFAULT false,
  is_online boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT ALL ON public.public_profiles TO service_role;
ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public seller cards readable" ON public.public_profiles;
CREATE POLICY "public seller cards readable" ON public.public_profiles
  FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.sync_public_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.public_profiles (id, public_handle, avatar_url, is_verified_seller, is_online, updated_at)
  VALUES (NEW.id, NEW.public_handle, NEW.avatar_url, NEW.is_verified_seller, NEW.is_online, now())
  ON CONFLICT (id) DO UPDATE SET
    public_handle = EXCLUDED.public_handle,
    avatar_url = EXCLUDED.avatar_url,
    is_verified_seller = EXCLUDED.is_verified_seller,
    is_online = EXCLUDED.is_online,
    updated_at = now();
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.sync_public_profile() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_frozen(uuid) FROM anon, public;

DROP TRIGGER IF EXISTS sync_public_profile_trg ON public.profiles;
CREATE TRIGGER sync_public_profile_trg AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_public_profile();

INSERT INTO public.public_profiles (id, public_handle, avatar_url, is_verified_seller, is_online)
SELECT id, public_handle, avatar_url, is_verified_seller, is_online FROM public.profiles
ON CONFLICT (id) DO NOTHING;

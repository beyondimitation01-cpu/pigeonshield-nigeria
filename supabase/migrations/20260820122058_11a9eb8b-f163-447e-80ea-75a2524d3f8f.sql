
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escrow_paused boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.broadcasts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcasts public read" ON public.broadcasts;
CREATE POLICY "broadcasts public read" ON public.broadcasts
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admins create broadcasts" ON public.broadcasts;
CREATE POLICY "admins create broadcasts" ON public.broadcasts
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "admins update broadcasts" ON public.broadcasts;
CREATE POLICY "admins update broadcasts" ON public.broadcasts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "admins delete broadcasts" ON public.broadcasts;
CREATE POLICY "admins delete broadcasts" ON public.broadcasts
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_broadcasts_updated_at ON public.broadcasts;
CREATE TRIGGER update_broadcasts_updated_at BEFORE UPDATE ON public.broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_frozen(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_frozen) $$;

DROP POLICY IF EXISTS "breeders create own listings" ON public.listings;
CREATE POLICY "breeders create own listings" ON public.listings
  FOR INSERT TO authenticated
  WITH CHECK (breeder_id = auth.uid() AND NOT public.is_frozen(auth.uid()));

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
  SELECT id, public_handle, avatar_url, is_verified_seller, is_online
  FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 1) Hide phone_number from the publicly readable seller cards (column-level grants)
REVOKE SELECT ON public.public_profiles FROM anon, authenticated;
GRANT SELECT (id, public_handle, avatar_url, is_verified_seller, is_online, updated_at, full_name, loft_name)
  ON public.public_profiles TO anon, authenticated;
GRANT ALL ON public.public_profiles TO service_role;

-- Signed-in users can look up a seller phone on demand
CREATE OR REPLACE FUNCTION public.get_seller_phone(_seller_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL
              ELSE (SELECT pp.phone_number FROM public.public_profiles pp WHERE pp.id = _seller_id)
         END;
$$;

REVOKE ALL ON FUNCTION public.get_seller_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_phone(uuid) TO authenticated;

-- 2) Scope listing-photos reads to owners, admins, or photos of live listings
DROP POLICY IF EXISTS "listing photos readable by signed-in users" ON storage.objects;

CREATE POLICY "listing photos readable when live or owned"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'listing-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.is_active AND l.expiry_date > now()
        AND EXISTS (SELECT 1 FROM unnest(l.images) img WHERE img LIKE '%' || storage.objects.name || '%')
    )
  )
);
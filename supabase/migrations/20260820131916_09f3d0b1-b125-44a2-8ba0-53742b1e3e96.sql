
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION private.is_frozen(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT is_frozen FROM public.profiles WHERE id = _user_id), false) $$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_frozen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_frozen(uuid) TO authenticated, service_role;

-- Recreate every policy against the private helpers.
DROP POLICY "own roles readable" ON public.user_roles;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT
  USING ((user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "own profile readable" ON public.profiles;
CREATE POLICY "own profile readable" ON public.profiles FOR SELECT
  USING ((id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "update own profile" ON public.profiles;
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE
  USING ((id = auth.uid()) OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK ((id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "admins set commission" ON public.app_settings;
CREATE POLICY "admins set commission" ON public.app_settings FOR UPDATE
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY "breeders or admins update listings" ON public.listings;
CREATE POLICY "breeders or admins update listings" ON public.listings FOR UPDATE
  USING ((breeder_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK ((breeder_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "breeders or admins delete listings" ON public.listings;
CREATE POLICY "breeders or admins delete listings" ON public.listings FOR DELETE
  USING ((breeder_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "breeders create own listings" ON public.listings;
CREATE POLICY "breeders create own listings" ON public.listings FOR INSERT
  WITH CHECK ((breeder_id = auth.uid()) AND (NOT private.is_frozen(auth.uid())));

DROP POLICY "parties read own transactions" ON public.transactions;
CREATE POLICY "parties read own transactions" ON public.transactions FOR SELECT
  USING ((buyer_id = auth.uid()) OR (breeder_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "parties update own transactions" ON public.transactions;
CREATE POLICY "parties update own transactions" ON public.transactions FOR UPDATE
  USING ((buyer_id = auth.uid()) OR (breeder_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK ((buyer_id = auth.uid()) OR (breeder_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "buyer or admin reads passcode" ON public.transaction_passcodes;
CREATE POLICY "buyer or admin reads passcode" ON public.transaction_passcodes FOR SELECT
  USING ((buyer_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "participants read messages" ON public.messages;
CREATE POLICY "participants read messages" ON public.messages FOR SELECT
  USING ((from_id = auth.uid()) OR (to_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "participants read referrals" ON public.referrals;
CREATE POLICY "participants read referrals" ON public.referrals FOR SELECT
  USING ((referrer_id = auth.uid()) OR (referred_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "admins create broadcasts" ON public.broadcasts;
CREATE POLICY "admins create broadcasts" ON public.broadcasts FOR INSERT
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY "admins update broadcasts" ON public.broadcasts;
CREATE POLICY "admins update broadcasts" ON public.broadcasts FOR UPDATE
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY "admins delete broadcasts" ON public.broadcasts;
CREATE POLICY "admins delete broadcasts" ON public.broadcasts FOR DELETE
  USING (private.has_role(auth.uid(), 'admin'));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_frozen(uuid);

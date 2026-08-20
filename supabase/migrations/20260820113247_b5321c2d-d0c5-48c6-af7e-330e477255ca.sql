ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS whatsapp_alert_number text NOT NULL DEFAULT '2348139049440';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified_seller boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_code text NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key ON public.profiles (referral_code);

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_verified_seller boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL UNIQUE,
  referral_code text NOT NULL,
  credits integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_no_self CHECK (referrer_id <> referred_id)
);

GRANT SELECT, INSERT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants read referrals" ON public.referrals;
CREATE POLICY "participants read referrals" ON public.referrals
  FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR referred_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "referred user records referral" ON public.referrals;
CREATE POLICY "referred user records referral" ON public.referrals
  FOR INSERT TO authenticated
  WITH CHECK (referred_id = auth.uid());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS update_referrals_updated_at ON public.referrals;
CREATE TRIGGER update_referrals_updated_at BEFORE UPDATE ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.referral_credit_totals
WITH (security_invoker = true) AS
  SELECT referrer_id, count(*)::bigint AS referred_count, coalesce(sum(credits), 0)::bigint AS total_credits
  FROM public.referrals GROUP BY referrer_id;

GRANT SELECT ON public.referral_credit_totals TO authenticated;

CREATE OR REPLACE VIEW public.chat_threads
WITH (security_invoker = true) AS
  SELECT
    m.listing_id,
    least(m.from_id, m.to_id) AS participant_a,
    greatest(m.from_id, m.to_id) AS participant_b,
    count(*)::bigint AS message_count,
    max(m.created_at) AS last_message_at
  FROM public.messages m
  GROUP BY m.listing_id, least(m.from_id, m.to_id), greatest(m.from_id, m.to_id);

GRANT SELECT ON public.chat_threads TO authenticated;
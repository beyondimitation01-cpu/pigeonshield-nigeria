CREATE OR REPLACE FUNCTION public.resolve_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_id uuid;
BEGIN
  NEW.referral_code := upper(btrim(coalesce(NEW.referral_code, '')));
  SELECT p.id INTO ref_id FROM public.profiles p WHERE p.referral_code = NEW.referral_code;
  IF ref_id IS NULL THEN
    RAISE EXCEPTION 'Unknown referral code';
  END IF;
  IF ref_id = NEW.referred_id THEN
    RAISE EXCEPTION 'Self referral not allowed';
  END IF;
  NEW.referrer_id := ref_id;
  NEW.credits := 1;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_referral() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS resolve_referral_trg ON public.referrals;
CREATE TRIGGER resolve_referral_trg BEFORE INSERT ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.resolve_referral();
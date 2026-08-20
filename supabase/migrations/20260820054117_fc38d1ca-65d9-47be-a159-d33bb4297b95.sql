-- 1. Server-side sanitation of user text
CREATE OR REPLACE FUNCTION public.sanitize_text(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(v, ''), '<[^>]*>', '', 'g'),
          '(?i)(javascript:|data:text/html|on[a-z]+\s*=)', '', 'g'),
        '[\x00-\x08\x0b\x0c\x0e-\x1f]', '', 'g')
    ), '')
$$;

CREATE OR REPLACE FUNCTION public.sanitize_listing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.custom_bird_name := left(coalesce(public.sanitize_text(NEW.custom_bird_name), 'Untitled listing'), 120);
  NEW.description := left(coalesce(public.sanitize_text(NEW.description), ''), 2000);
  NEW.breed_type := left(coalesce(public.sanitize_text(NEW.breed_type), ''), 120);
  NEW.state := left(coalesce(public.sanitize_text(NEW.state), ''), 60);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_listing_trg ON public.listings;
CREATE TRIGGER sanitize_listing_trg
BEFORE INSERT OR UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.sanitize_listing();

CREATE OR REPLACE FUNCTION public.sanitize_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.body := left(coalesce(public.sanitize_text(NEW.body), ''), 1000);
  IF NEW.body = '' THEN
    RAISE EXCEPTION 'Message body is empty after sanitation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_message_trg ON public.messages;
CREATE TRIGGER sanitize_message_trg
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.sanitize_message();

CREATE OR REPLACE FUNCTION public.sanitize_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.real_name := left(coalesce(public.sanitize_text(NEW.real_name), ''), 120);
  NEW.public_handle := left(coalesce(public.sanitize_text(NEW.public_handle), 'Anonymous'), 60);
  NEW.phone_number := left(coalesce(regexp_replace(coalesce(NEW.phone_number,''), '[^0-9+]', '', 'g'), ''), 20);
  NEW.account_number := left(coalesce(regexp_replace(coalesce(NEW.account_number,''), '[^0-9]', '', 'g'), ''), 20);
  NEW.bank_name := left(coalesce(public.sanitize_text(NEW.bank_name), ''), 80);
  NEW.home_state := left(coalesce(public.sanitize_text(NEW.home_state), ''), 60);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_profile_trg ON public.profiles;
CREATE TRIGGER sanitize_profile_trg
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sanitize_profile();

-- 2. Escrow money is recomputed from the database, never trusted from the browser
CREATE OR REPLACE FUNCTION public.enforce_escrow_amounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  l public.listings%ROWTYPE;
  pct numeric;
BEGIN
  SELECT * INTO l FROM public.listings WHERE id = NEW.listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing does not exist';
  END IF;
  IF l.is_active IS NOT TRUE OR l.expiry_date <= now() THEN
    RAISE EXCEPTION 'Listing is no longer available';
  END IF;

  SELECT coalesce(l.commission_override, s.commission_pct, 12) INTO pct
  FROM public.app_settings s WHERE s.id = 1;

  NEW.breeder_id := l.breeder_id;
  NEW.listing_name := l.custom_bird_name;
  NEW.amount_naira := l.price_ngn;
  NEW.calculated_commission := round(l.price_ngn * pct / 100.0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_escrow_amounts_trg ON public.transactions;
CREATE TRIGGER enforce_escrow_amounts_trg
BEFORE INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_escrow_amounts();

-- 3. Brute-force lockout state for the admin master password
CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
  user_id uuid PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_login_attempts TO service_role;
ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: only the server (service role) may read or write lockout state.
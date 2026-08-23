ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS loft_name text NOT NULL DEFAULT '';

ALTER TABLE public.public_profiles ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';
ALTER TABLE public.public_profiles ADD COLUMN IF NOT EXISTS loft_name text NOT NULL DEFAULT '';
ALTER TABLE public.public_profiles ADD COLUMN IF NOT EXISTS phone_number text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.sanitize_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.real_name := left(coalesce(public.sanitize_text(NEW.real_name), ''), 120);
  NEW.loft_name := left(coalesce(public.sanitize_text(NEW.loft_name), ''), 120);
  NEW.public_handle := left(coalesce(public.sanitize_text(NEW.public_handle), 'Anonymous'), 60);
  NEW.phone_number := left(coalesce(regexp_replace(coalesce(NEW.phone_number,''), '[^0-9+]', '', 'g'), ''), 20);
  NEW.account_number := left(coalesce(regexp_replace(coalesce(NEW.account_number,''), '[^0-9]', '', 'g'), ''), 20);
  NEW.bank_name := left(coalesce(public.sanitize_text(NEW.bank_name), ''), 80);
  NEW.home_state := left(coalesce(public.sanitize_text(NEW.home_state), ''), 60);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_public_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.public_profiles (id, public_handle, full_name, loft_name, phone_number, avatar_url, is_verified_seller, is_online, updated_at)
  VALUES (NEW.id, NEW.public_handle, NEW.real_name, NEW.loft_name, NEW.phone_number, NEW.avatar_url, NEW.is_verified_seller, NEW.is_online, now())
  ON CONFLICT (id) DO UPDATE SET
    public_handle = EXCLUDED.public_handle,
    full_name = EXCLUDED.full_name,
    loft_name = EXCLUDED.loft_name,
    phone_number = EXCLUDED.phone_number,
    avatar_url = EXCLUDED.avatar_url,
    is_verified_seller = EXCLUDED.is_verified_seller,
    is_online = EXCLUDED.is_online,
    updated_at = now();
  RETURN NEW;
END; $function$;
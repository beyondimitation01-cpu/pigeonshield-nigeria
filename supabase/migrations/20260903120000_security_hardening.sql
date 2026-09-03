alter table admin_secrets.passphrase enable row level security;
CREATE POLICY "deny API access to admin passphrase" ON admin_secrets.passphrase
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
-- Production security hardening applied to the external Supabase project.
-- Keep this migration in source control so the live security posture is reproducible.

REVOKE EXECUTE ON FUNCTION public.confirm_receipt_and_reveal_pin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dispatch_transaction(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.force_mark_delivered(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_admin_passphrase(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_admin_passphrase(text) TO authenticated, service_role;

ALTER VIEW public.chat_threads SET (security_invoker = true);
ALTER VIEW public.referral_credit_totals SET (security_invoker = true);

DROP POLICY IF EXISTS "transactions delivery state controlled by handover" ON public.transactions;

REVOKE SELECT ON TABLE public.public_profiles FROM anon, authenticated;
GRANT SELECT (id, public_handle, avatar_url, is_verified_seller, is_online, updated_at, full_name, loft_name)
  ON TABLE public.public_profiles TO anon, authenticated;

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[]
WHERE id IN ('avatars','listing-photos');

CREATE OR REPLACE FUNCTION public.send_message(_conversation_id uuid, _listing_id uuid, _to_id uuid, _body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  message_id uuid;
  recent_count integer;
BEGIN
  IF auth.uid() IS NULL OR length(trim(_body)) = 0 OR length(_body) > 4000 THEN
    RAISE EXCEPTION 'Message body must contain 1 to 4000 characters';
  END IF;
  IF _to_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot message or buy your own product';
  END IF;
  IF _listing_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.listings WHERE id = _listing_id AND breeder_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You cannot message or buy your own product';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation_id
      AND (
        (c.participant_a = auth.uid() AND c.participant_b = _to_id)
        OR (c.participant_b = auth.uid() AND c.participant_a = _to_id)
      )
  ) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;
  SELECT count(*)::integer INTO recent_count
  FROM public.messages
  WHERE from_id = auth.uid() AND created_at > now() - interval '1 minute';
  IF recent_count >= 30 THEN
    RAISE EXCEPTION 'Message rate limit exceeded. Please wait a moment and try again.';
  END IF;
  INSERT INTO public.messages (conversation_id, listing_id, from_id, to_id, body)
  VALUES (_conversation_id, _listing_id, auth.uid(), _to_id, trim(_body))
  RETURNING id INTO message_id;
  RETURN message_id;
END;
$function$;

-- PigeonShield chat retention: every message expires 30 hours after creation.
-- Expired chat records are deleted; marketplace financial/escrow records are untouched.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE public.messages
SET expires_at = created_at + interval '30 hours'
WHERE expires_at IS NULL;

ALTER TABLE public.messages
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 hours');

ALTER TABLE public.messages
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS messages_expires_at_idx
  ON public.messages (expires_at);

CREATE OR REPLACE FUNCTION public.purge_expired_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH expired AS (
    SELECT id
    FROM public.messages
    WHERE expires_at <= now()
    ORDER BY expires_at
    LIMIT 500
  )
  DELETE FROM public.messages m
  USING expired e
  WHERE m.id = e.id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_messages() TO service_role;

CREATE OR REPLACE FUNCTION public.send_message(
  _conversation_id uuid,
  _listing_id uuid,
  _to_id uuid,
  _body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  message_id uuid;
BEGIN
  PERFORM public.purge_expired_messages();

  IF length(trim(_body)) = 0 OR length(_body) > 4000 THEN
    RAISE EXCEPTION 'Message body must contain 1 to 4000 characters';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation_id
      AND ((c.participant_a = auth.uid() AND c.participant_b = _to_id)
        OR (c.participant_b = auth.uid() AND c.participant_a = _to_id))
  ) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;

  INSERT INTO public.messages (conversation_id, listing_id, from_id, to_id, body)
  VALUES (_conversation_id, _listing_id, auth.uid(), _to_id, trim(_body))
  RETURNING id INTO message_id;
  RETURN message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_message(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, uuid, uuid, text) TO authenticated;

DROP POLICY IF EXISTS "participants read messages" ON public.messages;
CREATE POLICY "participants read messages" ON public.messages FOR SELECT TO authenticated
  USING (
    expires_at > now()
    AND (
      from_id = auth.uid()
      OR to_id = auth.uid()
      OR private.has_role(auth.uid(), 'admin')
    )
  );

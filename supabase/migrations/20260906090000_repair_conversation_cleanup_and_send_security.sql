-- Repair messaging lifecycle without changing the frontend contract.
-- 1) A conversation shell created immediately before the first message must not
--    be eligible for 5-minute cleanup while it is being used.
-- 2) send_message must not run destructive housekeeping before inserting.
-- 3) Restore the security checks that were overwritten by the 30-hour expiry migration.
-- 4) Keep 30-hour message expiry and scheduled cleanup intact.

CREATE INDEX IF NOT EXISTS conversations_updated_at_idx
  ON public.conversations (updated_at);

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(_other_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conversation_id uuid;
BEGIN
  IF auth.uid() IS NULL OR _other_id IS NULL OR auth.uid() = _other_id THEN
    RAISE EXCEPTION 'A conversation requires two different authenticated users';
  END IF;

  -- Touch an existing conversation as part of the same transaction so the
  -- scheduled cleanup cannot delete an old empty shell between this call and
  -- the subsequent send_message() call.
  INSERT INTO public.conversations (participant_a, participant_b, updated_at)
  VALUES (least(auth.uid(), _other_id), greatest(auth.uid(), _other_id), now())
  ON CONFLICT (participant_a, participant_b) DO UPDATE
    SET updated_at = now()
  RETURNING id INTO conversation_id;

  RETURN conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated, service_role;

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

  -- Conversation shells are disposable only after they have been idle for at
  -- least 30 hours. Fresh shells created for an in-progress first message are
  -- therefore protected from the scheduled cleanup race.
  DELETE FROM public.conversations c
  WHERE c.updated_at <= now() - interval '30 hours'
    AND NOT EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.conversation_id = c.id
    );

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
  recent_count integer;
BEGIN
  IF auth.uid() IS NULL OR length(trim(_body)) = 0 OR length(_body) > 4000 THEN
    RAISE EXCEPTION 'Message body must contain 1 to 4000 characters';
  END IF;

  IF _to_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot message or buy your own product';
  END IF;

  IF _listing_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.listings
    WHERE id = _listing_id
      AND breeder_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You cannot message or buy your own product';
  END IF;

  IF _listing_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.listings
    WHERE id = _listing_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'This listing is no longer available';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = _conversation_id
      AND (
        (c.participant_a = auth.uid() AND c.participant_b = _to_id)
        OR (c.participant_b = auth.uid() AND c.participant_a = _to_id)
      )
  ) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;

  SELECT count(*)::integer
  INTO recent_count
  FROM public.messages
  WHERE from_id = auth.uid()
    AND created_at > now() - interval '1 minute';

  IF recent_count >= 30 THEN
    RAISE EXCEPTION 'Message rate limit exceeded. Please wait a moment and try again.';
  END IF;

  INSERT INTO public.messages (conversation_id, listing_id, from_id, to_id, body)
  VALUES (_conversation_id, _listing_id, auth.uid(), _to_id, trim(_body))
  RETURNING id INTO message_id;

  RETURN message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_message(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, uuid, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

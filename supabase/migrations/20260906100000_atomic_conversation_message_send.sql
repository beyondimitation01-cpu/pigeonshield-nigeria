-- Make user-to-user messaging server-authoritative.
-- A single RPC resolves/creates the conversation and inserts the message.
-- Existing participant checks, RLS, and message expiry protections remain intact.

CREATE OR REPLACE FUNCTION public.send_conversation_message(
  _other_id uuid,
  _listing_id uuid,
  _body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conversation_id uuid;
  message_id uuid;
  sender_id uuid := auth.uid();
BEGIN
  IF sender_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to send a message.';
  END IF;

  IF _other_id IS NULL OR sender_id = _other_id THEN
    RAISE EXCEPTION 'A conversation requires two different authenticated users';
  END IF;

  IF length(trim(_body)) = 0 OR length(_body) > 4000 THEN
    RAISE EXCEPTION 'Message body must contain 1 to 4000 characters';
  END IF;

  IF _listing_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.listings
    WHERE id = _listing_id
      AND breeder_id = sender_id
  ) THEN
    RAISE EXCEPTION 'You cannot message or buy your own product';
  END IF;

  PERFORM public.purge_expired_messages();

  INSERT INTO public.conversations (participant_a, participant_b)
  VALUES (least(sender_id, _other_id), greatest(sender_id, _other_id))
  ON CONFLICT (participant_a, participant_b) DO UPDATE
    SET updated_at = public.conversations.updated_at
  RETURNING id INTO conversation_id;

  IF conversation_id IS NULL THEN
    SELECT c.id
      INTO conversation_id
    FROM public.conversations c
    WHERE c.participant_a = least(sender_id, _other_id)
      AND c.participant_b = greatest(sender_id, _other_id);
  END IF;

  IF conversation_id IS NULL THEN
    RAISE EXCEPTION 'Could not open conversation.';
  END IF;

  -- Re-check the exact participant relationship before the insert.
  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = conversation_id
      AND (
        (c.participant_a = sender_id AND c.participant_b = _other_id)
        OR (c.participant_b = sender_id AND c.participant_a = _other_id)
      )
  ) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;

  INSERT INTO public.messages (conversation_id, listing_id, from_id, to_id, body)
  VALUES (conversation_id, _listing_id, sender_id, _other_id, trim(_body))
  RETURNING id INTO message_id;

  RETURN conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_conversation_message(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_conversation_message(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

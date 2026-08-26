-- Repair the conversation migration for environments where the original RPC
-- was not exposed to PostgREST or the migration was only partially applied.
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_distinct_participants CHECK (participant_a < participant_b),
  CONSTRAINT conversations_unique_participants UNIQUE (participant_a, participant_b)
);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE;

INSERT INTO public.conversations (participant_a, participant_b)
SELECT DISTINCT least(from_id, to_id), greatest(from_id, to_id)
FROM public.messages
WHERE from_id <> to_id
ON CONFLICT (participant_a, participant_b) DO NOTHING;

UPDATE public.messages m
SET conversation_id = c.id
FROM public.conversations c
WHERE c.participant_a = least(m.from_id, m.to_id)
  AND c.participant_b = greatest(m.from_id, m.to_id)
  AND m.conversation_id IS NULL;

UPDATE public.notifications n
SET conversation_id = m.conversation_id
FROM public.messages m
WHERE m.id = n.message_id AND n.conversation_id IS NULL;

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;

DROP POLICY IF EXISTS "participants read conversations" ON public.conversations;
CREATE POLICY "participants read conversations" ON public.conversations FOR SELECT TO authenticated
  USING (participant_a = auth.uid() OR participant_b = auth.uid() OR private.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(_other_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  conversation_id uuid;
BEGIN
  IF auth.uid() IS NULL OR _other_id IS NULL OR auth.uid() = _other_id THEN
    RAISE EXCEPTION 'A conversation requires two different authenticated users';
  END IF;

  INSERT INTO public.conversations (participant_a, participant_b)
  VALUES (least(auth.uid(), _other_id), greatest(auth.uid(), _other_id))
  ON CONFLICT (participant_a, participant_b) DO NOTHING
  RETURNING id INTO conversation_id;

  IF conversation_id IS NULL THEN
    SELECT id INTO conversation_id
    FROM public.conversations
    WHERE participant_a = least(auth.uid(), _other_id)
      AND participant_b = greatest(auth.uid(), _other_id);
  END IF;
  RETURN conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.messages
  SET read_at = now()
  WHERE conversation_id = _conversation_id AND to_id = auth.uid() AND read_at IS NULL;

  UPDATE public.notifications
  SET read_at = now()
  WHERE conversation_id = _conversation_id AND recipient_id = auth.uid() AND read_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.touch_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET updated_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_touch_conversation_trg ON public.messages;
CREATE TRIGGER messages_touch_conversation_trg
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation();

CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, message_id, listing_id, conversation_id)
  VALUES (NEW.to_id, NEW.id, NEW.listing_id, NEW.conversation_id)
  ON CONFLICT (message_id) DO UPDATE SET conversation_id = EXCLUDED.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_notification_trg ON public.messages;
CREATE TRIGGER message_notification_trg
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.create_message_notification();

CREATE OR REPLACE FUNCTION public.send_message(
  _conversation_id uuid,
  _listing_id uuid,
  _to_id uuid,
  _body text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  message_id uuid;
BEGIN
  IF auth.uid() IS NULL OR length(trim(_body)) = 0 OR length(_body) > 4000 THEN
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

GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, uuid, uuid, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'message',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants read messages" ON public.messages;
CREATE POLICY "participants read messages" ON public.messages FOR SELECT TO authenticated
  USING (from_id = auth.uid() OR to_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "senders create messages" ON public.messages;
CREATE POLICY "participants create messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    from_id = auth.uid()
    AND from_id <> to_id
    AND (
      (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.breeder_id = to_id))
      OR EXISTS (
        SELECT 1 FROM public.listings l
        WHERE l.id = listing_id
          AND l.breeder_id = from_id
          AND EXISTS (
            SELECT 1 FROM public.messages previous
            WHERE previous.listing_id = listing_id
              AND previous.from_id = to_id
              AND previous.to_id = from_id
          )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, message_id, listing_id)
  VALUES (NEW.to_id, NEW.id, NEW.listing_id)
  ON CONFLICT (message_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_notification_trg ON public.messages;
CREATE TRIGGER message_notification_trg
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.create_message_notification();

DROP POLICY IF EXISTS "recipients read notifications" ON public.notifications;
CREATE POLICY "recipients read notifications" ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.mark_notification_read(_notification_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notifications
  SET read_at = now()
  WHERE id = _notification_id AND recipient_id = auth.uid() AND read_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_messages_read(_listing_id uuid, _other_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.messages
  SET read_at = now()
  WHERE listing_id = _listing_id
    AND to_id = auth.uid()
    AND from_id = _other_id
    AND read_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.mark_messages_read(uuid, uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
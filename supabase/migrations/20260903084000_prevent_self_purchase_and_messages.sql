-- Block buyers from messaging or purchasing their own listings.
-- This is intentionally additive and does not alter existing data.
DROP POLICY IF EXISTS "participants create messages" ON public.messages;
CREATE POLICY "participants create messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    from_id = (select auth.uid())
    AND from_id <> to_id
    AND (
      listing_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.listings l
        WHERE l.id = messages.listing_id
          AND l.breeder_id = (select auth.uid())
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (
          (c.participant_a = messages.from_id AND c.participant_b = messages.to_id)
          OR (c.participant_b = messages.from_id AND c.participant_a = messages.to_id)
        )
    )
  );

DROP POLICY IF EXISTS "buyers create transactions" ON public.transactions;
CREATE POLICY "buyers create transactions" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = (select auth.uid())
    AND buyer_id IS DISTINCT FROM breeder_id
    AND (
      listing_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.listings l
        WHERE l.id = transactions.listing_id
          AND l.breeder_id = (select auth.uid())
      )
    )
  );

-- send_message is SECURITY DEFINER, so enforce the same ownership rule inside
-- the RPC rather than relying on RLS alone.
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
AS $function$
DECLARE message_id uuid;
BEGIN
  IF auth.uid() IS NULL OR length(trim(_body)) = 0 OR length(_body) > 4000 THEN
    RAISE EXCEPTION 'Message body must contain 1 to 4000 characters';
  END IF;
  IF _to_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot message or buy your own product';
  END IF;
  IF _listing_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.listings
    WHERE id = _listing_id AND breeder_id = auth.uid()
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
  INSERT INTO public.messages (conversation_id, listing_id, from_id, to_id, body)
  VALUES (_conversation_id, _listing_id, auth.uid(), _to_id, trim(_body))
  RETURNING id INTO message_id;
  RETURN message_id;
END;
$function$;
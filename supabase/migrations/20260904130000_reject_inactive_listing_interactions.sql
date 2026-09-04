-- Reject purchase and message creation when the referenced listing is inactive.
-- Preserve all existing self-interaction protections and transaction/message behavior.

CREATE OR REPLACE FUNCTION public.prevent_self_listing_interaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
    IF NEW.buyer_id IS NOT NULL AND NEW.breeder_id IS NOT NULL
       AND NEW.buyer_id = NEW.breeder_id THEN
      RAISE EXCEPTION 'You cannot message or buy your own product';
    END IF;

    IF NEW.listing_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = NEW.listing_id
        AND l.breeder_id = NEW.buyer_id
    ) THEN
      RAISE EXCEPTION 'You cannot message or buy your own product';
    END IF;

    IF NEW.listing_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = NEW.listing_id
        AND l.is_active = true
    ) THEN
      RAISE EXCEPTION 'This listing is no longer available';
    END IF;
  ELSIF TG_TABLE_NAME = 'messages' THEN
    IF NEW.from_id = NEW.to_id THEN
      RAISE EXCEPTION 'You cannot message or buy your own product';
    END IF;

    IF NEW.listing_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = NEW.listing_id
        AND l.breeder_id = NEW.from_id
    ) THEN
      RAISE EXCEPTION 'You cannot message or buy your own product';
    END IF;

    IF NEW.listing_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = NEW.listing_id
        AND l.is_active = true
    ) THEN
      RAISE EXCEPTION 'This listing is no longer available';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- send_message is SECURITY DEFINER, so enforce the inactive-listing rule inside
-- the RPC as well as through the trigger on direct message inserts.
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
DECLARE recent_count integer;
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

  IF _listing_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.listings
    WHERE id = _listing_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'This listing is no longer available';
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
$function$;
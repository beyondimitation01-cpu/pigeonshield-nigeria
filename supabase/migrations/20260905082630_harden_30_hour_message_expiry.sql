-- Enforce the 30-hour lifetime even for direct table INSERTs.
CREATE OR REPLACE FUNCTION public.enforce_message_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.created_at := now();
  NEW.expires_at := NEW.created_at + interval '30 hours';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_enforce_expiry_trg ON public.messages;
CREATE TRIGGER messages_enforce_expiry_trg
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_expiry();

-- Empty conversation shells are not useful to users once their messages expire.
-- Keep the lightweight conversation record only while at least one message exists.
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

  DELETE FROM public.conversations c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.conversation_id = c.id
  );

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_message_expiry() FROM PUBLIC, anon, authenticated;

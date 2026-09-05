-- Idempotent retry of the notification event-key arbiter repair.
-- Kept as a separate forward-only migration because this repair was retried
-- against the live project; all statements are safe when the target index
-- already exists.
DROP INDEX IF EXISTS public.notifications_event_key_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_unique_idx
  ON public.notifications (event_key);

NOTIFY pgrst, 'reload schema';

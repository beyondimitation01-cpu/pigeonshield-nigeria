-- The existing event_key idempotency index was partial, while notification
-- writers use ON CONFLICT (event_key). A normal unique index is the correct
-- arbiter: PostgreSQL permits multiple NULL values, so message notifications
-- with a NULL event_key remain unaffected while non-NULL event keys become
-- safely idempotent.
DROP INDEX IF EXISTS public.notifications_event_key_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_unique_idx
  ON public.notifications (event_key);

NOTIFY pgrst, 'reload schema';

-- Restore the intended recipient ownership boundary for ordinary notifications.
-- Admin operational notifications already have their own admin_notifications table;
-- admins do not need broad read access to every user's personal notifications.
-- Keep this as a forward migration so existing notification history is preserved.

DROP POLICY IF EXISTS "recipients read notifications" ON public.notifications;

CREATE POLICY "recipients read notifications"
  ON public.notifications
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = recipient_id);

NOTIFY pgrst, 'reload schema';

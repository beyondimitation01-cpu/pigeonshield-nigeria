-- Notification retention cleanup and safe user-owned deletion policy.
-- Read-state is independent from business resolution: unresolved action-required
-- notifications remain protected until their underlying task is resolved.

CREATE INDEX IF NOT EXISTS notifications_recipient_read_idx
  ON public.notifications (recipient_id, read_at)
  WHERE read_at IS NOT NULL;

DROP POLICY IF EXISTS "recipients delete eligible notifications" ON public.notifications;

CREATE POLICY "recipients delete eligible notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (
  recipient_id = (select auth.uid())
  AND read_at IS NOT NULL
  AND read_at < now() - interval '48 hours'
  AND (
    kind NOT IN (
      'admin_payment_review',
      'admin_receipt_review',
      'admin_payout_required',
      'admin_transaction_review',
      'admin_dispute_review',
      'receipt_confirmation_required',
      'payout_pending',
      'payment_attention'
    )
    OR (
      transaction_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.transactions t
        WHERE t.id = notifications.transaction_id
          AND (
            (notifications.kind IN ('admin_payment_review', 'admin_receipt_review')
             AND t.status <> 'Pending Verification')
            OR
            (notifications.kind = 'admin_payout_required'
             AND NOT (
               t.status IN ('Ready for Admin Payout', 'Delivered')
               AND t.payout_paid_at IS NULL
               AND t.payout_paid_by IS NULL
             ))
            OR
            (notifications.kind = 'admin_transaction_review'
             AND t.status NOT IN ('Payment Error', 'Transaction Error'))
            OR
            (notifications.kind = 'admin_dispute_review'
             AND t.status <> 'Disputed')
            OR
            (notifications.kind = 'receipt_confirmation_required'
             AND t.status <> 'In Transit')
            OR
            (notifications.kind = 'payout_pending'
             AND NOT (
               t.status IN ('Ready for Admin Payout', 'Delivered')
               AND t.payout_paid_at IS NULL
               AND t.payout_paid_by IS NULL
             ))
            OR
            (notifications.kind = 'payment_attention'
             AND t.status NOT IN ('Payment Error', 'Transaction Error'))
          )
      )
    )
  )
);

NOTIFY pgrst, 'reload schema';

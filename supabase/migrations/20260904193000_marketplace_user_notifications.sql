-- Expand the existing user notification layer beyond messages.
-- Notifications are informational: failures are swallowed so marketplace
-- transactions can never be rolled back because notification delivery failed.

ALTER TABLE public.notifications
  ALTER COLUMN message_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS event_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_uidx
  ON public.notifications (event_key)
  WHERE event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_transaction_created_idx
  ON public.notifications (transaction_id, created_at DESC)
  WHERE transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_transaction_user_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  listing_label text := coalesce(NEW.listing_name, 'your order');
  event_key text;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      -- Buyer: payment/receipt has been submitted and is awaiting review.
      event_key := 'transaction:' || NEW.id || ':payment_submitted:buyer';
      INSERT INTO public.notifications
        (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
      VALUES
        (NEW.buyer_id, NULL, NEW.listing_id, NEW.id, 'payment_submitted',
         'Payment submitted',
         'Your payment receipt was submitted successfully and is being reviewed. Open the order for details.',
         event_key)
      ON CONFLICT (event_key) DO NOTHING;

      -- Seller: a buyer has purchased the seller's product and dispatch is next.
      IF NEW.breeder_id IS NOT NULL THEN
        event_key := 'transaction:' || NEW.id || ':new_order:seller';
        INSERT INTO public.notifications
          (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
        VALUES
          (NEW.breeder_id, NULL, NEW.listing_id, NEW.id, 'new_order',
           'New order',
           'A buyer has purchased your product. Please review the order and continue with dispatch.',
           event_key)
        ON CONFLICT (event_key) DO NOTHING;
      END IF;

      RETURN NEW;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      -- Payment confirmed / escrow funded: both parties get a meaningful state update.
      IF NEW.status = 'Escrow Funded' THEN
        event_key := 'transaction:' || NEW.id || ':escrow_funded:buyer';
        INSERT INTO public.notifications
          (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
        VALUES
          (NEW.buyer_id, NULL, NEW.listing_id, NEW.id, 'payment_confirmed',
           'Payment confirmed',
           'Your payment has been confirmed. Your order is now protected in escrow.',
           event_key)
        ON CONFLICT (event_key) DO NOTHING;

        IF NEW.breeder_id IS NOT NULL THEN
          event_key := 'transaction:' || NEW.id || ':escrow_funded:seller';
          INSERT INTO public.notifications
            (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
          VALUES
            (NEW.breeder_id, NULL, NEW.listing_id, NEW.id, 'payment_confirmed',
             'Payment confirmed',
             'Payment for your order has been confirmed. Please review the order and continue with dispatch.',
             event_key)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;
      END IF;

      -- Reverse PIN workflow: never put the actual PIN in a notification.
      IF NEW.status = 'In Transit' THEN
        IF NEW.buyer_id IS NOT NULL THEN
          event_key := 'transaction:' || NEW.id || ':in_transit:buyer';
          INSERT INTO public.notifications
            (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
          VALUES
            (NEW.buyer_id, NULL, NEW.listing_id, NEW.id, 'receipt_confirmation_required',
             'Order dispatched',
             'Your order has been dispatched. Open the order when you are ready to confirm receipt.',
             event_key)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;

        IF NEW.breeder_id IS NOT NULL THEN
          event_key := 'transaction:' || NEW.id || ':in_transit:seller';
          INSERT INTO public.notifications
            (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
          VALUES
            (NEW.breeder_id, NULL, NEW.listing_id, NEW.id, 'handover_in_progress',
             'Order dispatched',
             'Your order is now in transit. The buyer can complete receipt confirmation through the existing handover process.',
             event_key)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;
      END IF;

      -- Buyer confirmation moves the transaction to the payout queue. Admin action remains required.
      IF NEW.status = 'Ready for Admin Payout' THEN
        IF NEW.buyer_id IS NOT NULL THEN
          event_key := 'transaction:' || NEW.id || ':ready_for_admin_payout:buyer';
          INSERT INTO public.notifications
            (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
          VALUES
            (NEW.buyer_id, NULL, NEW.listing_id, NEW.id, 'receipt_confirmed',
             'Receipt confirmed',
             'Your receipt confirmation was recorded. The transaction is now awaiting the existing admin payout step.',
             event_key)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;

        IF NEW.breeder_id IS NOT NULL THEN
          event_key := 'transaction:' || NEW.id || ':ready_for_admin_payout:seller';
          INSERT INTO public.notifications
            (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
          VALUES
            (NEW.breeder_id, NULL, NEW.listing_id, NEW.id, 'payout_pending',
             'Order ready for payout',
             'The buyer has completed receipt confirmation. Your transaction is now awaiting the existing admin payout step.',
             event_key)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;
      END IF;

      IF NEW.status = 'Seller Paid' THEN
        IF NEW.breeder_id IS NOT NULL THEN
          event_key := 'transaction:' || NEW.id || ':seller_paid:seller';
          INSERT INTO public.notifications
            (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
          VALUES
            (NEW.breeder_id, NULL, NEW.listing_id, NEW.id, 'seller_paid',
             'Payment sent',
             'Your payout for the completed order has been processed. Open the order to view its details.',
             event_key)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;

        IF NEW.buyer_id IS NOT NULL THEN
          event_key := 'transaction:' || NEW.id || ':seller_paid:buyer';
          INSERT INTO public.notifications
            (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
          VALUES
            (NEW.buyer_id, NULL, NEW.listing_id, NEW.id, 'transaction_completed',
             'Transaction completed',
             'Your transaction has been completed. Open the order to view its history.',
             event_key)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;
      END IF;

      IF NEW.status = 'Completed' THEN
        IF NEW.buyer_id IS NOT NULL THEN
          event_key := 'transaction:' || NEW.id || ':completed:buyer';
          INSERT INTO public.notifications
            (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
          VALUES
            (NEW.buyer_id, NULL, NEW.listing_id, NEW.id, 'transaction_completed',
             'Transaction completed',
             'Your transaction has been completed. Open the order to view its history.',
             event_key)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;
        IF NEW.breeder_id IS NOT NULL THEN
          event_key := 'transaction:' || NEW.id || ':completed:seller';
          INSERT INTO public.notifications
            (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
          VALUES
            (NEW.breeder_id, NULL, NEW.listing_id, NEW.id, 'transaction_completed',
             'Transaction completed',
             'Your transaction has been completed. Open the order to view its history.',
             event_key)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;
      END IF;

      IF NEW.status = 'Refunded to Buyer' THEN
        IF NEW.buyer_id IS NOT NULL THEN
          event_key := 'transaction:' || NEW.id || ':refunded:buyer';
          INSERT INTO public.notifications
            (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
          VALUES
            (NEW.buyer_id, NULL, NEW.listing_id, NEW.id, 'refund',
             'Refund issued',
             'Your transaction has been refunded. Open the order to view the refund status and history.',
             event_key)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;
        IF NEW.breeder_id IS NOT NULL THEN
          event_key := 'transaction:' || NEW.id || ':refunded:seller';
          INSERT INTO public.notifications
            (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
          VALUES
            (NEW.breeder_id, NULL, NEW.listing_id, NEW.id, 'refund',
             'Transaction refunded',
             'A refund has affected this transaction. Open the order to review its status.',
             event_key)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;
      END IF;

      IF NEW.status IN ('Payment Error', 'Transaction Error') THEN
        IF NEW.buyer_id IS NOT NULL THEN
          event_key := 'transaction:' || NEW.id || ':error:buyer';
          INSERT INTO public.notifications
            (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
          VALUES
            (NEW.buyer_id, NULL, NEW.listing_id, NEW.id, 'payment_attention',
             'Payment requires attention',
             'Your order has a payment or transaction issue. Open the order to review the next step.',
             event_key)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;
        IF NEW.breeder_id IS NOT NULL THEN
          event_key := 'transaction:' || NEW.id || ':error:seller';
          INSERT INTO public.notifications
            (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
          VALUES
            (NEW.breeder_id, NULL, NEW.listing_id, NEW.id, 'payment_attention',
             'Transaction requires attention',
             'A payment or transaction issue affects this order. Open the order to review its status.',
             event_key)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    -- Never make notification persistence a dependency of the business transaction.
    RAISE WARNING 'User notification creation failed for transaction %: %', NEW.id, SQLERRM;
    RETURN NEW;
  END;
END;
$$;

DROP TRIGGER IF EXISTS transaction_user_notification_trg ON public.transactions;
CREATE TRIGGER transaction_user_notification_trg
AFTER INSERT OR UPDATE OF status ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.create_transaction_user_notifications();

-- Seller verification is another existing profile event that merits attention.
CREATE OR REPLACE FUNCTION public.create_seller_verification_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF OLD.is_verified_seller IS DISTINCT FROM NEW.is_verified_seller THEN
      INSERT INTO public.notifications
        (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
      VALUES
        (NEW.id, NULL, NULL, NULL, 'seller_verification',
         CASE WHEN NEW.is_verified_seller THEN 'Seller verification approved' ELSE 'Seller verification updated' END,
         CASE WHEN NEW.is_verified_seller
           THEN 'Your seller verification has been approved. Your account now shows the verified seller status.'
           ELSE 'Your seller verification status has changed. Open your account to review the current status.'
         END,
         'profile:' || NEW.id || ':seller_verification:' || CASE WHEN NEW.is_verified_seller THEN 'approved' ELSE 'updated' END)
      ON CONFLICT (event_key) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Seller verification notification failed for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seller_verification_notification_trg ON public.profiles;
CREATE TRIGGER seller_verification_notification_trg
AFTER UPDATE OF is_verified_seller ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.create_seller_verification_notification();

-- Keep the existing message notification trigger untouched. Realtime already
-- watches public.notifications in the application store; adding rows here
-- therefore uses the same persistent + realtime notification architecture.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Route meaningful existing admin-action events into the normal user notification layer.
-- This does not replace the privileged admin_notifications feed used by the Admin Console.
-- Notification failures are isolated so they cannot roll back marketplace transactions.

CREATE OR REPLACE FUNCTION public.create_normal_admin_notification(
  _transaction_id uuid,
  _kind text,
  _title text,
  _body text,
  _event_suffix text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.notifications
      (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
    SELECT
      r.user_id,
      NULL,
      t.listing_id,
      t.id,
      _kind,
      _title,
      _body,
      'admin:transaction:' || t.id || ':' || _event_suffix
    FROM public.user_roles r
    JOIN public.transactions t ON t.id = _transaction_id
    WHERE r.role = 'admin'
    ON CONFLICT (event_key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Normal admin notification failed for transaction %: %', _transaction_id, SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.create_normal_admin_notification(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_admins_for_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  buyer_name text;
  seller_name text;
  amount_text text;
  notification_body text;
BEGIN
  BEGIN
    SELECT coalesce(p.public_handle, p.real_name, NEW.buyer_id::text)
      INTO buyer_name FROM public.profiles p WHERE p.id = NEW.buyer_id;
    SELECT coalesce(p.public_handle, p.real_name, coalesce(NEW.breeder_id::text, 'Unknown seller'))
      INTO seller_name FROM public.profiles p WHERE p.id = NEW.breeder_id;
    amount_text := '₦' || to_char(NEW.amount_naira, 'FM999G999G999G990');

    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.admin_notifications (transaction_id, kind, title, body)
      SELECT NEW.id, 'payment_received', 'Payment Received',
        'Order ' || NEW.id || E'\nProduct: ' || NEW.listing_name ||
        E'\nBuyer: ' || coalesce(buyer_name, NEW.buyer_id::text) ||
        E'\nSeller: ' || coalesce(seller_name, coalesce(NEW.breeder_id::text, 'Unknown')) ||
        E'\nAmount: ' || amount_text
      FROM public.user_roles r WHERE r.role = 'admin';

      IF NEW.receipt_url IS NOT NULL THEN
        INSERT INTO public.admin_notifications (transaction_id, kind, title, body)
        SELECT NEW.id, 'receipt_submitted', 'Payment Receipt Submitted',
          'Order ' || NEW.id || E'\nProduct: ' || NEW.listing_name ||
          E'\nBuyer: ' || coalesce(buyer_name, NEW.buyer_id::text) ||
          E'\nAmount: ' || amount_text ||
          E'\nA payment receipt is ready for verification.'
        FROM public.user_roles r WHERE r.role = 'admin';
      END IF;
    ELSE
      IF OLD.receipt_url IS NULL AND NEW.receipt_url IS NOT NULL THEN
        INSERT INTO public.admin_notifications (transaction_id, kind, title, body)
        SELECT NEW.id, 'receipt_submitted', 'Payment Receipt Submitted',
          'Order ' || NEW.id || E'\nProduct: ' || NEW.listing_name ||
          E'\nBuyer: ' || coalesce(buyer_name, NEW.buyer_id::text) ||
          E'\nAmount: ' || amount_text ||
          E'\nA payment receipt is ready for verification.'
        FROM public.user_roles r WHERE r.role = 'admin';
      END IF;

      IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'In Transit' THEN
        INSERT INTO public.admin_notifications (transaction_id, kind, title, body)
        SELECT NEW.id, 'order_dispatched', 'Order Dispatched',
          'Order ' || NEW.id || E'\nProduct: ' || NEW.listing_name ||
          E'\nSeller: ' || coalesce(seller_name, coalesce(NEW.breeder_id::text, 'Unknown')) ||
          E'\nThe seller has dispatched the order.'
        FROM public.user_roles r WHERE r.role = 'admin';
      END IF;

      IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'Ready for Admin Payout' THEN
        notification_body :=
          'Order ' || NEW.id || E'\nProduct: ' || NEW.listing_name ||
          E'\nBuyer: ' || coalesce(buyer_name, NEW.buyer_id::text) ||
          E'\nSeller: ' || coalesce(seller_name, coalesce(NEW.breeder_id::text, 'Unknown')) ||
          E'\nAmount: ' || amount_text ||
          E'\nBuyer confirmed receipt: Yes' ||
          E'\nStatus: READY FOR ADMIN PAYOUT';

        INSERT INTO public.admin_notifications (transaction_id, kind, title, body)
        SELECT NEW.id, 'buyer_confirmed_receipt', 'Buyer Confirmed Receipt', notification_body
        FROM public.user_roles r WHERE r.role = 'admin';

        INSERT INTO public.admin_notifications (transaction_id, kind, title, body)
        SELECT NEW.id, 'payout_required', 'Payout Required', notification_body
        FROM public.user_roles r WHERE r.role = 'admin';
      END IF;

      IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('Payment Error', 'Transaction Error') THEN
        INSERT INTO public.admin_notifications (transaction_id, kind, title, body)
        SELECT NEW.id, 'transaction_error', 'Transaction Error Requires Attention',
          'Order ' || NEW.id || E'\nProduct: ' || NEW.listing_name ||
          E'\nPayment/transaction status requires administrator attention.'
        FROM public.user_roles r WHERE r.role = 'admin';
      END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
      PERFORM public.create_normal_admin_notification(
        NEW.id,
        'admin_payment_review',
        'Payment review required',
        'A new transaction requires payment review. Open the Admin Console to review it.',
        'payment_review'
      );

      IF NEW.receipt_url IS NOT NULL THEN
        PERFORM public.create_normal_admin_notification(
          NEW.id,
          'admin_receipt_review',
          'Payment receipt submitted',
          'A buyer has submitted a payment receipt. Open the Admin Console to review and confirm it.',
          'receipt_review'
        );
      END IF;
    ELSE
      IF OLD.receipt_url IS NULL AND NEW.receipt_url IS NOT NULL THEN
        PERFORM public.create_normal_admin_notification(
          NEW.id,
          'admin_receipt_review',
          'Payment receipt submitted',
          'A buyer has submitted a payment receipt. Open the Admin Console to review and confirm it.',
          'receipt_review'
        );
      END IF;

      IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF NEW.status = 'Escrow Funded' THEN
          PERFORM public.create_normal_admin_notification(
            NEW.id,
            'admin_transaction_advanced',
            'Transaction advanced',
            'Payment has been confirmed. Review the transaction for any required administrative action.',
            'escrow_funded_review'
          );
        ELSIF NEW.status = 'Ready for Admin Payout' THEN
          PERFORM public.create_normal_admin_notification(
            NEW.id,
            'admin_payout_required',
            'Seller payout required',
            'A transaction is ready for manual seller payout. Open the Admin Console to review and process it.',
            'payout_required'
          );
        ELSIF NEW.status IN ('Payment Error', 'Transaction Error') THEN
          PERFORM public.create_normal_admin_notification(
            NEW.id,
            'admin_transaction_review',
            'Transaction requires attention',
            'A payment or transaction issue requires administrative review. Open the Admin Console to review it.',
            'transaction_error'
          );
        ELSIF NEW.status = 'Disputed' THEN
          PERFORM public.create_normal_admin_notification(
            NEW.id,
            'admin_dispute_review',
            'Dispute requires review',
            'A transaction has entered the existing dispute workflow. Open the Admin Console to review it.',
            'dispute_review'
          );
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Admin notification processing failed for transaction %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_transaction_notification_trg ON public.transactions;
CREATE TRIGGER admin_transaction_notification_trg
AFTER INSERT OR UPDATE OF status, receipt_url ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_for_transaction();

NOTIFY pgrst, 'reload schema';

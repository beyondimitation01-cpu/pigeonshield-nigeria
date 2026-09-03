-- Manual Admin Payout Escrow Workflow
-- Target: external Supabase project only. No data is deleted or replaced.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payout_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payout_reference text,
  ADD COLUMN IF NOT EXISTS payout_notes text;

CREATE INDEX IF NOT EXISTS transactions_ready_for_payout_idx
  ON public.transactions (status, payout_paid_at)
  WHERE status IN ('Ready for Admin Payout', 'Delivered') AND payout_paid_at IS NULL;

DROP POLICY IF EXISTS "parties update own transactions" ON public.transactions;
CREATE POLICY "admins update transactions"
  ON public.transactions FOR UPDATE TO authenticated
  USING (private.has_role((select auth.uid()), 'admin'::public.app_role))
  WITH CHECK (private.has_role((select auth.uid()), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx ON public.admin_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_notifications_transaction_id_idx ON public.admin_notifications (transaction_id);
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_notifications FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;

DROP POLICY IF EXISTS "admins read admin notifications" ON public.admin_notifications;
CREATE POLICY "admins read admin notifications"
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (private.has_role((select auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins update admin notifications" ON public.admin_notifications;
CREATE POLICY "admins update admin notifications"
  ON public.admin_notifications FOR UPDATE TO authenticated
  USING (private.has_role((select auth.uid()), 'admin'::public.app_role))
  WITH CHECK (private.has_role((select auth.uid()), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.notify_admins_for_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  buyer_name text;
  seller_name text;
  amount_text text;
  notification_body text;
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_transaction_notification_trg ON public.transactions;
CREATE TRIGGER admin_transaction_notification_trg
AFTER INSERT OR UPDATE OF status, receipt_url ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_for_transaction();

CREATE OR REPLACE FUNCTION public.verify_payment(_transaction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF (select auth.uid()) IS NULL OR NOT private.has_role((select auth.uid()), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  UPDATE public.transactions SET status = 'Escrow Funded'
  WHERE id = _transaction_id AND status = 'Pending Verification';
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment is not awaiting verification'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_payment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_transaction_doa(_transaction_id uuid, _proof_file_name text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.transactions
  SET status = 'Disputed', dispute_status = 'Disputed: Dead on Arrival',
      proof_file_name = left(coalesce(_proof_file_name, ''), 255)
  WHERE id = _transaction_id AND buyer_id = (select auth.uid()) AND status = 'Escrow Funded';
  IF NOT FOUND THEN RAISE EXCEPTION 'Order is not eligible for a buyer DOA report'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.report_transaction_doa(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_transaction_doa(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_breeder_delivery_proof(_transaction_id uuid, _driver_phone text, _waybill text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.transactions
  SET status = 'Disputed', dispute_status = 'Under Review: Proof Submitted',
      driver_phone = left(trim(coalesce(_driver_phone, '')), 80),
      waybill_image_url = left(trim(coalesce(_waybill, '')), 1000)
  WHERE id = _transaction_id AND breeder_id = (select auth.uid()) AND status = 'Disputed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Order is not eligible for delivery proof'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_breeder_delivery_proof(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_breeder_delivery_proof(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_seller_paid(_transaction_id uuid, _payout_reference text DEFAULT NULL, _payout_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF (select auth.uid()) IS NULL OR NOT private.has_role((select auth.uid()), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  UPDATE public.transactions
  SET status = 'Seller Paid', dispute_status = 'None',
      payout_paid_at = now(), payout_paid_by = (select auth.uid()),
      payout_reference = nullif(left(trim(coalesce(_payout_reference, '')), 255), ''),
      payout_notes = nullif(left(trim(coalesce(_payout_notes, '')), 2000), '')
  WHERE id = _transaction_id
    AND status IN ('Ready for Admin Payout', 'Delivered')
    AND payout_paid_at IS NULL AND payout_paid_by IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction is not ready for payout or has already been paid'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_seller_paid(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_seller_paid(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_receipt_and_reveal_pin(_transaction_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE pin text; listing uuid;
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT verification_pin, listing_id INTO pin, listing
  FROM public.transactions
  WHERE id = _transaction_id AND buyer_id = (select auth.uid()) AND status = 'In Transit'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order is not available for receipt confirmation'; END IF;
  IF pin IS NULL THEN RAISE EXCEPTION 'The seller has not dispatched this order yet'; END IF;
  UPDATE public.transactions
  SET status = 'Ready for Admin Payout', dispute_status = 'None'
  WHERE id = _transaction_id AND buyer_id = (select auth.uid());
  IF listing IS NOT NULL THEN UPDATE public.listings SET is_active = false WHERE id = listing; END IF;
  RETURN pin;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_receipt_and_reveal_pin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_receipt_and_reveal_pin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.force_mark_delivered(_transaction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE listing uuid;
BEGIN
  IF (select auth.uid()) IS NULL OR NOT private.has_role((select auth.uid()), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  SELECT listing_id INTO listing FROM public.transactions
  WHERE id = _transaction_id
    AND status NOT IN ('Ready for Admin Payout','Seller Paid','Refunded to Buyer','Disputed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order is not active'; END IF;
  UPDATE public.transactions SET status = 'Ready for Admin Payout', dispute_status = 'None' WHERE id = _transaction_id;
  IF listing IS NOT NULL THEN UPDATE public.listings SET is_active = false WHERE id = listing; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.force_mark_delivered(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.force_mark_delivered(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_visible_handover_pins()
RETURNS TABLE(transaction_id uuid, verification_pin text)
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT t.id, t.verification_pin FROM public.transactions t
  WHERE t.verification_pin IS NOT NULL
    AND (
      (t.breeder_id = (select auth.uid()) AND t.status IN ('In Transit','Ready for Admin Payout','Seller Paid'))
      OR (t.buyer_id = (select auth.uid()) AND t.status IN ('Ready for Admin Payout','Seller Paid'))
      OR private.has_role((select auth.uid()), 'admin'::public.app_role)
    );
$$;
REVOKE ALL ON FUNCTION public.get_visible_handover_pins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_visible_handover_pins() TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'admin_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
  END IF;
END $$;

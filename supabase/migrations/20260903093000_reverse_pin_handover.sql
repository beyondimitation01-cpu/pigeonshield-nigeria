-- Reverse PIN handover: replace client-side 2FA/passcode flows with
-- server-generated seller PINs and atomic buyer receipt confirmation.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS verification_pin text;

ALTER TABLE public.transactions
  DROP COLUMN IF EXISTS delivery_token,
  DROP COLUMN IF EXISTS token_expires_at;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_verification_pin_format'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_verification_pin_format
      CHECK (verification_pin IS NULL OR verification_pin ~ '^[0-9]{4}$');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.dispatch_transaction(_transaction_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_pin text;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  new_pin := lpad((floor(random() * 10000))::int::text, 4, '0');

  UPDATE public.transactions
  SET status = 'In Transit',
      verification_pin = new_pin
  WHERE id = _transaction_id
    AND breeder_id = (select auth.uid())
    AND status IN ('Escrow Funded', 'Payment Verified / Processing');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order is not available for dispatch';
  END IF;

  RETURN new_pin;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_transaction(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_transaction(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_receipt_and_reveal_pin(_transaction_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pin text;
  listing uuid;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT verification_pin, listing_id
    INTO pin, listing
  FROM public.transactions
  WHERE id = _transaction_id
    AND buyer_id = (select auth.uid())
    AND status = 'In Transit'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order is not available for receipt confirmation';
  END IF;

  IF pin IS NULL THEN
    RAISE EXCEPTION 'The seller has not dispatched this order yet';
  END IF;

  UPDATE public.transactions
  SET status = 'Delivered',
      dispute_status = 'None'
  WHERE id = _transaction_id
    AND buyer_id = (select auth.uid());

  IF listing IS NOT NULL THEN
    UPDATE public.listings
    SET is_active = false
    WHERE id = listing;
  END IF;

  RETURN pin;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_receipt_and_reveal_pin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_receipt_and_reveal_pin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.force_mark_delivered(_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  listing uuid;
BEGIN
  IF (select auth.uid()) IS NULL
     OR NOT private.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT listing_id INTO listing
  FROM public.transactions
  WHERE id = _transaction_id
    AND status NOT IN ('Delivered', 'Completed', 'Refunded to Buyer')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order is not active';
  END IF;

  UPDATE public.transactions
  SET status = 'Delivered', dispute_status = 'None'
  WHERE id = _transaction_id;

  IF listing IS NOT NULL THEN
    UPDATE public.listings SET is_active = false WHERE id = listing;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.force_mark_delivered(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.force_mark_delivered(uuid) TO authenticated;

-- Non-admin clients cannot directly manufacture a Delivered state or a PIN.
-- The SECURITY DEFINER functions above are the controlled write paths.
DROP POLICY IF EXISTS "transactions delivery state controlled by handover" ON public.transactions;
CREATE POLICY "transactions delivery state controlled by handover"
  ON public.transactions
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    status <> 'Delivered'
    OR private.has_role((select auth.uid()), 'admin')
  );

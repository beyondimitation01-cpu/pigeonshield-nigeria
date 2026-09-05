CREATE OR REPLACE FUNCTION public.create_reverse_pin_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status
       AND NEW.status = 'In Transit'
       AND NEW.buyer_id IS NOT NULL
       AND NEW.verification_pin IS NOT NULL THEN
      INSERT INTO public.notifications
        (recipient_id, message_id, listing_id, transaction_id, kind, title, body, event_key)
      VALUES
        (NEW.buyer_id, NULL, NEW.listing_id, NEW.id, 'handover_pin_available',
         'Pickup verification PIN available',
         'Your pickup verification PIN is now available. Open the order to view it and complete the existing handover process.',
         'transaction:' || NEW.id || ':handover_pin_available:buyer')
      ON CONFLICT (event_key) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Reverse PIN notification failed for transaction %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reverse_pin_notification_trg ON public.transactions;
CREATE TRIGGER reverse_pin_notification_trg
AFTER UPDATE OF status ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.create_reverse_pin_notification();

REVOKE ALL ON FUNCTION public.create_reverse_pin_notification() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

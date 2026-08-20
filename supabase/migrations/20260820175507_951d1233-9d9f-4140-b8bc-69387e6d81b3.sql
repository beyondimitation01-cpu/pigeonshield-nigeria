-- 1. Feedback
CREATE TABLE public.app_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL DEFAULT '',
  contact text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'General Complaint',
  rating integer NOT NULL DEFAULT 5,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.app_feedback TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_feedback TO authenticated;
GRANT ALL ON public.app_feedback TO service_role;
ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can submit feedback" ON public.app_feedback
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admins read feedback" ON public.app_feedback
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins update feedback" ON public.app_feedback
  FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins delete feedback" ON public.app_feedback
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_app_feedback_updated_at BEFORE UPDATE ON public.app_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sanitize_feedback()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.name := left(coalesce(public.sanitize_text(NEW.name), 'Anonymous'), 120);
  NEW.contact := left(coalesce(public.sanitize_text(NEW.contact), ''), 120);
  NEW.category := left(coalesce(public.sanitize_text(NEW.category), 'General Complaint'), 60);
  NEW.message := left(coalesce(public.sanitize_text(NEW.message), ''), 2000);
  NEW.rating := greatest(1, least(5, coalesce(NEW.rating, 5)));
  IF NEW.message = '' THEN RAISE EXCEPTION 'Feedback message is empty'; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER sanitize_feedback_trg BEFORE INSERT OR UPDATE ON public.app_feedback
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_feedback();

-- 2. Demo listings flag + cleanup
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS is_mock boolean NOT NULL DEFAULT false;
UPDATE public.listings SET is_mock = true WHERE breeder_id IS NULL;

CREATE OR REPLACE FUNCTION public.purge_mock_listings()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE removed integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  -- only purge once a genuine seller listing exists
  IF NOT EXISTS (SELECT 1 FROM public.listings WHERE is_mock = false AND breeder_id IS NOT NULL) THEN
    RETURN 0;
  END IF;
  DELETE FROM public.listings WHERE is_mock = true;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END; $$;

REVOKE ALL ON FUNCTION public.purge_mock_listings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_mock_listings() TO authenticated, service_role;

-- 3. Manual OPay receipts on orders
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS receipt_url text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS receipt_uploaded_at timestamptz;

-- 4. Receipt storage policies
CREATE POLICY "buyers upload own receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "buyers read own receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payment-receipts'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR private.has_role(auth.uid(), 'admin'::app_role)));
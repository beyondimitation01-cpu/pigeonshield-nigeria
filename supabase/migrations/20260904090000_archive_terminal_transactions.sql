-- Keep terminal transactions in the database, but remove them from ordinary buyer/seller active reads.
-- Admins retain access to the complete transaction table through the existing admin RLS helper.
DROP POLICY IF EXISTS "parties read own transactions" ON public.transactions;
CREATE POLICY "parties read active transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      (buyer_id = auth.uid() OR breeder_id = auth.uid())
      AND status NOT IN ('Seller Paid', 'Completed', 'Refunded to Buyer')
    )
  );

-- Terminal history is exposed through an explicit participant-scoped RPC so users
-- can still access their completed/refunded records without reopening the active list.
CREATE OR REPLACE FUNCTION public.get_transaction_history()
RETURNS SETOF public.transactions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.*
  FROM public.transactions AS t
  WHERE (t.buyer_id = auth.uid() OR t.breeder_id = auth.uid())
    AND t.status IN ('Seller Paid', 'Completed', 'Refunded to Buyer')
  ORDER BY t.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_transaction_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_transaction_history() TO authenticated;

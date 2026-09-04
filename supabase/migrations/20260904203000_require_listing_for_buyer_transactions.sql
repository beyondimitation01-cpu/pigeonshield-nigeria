-- Security repair: buyer-created transactions must reference a real active listing.
-- This closes the audited orphan-transaction INSERT path without changing
-- historical rows or the transactions table globally.

DROP POLICY IF EXISTS "buyers create transactions" ON public.transactions;

CREATE POLICY "buyers create transactions"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (
  buyer_id = auth.uid()
  AND buyer_id IS DISTINCT FROM breeder_id
  AND listing_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id = transactions.listing_id
      AND l.is_active = true
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id = transactions.listing_id
      AND l.breeder_id = auth.uid()
  )
);

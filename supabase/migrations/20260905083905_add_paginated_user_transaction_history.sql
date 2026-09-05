CREATE OR REPLACE FUNCTION public.get_transaction_history_page(
  _direction text,
  _limit integer DEFAULT 21,
  _offset integer DEFAULT 0
)
RETURNS SETOF public.transactions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT t.*
  FROM public.transactions AS t
  WHERE (select auth.uid()) IS NOT NULL
    AND t.status IN ('Seller Paid', 'Completed', 'Refunded to Buyer')
    AND (
      (_direction = 'purchase' AND t.buyer_id = (select auth.uid()))
      OR (_direction = 'sale' AND t.breeder_id = (select auth.uid()))
    )
  ORDER BY t.created_at DESC, t.id DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 21), 1), 21)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
$function$;

REVOKE EXECUTE ON FUNCTION public.get_transaction_history_page(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_transaction_history_page(text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_transaction_history_page(text, integer, integer) TO authenticated;

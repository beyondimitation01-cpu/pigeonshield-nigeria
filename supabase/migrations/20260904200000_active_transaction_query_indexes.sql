-- Support database-level active transaction reads without loading terminal history.
-- These indexes are read-performance only; they do not alter or delete any records.
CREATE INDEX IF NOT EXISTS transactions_buyer_active_created_idx
  ON public.transactions (buyer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS transactions_breeder_active_created_idx
  ON public.transactions (breeder_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS transactions_status_created_idx
  ON public.transactions (status, created_at DESC);

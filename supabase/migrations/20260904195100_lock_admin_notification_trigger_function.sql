-- This function is invoked only by the transactions trigger; it is not an RPC endpoint.
REVOKE ALL ON FUNCTION public.notify_admins_for_transaction() FROM PUBLIC, anon, authenticated;

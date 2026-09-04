-- Notification trigger functions are internal implementation details.
-- They are executed by their table triggers and must not be exposed as RPCs.
REVOKE ALL ON FUNCTION public.create_transaction_user_notifications() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_seller_verification_notification() FROM PUBLIC, anon, authenticated;

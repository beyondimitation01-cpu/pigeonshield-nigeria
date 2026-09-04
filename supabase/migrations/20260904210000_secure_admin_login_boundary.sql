-- Global, server-side brute-force protection for the dedicated God Mode passphrase.
-- State lives alongside the existing singleton passphrase record so there is no
-- client-controlled identifier that can be rotated to bypass the lockout.
ALTER TABLE admin_secrets.passphrase
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE OR REPLACE FUNCTION public.verify_admin_passphrase(passphrase text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin_secrets, pg_catalog, extensions
AS $$
DECLARE
  stored_hash text;
  now_at timestamptz := clock_timestamp();
  is_locked boolean := false;
  is_match boolean := false;
BEGIN
  -- Serialize every God Mode passphrase check against the singleton state row.
  -- This makes concurrent failures count atomically toward the same global limit.
  SELECT p.passphrase_sha256,
         (p.locked_until IS NOT NULL AND p.locked_until > now_at)
    INTO stored_hash, is_locked
    FROM admin_secrets.passphrase p
   WHERE p.id = true
   FOR UPDATE;

  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;

  -- Expired lockouts and stale failure windows are reset automatically.
  IF NOT is_locked THEN
    UPDATE admin_secrets.passphrase
       SET failed_attempts = CASE
             WHEN failure_window_started_at IS NULL
               OR failure_window_started_at <= now_at - interval '15 minutes'
             THEN 0
             ELSE failed_attempts
           END,
           failure_window_started_at = CASE
             WHEN failure_window_started_at IS NULL
               OR failure_window_started_at <= now_at - interval '15 minutes'
             THEN NULL
             ELSE failure_window_started_at
           END,
           locked_until = NULL
     WHERE id = true;
  ELSE
    -- A global lockout rejects even the correct passphrase.
    RETURN false;
  END IF;

  is_match := encode(extensions.digest(passphrase, 'sha256'), 'hex') = stored_hash;

  IF is_match THEN
    UPDATE admin_secrets.passphrase
       SET failed_attempts = 0,
           failure_window_started_at = NULL,
           locked_until = NULL
     WHERE id = true;
    RETURN true;
  END IF;

  UPDATE admin_secrets.passphrase
     SET failed_attempts = CASE
           WHEN failure_window_started_at IS NULL
             OR failure_window_started_at <= now_at - interval '15 minutes'
           THEN 1
           ELSE failed_attempts + 1
         END,
         failure_window_started_at = CASE
           WHEN failure_window_started_at IS NULL
             OR failure_window_started_at <= now_at - interval '15 minutes'
           THEN now_at
           ELSE failure_window_started_at
         END,
         locked_until = CASE
           WHEN (
             CASE
               WHEN failure_window_started_at IS NULL
                 OR failure_window_started_at <= now_at - interval '15 minutes'
               THEN 1
               ELSE failed_attempts + 1
             END
           ) >= 5
           THEN now_at + interval '15 minutes'
           ELSE NULL
         END
   WHERE id = true;

  RETURN false;
END;
$$;

-- The Edge Function uses the service role for this privileged verifier. No
-- marketplace client should be able to probe or mutate the passphrase boundary.
REVOKE ALL ON FUNCTION public.verify_admin_passphrase(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_passphrase(text) TO service_role;

-- Restore the existing recipient-scoped notification policy if it is absent in
-- the connected project. This is the same intended policy used by the existing
-- notification architecture; it does not grant ordinary users access to other
-- users' notifications.
DROP POLICY IF EXISTS "recipients read notifications" ON public.notifications;
CREATE POLICY "recipients read notifications"
  ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

NOTIFY pgrst, 'reload schema';

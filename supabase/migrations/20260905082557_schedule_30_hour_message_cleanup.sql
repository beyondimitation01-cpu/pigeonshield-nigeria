-- Supabase-hosted pg_cron performs the physical deletion independently of user traffic.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'pigeonshield-expire-messages-every-5-minutes';

SELECT cron.schedule(
  'pigeonshield-expire-messages-every-5-minutes',
  '*/5 * * * *',
  $$SELECT public.purge_expired_messages();$$
);

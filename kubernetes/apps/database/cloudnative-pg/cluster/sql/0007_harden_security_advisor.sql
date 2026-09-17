-- ============================================================================
-- 0007_harden_security_advisor.sql
-- ----------------------------------------------------------------------------
-- Idempotent live-cluster fix for Supabase Security Advisor warnings:
--   * Function Search Path Mutable — public.sim_locks
--   * Public / signed-in can execute SECURITY DEFINER —
--       set_swappybot_user_secrets_updated_at(), swappybot_reporter_rate_check()
--
-- Bootstrap SQL (0001/0003/0005) only runs at cluster init. This file is the
-- copy to apply by hand on the existing tradeforge-pg cluster, and is listed
-- in postInitApplicationSQLRefs so a rebuilt cluster reaches the same state.
-- ============================================================================

DROP FUNCTION IF EXISTS public.sim_locks(numeric, numeric);

CREATE OR REPLACE FUNCTION public.set_swappybot_user_secrets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_swappybot_user_secrets_updated_at()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.swappybot_reporter_rate_check(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_window timestamptz := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );
  v_count  integer;
BEGIN
  DELETE FROM public.swappybot_reporter_rate_limit
    WHERE bucket_key = p_key AND window_start < v_window;

  INSERT INTO public.swappybot_reporter_rate_limit AS r (bucket_key, window_start, request_count)
  VALUES (p_key, v_window, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET request_count = r.request_count + 1
  RETURNING r.request_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.swappybot_reporter_rate_check(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.swappybot_reporter_rate_check(text, integer, integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';

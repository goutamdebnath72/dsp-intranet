-- 03_optional_dedicated_login_role.sql  (RECOMMENDED for production use)
--
-- Why: with only 01_*.sql the application runs the LLM's SQL by switching its
-- own connection to nlq_reader (SET ROLE). The guard (guard.ts) blocks the one
-- known way out of that (calling set_config('role', ...)), but a dedicated
-- LOGIN role removes the possibility entirely: nlq_app is a member of
-- nlq_reader and of nothing else, so it can never switch to a more powerful
-- role no matter what SQL runs.
--
-- Steps:
--   1. Run this file (choose your own password below).
--   2. Set  NL2SQL_DATABASE_URL=postgresql://nlq_app:<password>@<same host as DATABASE_URL>/<db>
--      in the environment. The experiment then uses its own connection.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nlq_app') THEN
    CREATE ROLE nlq_app LOGIN PASSWORD 'CHANGE_ME_BEFORE_RUNNING' NOINHERIT;
  END IF;
END $$;

GRANT nlq_reader TO nlq_app;
ALTER ROLE nlq_app SET statement_timeout = '8s';
ALTER ROLE nlq_app SET default_transaction_read_only = on;

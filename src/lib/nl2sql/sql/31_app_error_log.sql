-- 31_app_error_log.sql
--
-- The production ERROR LOG (src/lib/errorLog/): one row per DISTINCT runtime error (browser or server), with how often it happened, how serious it is (rule or AI model) and whether the developer has looked.
-- I group the errors on purpose: the table cannot grow without end (at most 1,000 rows per source; resolved rows are dropped after 30 days, everything after 90). The application creates these tables by itself on first use
-- if its database login may; running this file is the clean way. Closed to the browser (row level security on, nothing granted to anon or authenticated). Safe to run more than once.
-- Read it with   npm run errors   (list)   npm run errors -- show 12   npm run errors -- seen 12   npm run errors -- resolve 12

CREATE TABLE IF NOT EXISTS public.app_error_log (
  id          bigserial   PRIMARY KEY,
  fingerprint text        NOT NULL UNIQUE,
  source      text        NOT NULL,
  message     text        NOT NULL,
  stack       text,
  page        text,
  agent       text,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  occurrences integer     NOT NULL DEFAULT 1,
  severity    text        NOT NULL DEFAULT 'unrated',
  note        text,
  triaged_by  text,
  status      text        NOT NULL DEFAULT 'new',
  alerted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS app_error_log_last_seen_idx ON public.app_error_log (source, last_seen DESC);
CREATE TABLE IF NOT EXISTS public.app_error_meta (
  key        text        PRIMARY KEY,
  value      text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_error_meta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_error_log FROM anon, authenticated;
REVOKE ALL ON public.app_error_meta FROM anon, authenticated;

SELECT count(*) AS errors_recorded FROM public.app_error_log;

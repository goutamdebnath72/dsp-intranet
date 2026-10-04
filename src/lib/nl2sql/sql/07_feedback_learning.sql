-- 07_feedback_learning.sql
-- The learning loop: a Yes/No on EVERY omnibar answer (model, cache, holiday, old engine, circular results),
-- with the reason for a No, plus the columns that let a "No" trigger a different second attempt and let
-- confirmed / rejected answers teach the model. Additive and idempotent: run this whole file once on the live
-- database (a fresh install already gets the same objects from 02).
--
--   public.nl2sql_log        gains: source ('nl2sql'|'cache'), retry_of (the answer this one replaced),
--                            reject_reason, reject_note
--   public.omnibar_feedback  NEW: one row per Yes/No click, for any kind of answer.

ALTER TABLE public.nl2sql_log
  ADD COLUMN IF NOT EXISTS source        text NOT NULL DEFAULT 'nl2sql',
  ADD COLUMN IF NOT EXISTS retry_of      bigint,
  ADD COLUMN IF NOT EXISTS reject_reason text,
  ADD COLUMN IF NOT EXISTS reject_note   text;

CREATE TABLE IF NOT EXISTS public.omnibar_feedback (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  user_key      text,
  query         text NOT NULL,
  query_norm    text NOT NULL,
  source        text NOT NULL CHECK (source IN ('nl2sql', 'cache', 'holiday', 'legacy', 'circular', 'none')),
  verdict       text NOT NULL CHECK (verdict IN ('yes', 'no')),
  reason_code   text CHECK (reason_code IS NULL OR reason_code IN
                  ('wrong_result', 'wrong_department', 'wrong_name', 'wanted_documents', 'wanted_employees', 'other')),
  note          text,
  nl2sql_log_id bigint,
  attempt       integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS omnibar_feedback_query_idx   ON public.omnibar_feedback (query_norm);
CREATE INDEX IF NOT EXISTS omnibar_feedback_verdict_idx ON public.omnibar_feedback (verdict, source);
CREATE INDEX IF NOT EXISTS omnibar_feedback_created_idx ON public.omnibar_feedback (created_at);

-- Proof: both objects exist with the new columns (expect 4 rows for nl2sql_log, 10 for omnibar_feedback).
SELECT table_name, count(*) AS columns_present
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'nl2sql_log' AND column_name IN ('source', 'retry_of', 'reject_reason', 'reject_note'))
    OR (table_name = 'omnibar_feedback'))
GROUP BY table_name ORDER BY table_name;

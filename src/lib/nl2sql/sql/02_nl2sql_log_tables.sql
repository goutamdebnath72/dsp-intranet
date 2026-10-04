-- 02_nl2sql_log_tables.sql
-- Every question, the SQL the model wrote, the outcome and the person's
-- tick/cross. Confirmed (ticked) question/SQL pairs are fed back to the model
-- as worked examples -- that is how the system improves WITHOUT code changes.
-- Additive and idempotent. nlq_reader has no privilege on this table.

CREATE TABLE IF NOT EXISTS public.nl2sql_log (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  user_key      text,
  question      text NOT NULL,
  question_norm text NOT NULL,
  sql           text,
  understood_as text,
  confidence    text,
  ok            boolean NOT NULL,
  error         text,
  row_total     integer,
  elapsed_ms    integer,
  attempts      integer,
  verdict       text CHECK (verdict IN ('confirm', 'reject')),
  verdict_at    timestamptz,
  source        text NOT NULL DEFAULT 'nl2sql',   -- 'nl2sql' | 'cache'
  retry_of      bigint,                           -- the answer this one replaced after a "No"
  reject_reason text,
  reject_note   text
);

CREATE INDEX IF NOT EXISTS nl2sql_log_question_idx ON public.nl2sql_log (question_norm);
CREATE INDEX IF NOT EXISTS nl2sql_log_verdict_idx  ON public.nl2sql_log (verdict) WHERE verdict IS NOT NULL;

-- Yes/No on every omnibar answer (see 07_feedback_learning.sql).
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

SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'nl2sql_log' ORDER BY ordinal_position;

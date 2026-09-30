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
  verdict_at    timestamptz
);

CREATE INDEX IF NOT EXISTS nl2sql_log_question_idx ON public.nl2sql_log (question_norm);
CREATE INDEX IF NOT EXISTS nl2sql_log_verdict_idx  ON public.nl2sql_log (verdict) WHERE verdict IS NOT NULL;

SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'nl2sql_log' ORDER BY ordinal_position;

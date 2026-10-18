-- 10_circular_page_check.sql
-- What a SECOND READER (Gemini) said about the numbers of each page of a circular: which numbers both readings had ("confirmed") and which only the
-- pipeline's reading had ("unconfirmed"). The answer card refuses a number that is unconfirmed (src/lib/search/circularAnswer.ts, the confirmation gate).
-- "text_hash" is the fingerprint of the page's stored text at the time of the check: a check is used only while the stored text still has it, so a
-- re-read circular's old check is ignored. Written only by:  npx tsx --env-file=.env.local scripts/check-readings.ts --ids ... --save
--
-- Run ONE SECTION AT A TIME in the Supabase SQL editor (it shows only the last statement's result when several run together).

-- ====================================================================================================================================
-- SECTION 1 - CHECK (read-only): does the table exist already? Expected before the fix: table_exists = NULL
-- ====================================================================================================================================
SELECT to_regclass('public.circular_page_check') AS table_exists;

-- ====================================================================================================================================
-- SECTION 2 - FIX (one transaction; if it reports an error, run  ROLLBACK;  and send me the message)
-- ====================================================================================================================================
BEGIN;
CREATE TABLE IF NOT EXISTS public.circular_page_check (
  circular_id  integer     NOT NULL REFERENCES public.circulars (id) ON DELETE CASCADE,
  page_number  integer     NOT NULL,
  status       text        NOT NULL,
  confirmed    text[]      NOT NULL DEFAULT '{}',
  unconfirmed  text[]      NOT NULL DEFAULT '{}',
  second_only  text[]      NOT NULL DEFAULT '{}',
  reader       text        NOT NULL,
  text_hash    text        NOT NULL,
  checked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (circular_id, page_number)
);
COMMIT;

-- ====================================================================================================================================
-- SECTION 3 - VERIFY (read-only). Expected: 9 rows (circular_id, page_number, status, confirmed, unconfirmed, second_only, reader, text_hash, checked_at)
-- ====================================================================================================================================
SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'circular_page_check' ORDER BY ordinal_position;

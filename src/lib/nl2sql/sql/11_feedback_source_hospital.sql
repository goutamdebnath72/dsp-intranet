-- 11_feedback_source_hospital.sql  (step 61a)
-- WHY: the Yes/No feedback of an answer is recorded against the route that produced it (omnibar_feedback.source). The column only allows
--      'nl2sql', 'cache', 'holiday', 'legacy', 'circular', 'none', so the hospital route's answers are tagged 'holiday' (a known, harmless fudge).
--      This step lets the column also hold 'hospital'. NOTHING in the app writes 'hospital' yet: the app is changed only AFTER this step has run (otherwise a Yes/No on a hospital answer would be refused).
-- HOW: run ONE SECTION AT A TIME in the Supabase SQL editor (it shows only the last statement's result when several run together).
--      1 CHECK (read-only)  ->  2 FIX (one guarded transaction: it aborts on anything unexpected; if it errors, run ROLLBACK;)  ->  3 VERIFY (read-only).

-- ==================================================================== 1. CHECK (read-only)
-- Expect ONE row: the constraint on the column `source`, listing exactly these six values: nl2sql, cache, holiday, legacy, circular, none.
SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid = 'public.omnibar_feedback'::regclass
  AND c.contype = 'c'
  AND pg_get_constraintdef(c.oid) ILIKE '%source%'
  AND pg_get_constraintdef(c.oid) NOT ILIKE '%verdict%'
  AND pg_get_constraintdef(c.oid) NOT ILIKE '%reason_code%';

-- ==================================================================== 2. FIX (one guarded transaction)
BEGIN;
DO $$
DECLARE
  n int;
  cname text;
  def text;
BEGIN
  SELECT count(*) INTO n
  FROM pg_constraint c
  WHERE c.conrelid = 'public.omnibar_feedback'::regclass AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%source%' AND pg_get_constraintdef(c.oid) NOT ILIKE '%verdict%' AND pg_get_constraintdef(c.oid) NOT ILIKE '%reason_code%';
  IF n <> 1 THEN RAISE EXCEPTION 'ABORT: expected exactly one CHECK on omnibar_feedback.source, found % (nothing changed)', n; END IF;

  SELECT c.conname, pg_get_constraintdef(c.oid) INTO cname, def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.omnibar_feedback'::regclass AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%source%' AND pg_get_constraintdef(c.oid) NOT ILIKE '%verdict%' AND pg_get_constraintdef(c.oid) NOT ILIKE '%reason_code%';

  IF def ILIKE '%hospital%' THEN RAISE NOTICE 'Already allows hospital: nothing to do.'; RETURN; END IF;
  -- the six values the application knows must be the ones in the constraint: anything else means the table is not as expected
  IF def NOT LIKE '%nl2sql%' OR def NOT LIKE '%cache%' OR def NOT LIKE '%holiday%' OR def NOT LIKE '%legacy%' OR def NOT LIKE '%circular%' OR def NOT LIKE '%none%' THEN
    RAISE EXCEPTION 'ABORT: the constraint % is not the expected one: % (nothing changed)', cname, def;
  END IF;

  EXECUTE format('ALTER TABLE public.omnibar_feedback DROP CONSTRAINT %I', cname);
  ALTER TABLE public.omnibar_feedback
    ADD CONSTRAINT omnibar_feedback_source_check
    CHECK (source IN ('nl2sql', 'cache', 'holiday', 'legacy', 'circular', 'none', 'hospital'));
END $$;
COMMIT;

-- ==================================================================== 3. VERIFY (read-only)
-- Expect ONE row, omnibar_feedback_source_check, listing seven values: nl2sql, cache, holiday, legacy, circular, none, hospital.
-- Expect the second query to show the same number of rows as before the fix (no row was touched).
SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid = 'public.omnibar_feedback'::regclass
  AND c.contype = 'c'
  AND pg_get_constraintdef(c.oid) ILIKE '%source%'
  AND pg_get_constraintdef(c.oid) NOT ILIKE '%verdict%'
  AND pg_get_constraintdef(c.oid) NOT ILIKE '%reason_code%';
-- SELECT source, count(*) FROM public.omnibar_feedback GROUP BY source ORDER BY source;

-- 63a_check_pax_directory.sql : READ-ONLY. Shows the real shape of public.pax_directory so the PAX search code can be checked against it.
-- Run in the Supabase SQL editor ONE SECTION AT A TIME (it shows only the last statement's result). Nothing here changes data. It prints no personal data (the table holds departments and numbers).

-- 1. The columns (expected: id, dept_name, location, number, label, note, source, created_at, updated_at)
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'pax_directory' ORDER BY ordinal_position;

-- 2a. The area function: its signature and return type (expected: public.pax_area(text) returns text)
SELECT p.oid::regprocedure AS function_signature, pg_get_function_result(p.oid) AS returns
  FROM pg_proc p WHERE p.proname = 'pax_area' AND p.pronamespace = 'public'::regnamespace;

-- 2b. The area function on four numbers (expected: plant, outside plant, outside plant, not classified; the exact words are normalised by the app)
SELECT public.pax_area('42046') AS a_42046, public.pax_area('45221') AS a_45221, public.pax_area('51234') AS a_51234, public.pax_area('46298') AS a_46298;

-- 2c. THE EXACT CALL THE APP MAKES, on the real rows: public.pax_area("number") for every row (expected: plant 48, outside plant 16, not classified 1)
SELECT public.pax_area("number") AS area, count(*) AS rows FROM public.pax_directory GROUP BY 1 ORDER BY 1;

-- 3. Counts (confirmed by the owner on 31 Oct: 65 rows, 54 names, 64 distinct numbers: 42043 is on two names)
SELECT count(*) AS rows, count(DISTINCT label) AS names, count(DISTINCT "number") AS distinct_numbers FROM public.pax_directory;

-- 4. Security (expected: rls_on = true; the two API roles have NO privilege)
SELECT c.relrowsecurity AS rls_on,
       has_table_privilege('anon', 'public.pax_directory', 'SELECT') AS anon_can_read,
       has_table_privilege('authenticated', 'public.pax_directory', 'SELECT') AS authenticated_can_read
  FROM pg_class c WHERE c.oid = 'public.pax_directory'::regclass;

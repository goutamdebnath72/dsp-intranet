-- 16_designations.sql : the DESIGNATION LIST put right (step 66c; owner, 1 Nov 2026). Run ONCE in the Supabase SQL editor; safe to run again (a second run changes nothing).
--
-- WHAT IT DOES (all in one transaction: if anything fails, nothing is kept)
--   1. The spelling: "Asst.General Manager" becomes "Asst. General Manager" (a space after the dot), in the list of designations and in the login accounts that carry the old text.
--   2. ONE "Asst. Manager": the executive designation list had it twice (code 204 with 149 people, code 201 with 95) and a "Junior Manager" (code 201, 1 person), which is not a designation.
--      Nobody is in training today, so these 96 people are Asst. Managers: they move to the code-204 row, KEEP THEIR RELATIVE ORDER, and get new positions after the 149 who are there
--      (rank = grade order x 10000 + position, the HR formula). The two old rows are then removed, but only when nobody holds them.
--   3. The training designations are ADDED, empty (nobody holds them yet):
--        executives   Management Trainee (MT) and Junior Officer (JO)         code 201, rank 13 (the entry grade, as the old rows were)
--        doctors      DNB Doctor                                              code 201, rank 13            <- PLACEHOLDER code
--        non-execs    SOT, JOT, TA   (in this order, most senior first)       codes 400, 399, 398, ranks 25, 26, 27 (below S-1 = 401)   <- PLACEHOLDER codes
--      The codes of the doctors' and of the non-executives' training designations are ARBITRARY, chosen to fit the pattern of the others (a higher code is a higher grade). When the right codes are known:
--        UPDATE public.designation_grade SET code = <right code> WHERE title = 'SOT' AND track = 'nonexec';       (and likewise for JOT, TA, 'DNB Doctor')
--      Nothing else needs to change: the employee manager reads the list from this table.
--
-- Only public.employee_roster refers to designation_grade (one foreign key), so removing a row nobody holds is safe.
--
-- BEFORE YOU RUN IT, to see what it will do (read-only; run this alone):
--   SELECT dg.id, dg.code, dg.title, dg.track, dg.rank_order, count(er.id) AS people
--   FROM public.designation_grade dg LEFT JOIN public.employee_roster er ON er.designation_grade_id = dg.id
--   WHERE dg.code = 201 OR dg.title IN ('Asst. Manager', 'Asst.General Manager') GROUP BY dg.id ORDER BY dg.rank_order, dg.id;
--
-- AFTER the new designations exist, run 14_people_events.sql again if you want the sample dates of any trainee to fit (it treats a Management Trainee, SOT, JOT or TA as joined within the last year).

BEGIN;

-- no one writes to the two tables while this runs
LOCK TABLE public.designation_grade, public.employee_roster IN SHARE ROW EXCLUSIVE MODE;

-- 1. the spelling
UPDATE public.designation_grade SET title = 'Asst. General Manager' WHERE title = 'Asst.General Manager';
UPDATE public."user" SET designation = 'Asst. General Manager' WHERE designation = 'Asst.General Manager';

-- 2. the new designations (those that are not there yet). Explicit ids after the highest one, so that it works whether or not the id sequence has kept up with the rows loaded with ids.
WITH wanted(ord, code, title, track, rank_order) AS (
  VALUES (1, 201, 'Management Trainee', 'managerial', 13), (2, 201, 'Junior Officer', 'managerial', 13), (3, 201, 'DNB Doctor', 'medical', 13),
         (4, 400, 'SOT', 'nonexec', 25), (5, 399, 'JOT', 'nonexec', 26), (6, 398, 'TA', 'nonexec', 27)
), missing AS (
  -- numbered in the order above (so the ids, and the order of the form, are always the same)
  SELECT w.*, row_number() OVER (ORDER BY w.ord) AS n FROM wanted w
  WHERE NOT EXISTS (SELECT 1 FROM public.designation_grade g WHERE g.title = w.title AND g.track = w.track)
)
INSERT INTO public.designation_grade (id, code, title, track, rank_order)
SELECT (SELECT coalesce(max(id), 0) FROM public.designation_grade) + m.n, m.code, m.title, m.track, m.rank_order FROM missing m;
SELECT setval(pg_get_serial_sequence('public.designation_grade', 'id'), (SELECT max(id) FROM public.designation_grade)) WHERE pg_get_serial_sequence('public.designation_grade', 'id') IS NOT NULL;

-- 3. the people of the duplicate "Asst. Manager" (code 201) and of "Junior Manager" join the one "Asst. Manager" (code 204), in the order they had, after those who are there
WITH keep AS (
  SELECT id, rank_order FROM public.designation_grade WHERE track = 'managerial' AND title = 'Asst. Manager' AND code = 204
), old AS (
  SELECT id FROM public.designation_grade WHERE track = 'managerial' AND code = 201 AND title IN ('Asst. Manager', 'Junior Manager')
), moving AS (
  SELECT er.id, row_number() OVER (ORDER BY er.global_seniority_rank, er.ticket_no) AS n FROM public.employee_roster er WHERE er.designation_grade_id IN (SELECT id FROM old)
), base AS (
  SELECT coalesce(max(within_grade_position), 0) AS m FROM public.employee_roster WHERE designation_grade_id = (SELECT id FROM keep)
)
UPDATE public.employee_roster er
   SET designation_grade_id = (SELECT id FROM keep), within_grade_position = base.m + moving.n, global_seniority_rank = (SELECT rank_order FROM keep) * 10000 + base.m + moving.n
  FROM moving, base
 WHERE er.id = moving.id AND EXISTS (SELECT 1 FROM keep);
-- the login accounts of the people who had the text "Junior Manager" or the duplicate's text
UPDATE public."user" SET designation = 'Asst. Manager' WHERE designation = 'Junior Manager';

-- 4. the two old rows go, only if nobody holds them (and only if the row to keep is there)
DELETE FROM public.designation_grade g
 WHERE g.track = 'managerial' AND g.code = 201 AND g.title IN ('Asst. Manager', 'Junior Manager')
   AND EXISTS (SELECT 1 FROM public.designation_grade k WHERE k.track = 'managerial' AND k.title = 'Asst. Manager' AND k.code = 204)
   AND NOT EXISTS (SELECT 1 FROM public.employee_roster er WHERE er.designation_grade_id = g.id);

COMMIT;

-- THE RESULT: the designations, in the order of the form (the training ones are empty)
SELECT dg.id, dg.code, dg.title, dg.track, dg.rank_order, count(er.id) AS people
FROM public.designation_grade dg LEFT JOIN public.employee_roster er ON er.designation_grade_id = dg.id
GROUP BY dg.id ORDER BY dg.track, dg.rank_order, dg.id;

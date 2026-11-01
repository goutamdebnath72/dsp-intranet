-- 14_people_events.sql : date of birth and date of joining for the "People & Events" widget (steps 65a, 65b). Run in the Supabase SQL editor; safe to run again (see the note on re-running).
--
-- WHAT IT DOES
--   1. adds three columns to public.employee_roster (the table of ALL employees):
--        date_of_birth    date   (a calendar date: no time, no time zone, so no day can ever shift)
--        date_of_joining  date
--        dates_source     text   'hr' = a real date from the HR records, 'synthetic' = a PLACEHOLDER made up by this file
--   2. makes the database itself refuse a wrong pair of dates (so no later import, by anybody, can break the rules):
--        * nobody joins before the age of 18;
--        * an executive who joined DIRECTLY (a Management Trainee: ticket 49xxxx) not before 23.
--      (The ceiling of 32 at joining, the age limit of a recruitment advertisement, is kept in the placeholders below but NOT enforced here: a real record may carry an age relaxation.)
--   3. makes up PLACEHOLDER dates for every employee that has no real date, because the HR department has not supplied them yet (this is a development database with sample data). They are made up from
--      the ticket number, so running this file again gives the same dates; they are tied to seniority (a General Manager is not 26 years old); the age at joining is spread EVENLY between the
--      minimum (18, or 23 for a direct-recruit executive) and 32, the ceiling of a recruitment advertisement, so not everybody joins at the minimum; and every one satisfies the rules above and
--      is still "in service" today (nobody is past the retirement day, which is the last day of the month in which the age of 60 is reached).
--   WHERE THE DATES LIVE (decided 1 Nov 2026): as columns of employee_roster, next to the person, not in a separate table. THE ONE RULE THAT GOES WITH IT: if the roster is ever reloaded from an HR export,
--   UPDATE or UPSERT the rows by ticket number and NEVER empty, drop or re-create the table, because the three date columns (and the sample dates in them) would go with it.
--   NO INDEX is created on purpose: the widget reads the roster (about 6,500 rows) once per page view, and the test measured that read at a few milliseconds. An index on these
--   date expressions would only add work to every write. Add expression indexes if the roster ever grows past about 100,000 rows.
--   A REAL DATE (dates_source = 'hr') IS NEVER TOUCHED. NOTE ON RE-RUNNING: this file RE-MAKES every placeholder each time it is run (so a change of the rules is applied to all of them, and an earlier
--   version's dates are replaced); with the same employees the dates come out exactly the same, but if employees were added in between, the others' placeholders move by a few days (the ranking by
--   seniority moves). When HR gives the real dates, load them with dates_source = 'hr' (a date may also be loaded without any label: it is then simply not a placeholder).
--
-- TO UNDO THE PLACEHOLDERS (and only them) at any time:
--   UPDATE public.employee_roster SET date_of_birth = NULL, date_of_joining = NULL, dates_source = NULL WHERE dates_source = 'synthetic';
--
-- Like the rest of the roster, nothing here is visible to the AI search's read-only role (it sees only the nlq views, which name their columns).

BEGIN;

ALTER TABLE public.employee_roster
  ADD COLUMN IF NOT EXISTS date_of_birth   date,
  ADD COLUMN IF NOT EXISTS date_of_joining date,
  ADD COLUMN IF NOT EXISTS dates_source    text;

ALTER TABLE public.employee_roster DROP CONSTRAINT IF EXISTS employee_roster_dates_source_check;
ALTER TABLE public.employee_roster ADD CONSTRAINT employee_roster_dates_source_check
  CHECK (dates_source IS NULL OR dates_source IN ('hr', 'synthetic'));

-- (an earlier version of this file made a label compulsory for every date; that rule is removed)
ALTER TABLE public.employee_roster DROP CONSTRAINT IF EXISTS employee_roster_dates_labelled_check;

-- a date of birth that is plausible at all
ALTER TABLE public.employee_roster DROP CONSTRAINT IF EXISTS employee_roster_dob_range_check;
ALTER TABLE public.employee_roster ADD CONSTRAINT employee_roster_dob_range_check
  CHECK (date_of_birth IS NULL OR date_of_birth BETWEEN DATE '1930-01-01' AND DATE '2100-01-01');

-- the minimum age at joining: 18 for everybody, 23 for a direct-recruit executive (cohort 'executive' and a ticket 49xxxx: the second digit of an executive ticket never changes,
-- 9 = joined directly, any other digit = promoted from the non-executives)
ALTER TABLE public.employee_roster DROP CONSTRAINT IF EXISTS employee_roster_joining_age_check;
ALTER TABLE public.employee_roster ADD CONSTRAINT employee_roster_joining_age_check
  CHECK (
    date_of_birth IS NULL OR date_of_joining IS NULL
    OR date_of_joining >= (date_of_birth + (CASE WHEN cohort = 'executive' AND ticket_no ~ '^49[0-9]{4}$' THEN 23 ELSE 18 END) * INTERVAL '1 year')::date
  );

-- ---------------------------------------------------------------------------------------------------------------------------------
-- STEP 0: the placeholders of an earlier run are cleared (they are made again just below); a real date (dates_source = 'hr') is not touched
-- ---------------------------------------------------------------------------------------------------------------------------------
UPDATE public.employee_roster SET date_of_birth = NULL, date_of_joining = NULL, dates_source = NULL WHERE dates_source = 'synthetic';

-- ---------------------------------------------------------------------------------------------------------------------------------
-- PLACEHOLDER DATES (for every employee that has no date at all)
--   age today      about  60 - seniority * (60 - (youngest age + 1))  years, give or take 3 years: the most senior are near 60, the most junior just past the youngest age. The YOUNGEST age today is
--                  23 for a direct-recruit executive (a Management Trainee), 25 for a doctor (an MBBS takes years), 35 for an executive who was PROMOTED from the non-executives (he joined at 18 or later
--                  and is promoted after many years: an executive of 19 is impossible), 18 for a non-executive.
--                  Seniority is the person's place among the employees of the SAME cohort (executive / non-executive) by global_seniority_rank.
--                  The age is chosen in a window of about 6 years around that, inside [minimum joining age, still in service], so nobody is piled up on a boundary.
--   date joined    the age at joining is spread EVENLY from the minimum joining age (18, or 23 for a direct-recruit executive) up to 32 (a promotee executive joined as a non-executive,
--                  so his range is 18 to 32 too); never after today (a young employee has only the years he has lived).
--   a TRAINEE       a person whose designation is "Management Trainee" (or SOT, JOT, TA: the non-executives' training designations) is still in training (the designation changes to Asst. Manager when the service is made permanent), so he joined
--                  within the last 12 months, at an age spread evenly from the minimum to 32: his date of joining is chosen first, then his date of birth. (12 months is the assumed length of the training:
--                  change the 366 below if it is not.)
-- ---------------------------------------------------------------------------------------------------------------------------------
WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS d),
ranked AS (
  -- the place of each employee among ALL the employees of the same cohort (computed BEFORE the filter below, so that a new employee, filled later on his own, is still the junior he is)
  SELECT er.id, er.ticket_no, er.cohort, er.date_of_birth, er.date_of_joining,
         coalesce(dg.title ~* 'trainee' OR dg.title IN ('SOT', 'JOT', 'TA'), false) AS is_trainee,
         coalesce(dg.track = 'medical', false) AS is_medical,
         percent_rank() OVER (PARTITION BY er.cohort ORDER BY er.global_seniority_rank) AS seniority
  FROM public.employee_roster er
  LEFT JOIN public.designation_grade dg ON dg.id = er.designation_grade_id
),
base AS (
  SELECT r.id, r.is_trainee,
         -- the youngest age at joining: a direct recruit (49xxxx) and a doctor 23, everybody else 18
         CASE WHEN r.cohort = 'executive' AND r.ticket_no ~ '^49[0-9]{4}$' THEN 23 WHEN r.is_medical THEN 23 ELSE 18 END AS min_join,
         -- the youngest age TODAY: a direct recruit 23, a doctor 25, a promoted executive 35, a non-executive 18
         CASE WHEN r.cohort = 'executive' AND r.ticket_no ~ '^49[0-9]{4}$' THEN 23 WHEN r.is_medical THEN 25 WHEN r.cohort = 'executive' THEN 35 ELSE 18 END AS min_age_now,
         r.seniority,
         ('x' || substr(md5(r.ticket_no || ':dob'), 1, 7))::bit(28)::int AS h_dob,
         ('x' || substr(md5(r.ticket_no || ':doj'), 1, 7))::bit(28)::int AS h_doj
  FROM ranked r
  WHERE r.date_of_birth IS NULL AND r.date_of_joining IS NULL
),
window_days AS (
  SELECT b.id, b.min_join, b.h_dob, b.h_doj,
         -- the oldest age that is still in service today: the 60th birthday is in this month or later
         (t.d - date_trunc('month', t.d - INTERVAL '60 years')::date) AS max_age_days,
         -- the youngest: exactly the youngest age today
         (t.d - (t.d - b.min_age_now * INTERVAL '1 year')::date) AS min_age_days,
         round((60 - b.seniority * (60 - (b.min_age_now + 1))) * 365.25)::int AS target_days
  FROM base b CROSS JOIN today t
),
ages AS (
  SELECT w.id, w.min_join, w.h_doj,
         GREATEST(w.min_age_days, LEAST(w.max_age_days, w.target_days - 1096)) AS lo,
         LEAST(w.max_age_days, GREATEST(w.min_age_days, w.target_days + 1096)) AS hi,
         w.h_dob
  FROM window_days w
),
born AS (
  SELECT a.id, a.min_join, a.h_doj,
         (t.d - (a.lo + (a.h_dob % (GREATEST(a.hi - a.lo, 0) + 1)))::int) AS dob
  FROM ages a CROSS JOIN today t
),
joined AS (
  SELECT b.id, b.dob,
         ((b.dob + b.min_join * INTERVAL '1 year')::date
           + (b.h_doj % (LEAST(t.d - (b.dob + b.min_join * INTERVAL '1 year')::date, ((32 - b.min_join) * 365.25)::int) + 1))::int) AS doj
  FROM born b CROSS JOIN today t
),
trainees AS (
  -- a trainee: joined within the last 366 days, at an age spread evenly from the minimum to 32 (the date of joining first, the date of birth from it)
  SELECT b.id,
         (t.d - (b.h_doj % 366))::date AS doj,
         ((t.d - (b.h_doj % 366))::date - (b.min_join * INTERVAL '1 year' + (b.h_dob % (((32 - b.min_join) * 365.25)::int + 1)) * INTERVAL '1 day'))::date AS dob
  FROM base b CROSS JOIN today t
  WHERE b.is_trainee
),
final AS (
  SELECT j.id,
         coalesce(tr.dob, j.dob) AS dob,
         coalesce(tr.doj, j.doj) AS doj
  FROM joined j LEFT JOIN trainees tr ON tr.id = j.id
)
UPDATE public.employee_roster er
   SET date_of_birth = j.dob, date_of_joining = j.doj, dates_source = 'synthetic'
  FROM final j
 WHERE er.id = j.id AND er.date_of_birth IS NULL AND er.date_of_joining IS NULL;

COMMIT;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- CHECK THE RESULT (the first four must say 0; placeholder_rows is the number of employees without a real date)
-- ---------------------------------------------------------------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE date_of_birth IS NULL OR date_of_joining IS NULL)                                                                             AS employees_without_dates,
  count(*) FILTER (WHERE date_of_joining < (date_of_birth + (CASE WHEN cohort = 'executive' AND ticket_no ~ '^49[0-9]{4}$' THEN 23 ELSE 18 END) * INTERVAL '1 year')::date) AS joined_too_young,
  count(*) FILTER (WHERE date_of_joining > (now() AT TIME ZONE 'Asia/Kolkata')::date)                                                                 AS joined_in_the_future,
  count(*) FILTER (WHERE (date_trunc('month', date_of_birth + INTERVAL '60 years') + INTERVAL '1 month - 1 day')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date) AS past_retirement_day,
  count(*) FILTER (WHERE dates_source = 'synthetic')                                                                                                    AS placeholder_rows,
  count(*) FILTER (WHERE dates_source = 'hr')                                                                                                           AS real_rows
FROM public.employee_roster;

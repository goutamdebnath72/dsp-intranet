-- cleanup/sql/48b_doctor_flag_live.sql  (step 48b)
-- Run in the Supabase SQL editor ONE SECTION AT A TIME (the editor shows only the last statement's result).
--   1. CHECK  (read-only)   2. CHECK  (read-only)   3. FIX (one guarded transaction)   4. VERIFY (read-only, with the predicted numbers)
-- If section 3 stops with an error ("STOP: ..."), nothing was changed: run   ROLLBACK;   and send me the message.
--
-- What it does: (a) adds the roster column doctor_override and the view column nlq.employees.is_doctor (= the medical track OR doctor_override); (b) flags the 6 doctors who carry a managerial
-- designation (the designation is NOT touched); (c) removes Dr. Dadan Prasad (498976), transferred to IISCO Burnpur: his roster row, his login row (the rows that depend on the login
-- go with it: read marks, notification settings ...) and his row in nlq.employee_name_codes, as with the earlier departures. Tapas Kumar Saha (440887) is NOT touched.

-- ===== SECTION 1: CHECK the people (read-only) ==========================================================================
SELECT er.id, er.ticket_no, er.name, er.cohort, sd.code AS dept_code, dg.title AS designation, dg.track, er.user_id
FROM public.employee_roster er
JOIN public.designation_grade dg ON dg.id = er.designation_grade_id
LEFT JOIN public.sail_department sd ON sd.id = er.sail_department_id
WHERE er.ticket_no IN ('498976', '490041', '490178', '490179', '490180', '490181', '490182')
ORDER BY er.ticket_no;
-- expect 7 rows: 498976 DADAN PRASAD (Joint Director, medical, id 204) and the 6 doctors (490041 ARGHYA DAS, 490178 PRIYANK SAHOO, 490179 SOUMYARUPA MAJEE, 490180 DIPAK SINGH, 490181 ISHITA KONAR, 490182 CHETAN: all Sr. Manager, managerial, 500)

-- ===== SECTION 2: CHECK the counts before (read-only) ===================================================================
SELECT designation_track, count(*) AS people
FROM nlq.employees
WHERE cohort = 'executive' AND department_id IN (1, 89, 126, 135, 161, 180)
GROUP BY designation_track ORDER BY designation_track;
-- expect: managerial 23, medical 40

-- ===== SECTION 3: FIX (one guarded transaction) =========================================================================
BEGIN;

DO $$
DECLARE cols text; n int;
BEGIN
  SELECT string_agg(attname, ',' ORDER BY attnum) INTO cols FROM pg_attribute
   WHERE attrelid = 'nlq.employees'::regclass AND attnum > 0 AND NOT attisdropped;
  IF cols IS DISTINCT FROM 'id,ticket_no,sail_pno,name,cohort,designation,designation_code,designation_track,rank_order,grade_id,department,department_code,department_id,global_seniority_rank,within_grade_position,has_mobile,has_email,has_email_nic,has_webmail,has_address,name_words,name_codes' THEN
    RAISE EXCEPTION 'STOP: nlq.employees is not the view this change was written for (columns: %)', cols;
  END IF;
  SELECT count(*) INTO n FROM public.employee_roster er JOIN public.designation_grade dg ON dg.id = er.designation_grade_id
   WHERE er.id = 204 AND er.ticket_no = '498976' AND er.cohort = 'executive' AND er.user_id = '088680f1-320c-5d15-8b8e-231b31e6c360' AND dg.track = 'medical';
  IF n <> 1 THEN RAISE EXCEPTION 'STOP: DADAN PRASAD is not the expected roster row (found %)', n; END IF;
  SELECT count(*) INTO n FROM public.employee_roster er JOIN public.designation_grade dg ON dg.id = er.designation_grade_id
   WHERE er.cohort = 'executive' AND er.ticket_no IN ('490041', '490178', '490179', '490180', '490181', '490182') AND er.sail_department_id IN (1, 89, 126, 135, 161, 180) AND dg.track = 'managerial';
  IF n <> 6 THEN RAISE EXCEPTION 'STOP: the 6 doctors are not all managerial-track executives of the hospital rows (found %)', n; END IF;
  SELECT count(*) INTO n FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (1, 89, 126, 135, 161, 180) AND designation_track = 'medical';
  IF n <> 40 THEN RAISE EXCEPTION 'STOP: expected 40 medical-track executives in the hospital rows, found %', n; END IF;
  SELECT count(*) INTO n FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (1, 89, 126, 135, 161, 180) AND designation_track = 'managerial';
  IF n <> 23 THEN RAISE EXCEPTION 'STOP: expected 23 managerial-track executives in the hospital rows, found %', n; END IF;
END $$;

ALTER TABLE public.employee_roster ADD COLUMN IF NOT EXISTS doctor_override boolean;
COMMENT ON COLUMN public.employee_roster.doctor_override IS 'TRUE = a doctor whose designation is a normal managerial one (the designation is NOT touched). NULL = decided by the designation track alone. A roster rebuilt from the HR export must carry this column over.';

CREATE OR REPLACE VIEW nlq.employees AS
SELECT
  er.id,
  er.ticket_no,
  er.sail_pno,
  er.name,
  er.cohort,
  dg.title       AS designation,
  dg.code        AS designation_code,
  dg.track       AS designation_track,
  dg.rank_order,
  er.designation_grade_id AS grade_id,
  sd.name        AS department,
  sd.code        AS department_code,
  er.sail_department_id AS department_id,
  er.global_seniority_rank,
  er.within_grade_position,
  (u."contactNo" IS NOT NULL AND btrim(u."contactNo") <> '') AS has_mobile,
  (u.email       IS NOT NULL AND btrim(u.email)       <> '') AS has_email,
  (er.email_nic       IS NOT NULL AND btrim(er.email_nic)       <> '') AS has_email_nic,
  (er.webmail_saildsp IS NOT NULL AND btrim(er.webmail_saildsp) <> '') AS has_webmail,
  (er.address    IS NOT NULL AND btrim(er.address)    <> '') AS has_address,
  regexp_split_to_array(upper(btrim(er.name)), '\s+') AS name_words,
  er.name_codes,
  (dg.track = 'medical' OR coalesce(er.doctor_override, false)) AS is_doctor
FROM (
  SELECT r.*, coalesce(nc.codes, nlq.name_codes_of(r.name)) AS name_codes
  FROM public.employee_roster r
  LEFT JOIN nlq.employee_name_codes nc ON nc.id = r.id AND nc.name = r.name
  OFFSET 0
) er
JOIN public.designation_grade dg ON dg.id = er.designation_grade_id
LEFT JOIN public.sail_department sd ON sd.id = er.sail_department_id
LEFT JOIN public."user" u ON u.id = er.user_id;

DO $$
DECLARE n int;
BEGIN
  UPDATE public.employee_roster SET doctor_override = true WHERE cohort = 'executive' AND ticket_no IN ('490041', '490178', '490179', '490180', '490181', '490182');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'STOP: expected to flag 6 doctors, flagged %', n; END IF;
END $$;

DO $$
DECLARE n_roster int; n_user int;
BEGIN
  DELETE FROM nlq.employee_name_codes WHERE id = 204;
  DELETE FROM public.employee_roster WHERE id = 204 AND ticket_no = '498976';
  GET DIAGNOSTICS n_roster = ROW_COUNT;
  DELETE FROM public."user" WHERE id = '088680f1-320c-5d15-8b8e-231b31e6c360' AND "ticketNo" = '498976';
  GET DIAGNOSTICS n_user = ROW_COUNT;
  IF n_roster <> 1 OR n_user <> 1 THEN RAISE EXCEPTION 'STOP: expected to remove 1 roster row and 1 login row, removed % and %', n_roster, n_user; END IF;
END $$;

DO $$
DECLARE d int; o int;
BEGIN
  SELECT count(*) INTO d FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (1, 89, 126, 135, 161, 180) AND is_doctor;
  SELECT count(*) INTO o FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (1, 89, 126, 135, 161, 180) AND NOT is_doctor;
  IF d <> 45 OR o <> 17 THEN RAISE EXCEPTION 'STOP: expected 45 doctors and 17 non-medical after the change, found % and %', d, o; END IF;
END $$;

COMMIT;

-- ===== SECTION 4: VERIFY (read-only; the predicted number is written after each line) ===================================
SELECT 'doctors in the hospital rows (is_doctor)' AS what, count(*) AS n FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (1, 89, 126, 135, 161, 180) AND is_doctor        -- 45
UNION ALL SELECT 'non-medical in the hospital rows', count(*) FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (1, 89, 126, 135, 161, 180) AND NOT is_doctor                     -- 17
UNION ALL SELECT 'DADAN PRASAD in the roster', count(*) FROM public.employee_roster WHERE ticket_no = '498976'                                                -- 0
UNION ALL SELECT 'DADAN PRASAD login row', count(*) FROM public."user" WHERE "ticketNo" = '498976'                                                              -- 0
UNION ALL SELECT 'people flagged by hand', count(*) FROM public.employee_roster WHERE doctor_override IS TRUE                                                                     -- 6
UNION ALL SELECT 'a flagged doctor is_doctor (490041)', count(*) FROM nlq.employees WHERE ticket_no = '490041' AND is_doctor                                 -- 1
UNION ALL SELECT 'Tapas Kumar Saha still in HR (102)', count(*) FROM nlq.employees WHERE ticket_no = '440887' AND department_code = 102 AND NOT is_doctor;                       -- 1

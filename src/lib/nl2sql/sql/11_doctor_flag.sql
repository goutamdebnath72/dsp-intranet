-- 11_doctor_flag.sql  (step 48b)
-- Doctors and non-medical executives. A doctor is on the MEDICAL track of designation_grade, or is flagged here: a few doctors carry a normal managerial designation
-- (an eye specialist who is a "Sr. Manager" in the HR tool) and their designation must not be touched. nlq.employees gets ONE more column, at the end: is_doctor.
-- Idempotent. The live data change (which people to flag) is in cleanup/sql/48b_doctor_flag_live.sql, not here.

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

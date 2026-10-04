-- 04_fix_name_codes_permission.sql
-- Fixes "permission denied for schema public" when a query uses name_codes / the
-- name-matching helpers. Run this whole file once on the live database. Safe to re-run.
-- NOTE: SUPERSEDED. 05_fast_name_codes.sql and 06_spelling_families.sql replace this file. Do NOT run 04
-- after 05 or 06: it would put back an older version of nlq.name_codes_of (without the spelling rule).
-- (01_nlq_schema_views_role.sql has been updated to include the same change for fresh installs.)

CREATE OR REPLACE FUNCTION nlq.name_codes_of(full_name text) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.name_phonetic_codes(full_name)
$$;

GRANT EXECUTE ON FUNCTION nlq.name_codes_of(text) TO nlq_reader;

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
  nlq.name_codes_of(er.name)                          AS name_codes
FROM public.employee_roster er
JOIN public.designation_grade dg ON dg.id = er.designation_grade_id
LEFT JOIN public.sail_department sd ON sd.id = er.sail_department_id
LEFT JOIN public."user" u ON u.id = er.user_id;

-- Proof: the restricted role must now be able to use the phonetic columns, and must STILL be
-- locked out of schema public. The first block should succeed; the second must ERROR.
DO $$
BEGIN
  SET LOCAL ROLE nlq_reader;
  PERFORM count(*) FROM nlq.employees WHERE nlq.word_like(name_words, name_codes, 'kumar');
  RESET ROLE;
END $$;

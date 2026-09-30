-- 05_fast_name_codes.sql
-- Makes phonetic name matching fast (a query that took 6.4 s now takes milliseconds).
-- Run this whole file once on the live database. Safe to re-run. It adds ONE new table and
-- replaces the view and the three helper functions; it changes no existing table.
--
-- Why it was slow: the phonetic code of every name was recomputed for every employee, several
-- times per query. Now the codes are stored once, and the helpers are plain SQL the database
-- can optimise (they were needlessly SECURITY DEFINER, which stops that).
--
-- Correctness is self-protecting: a stored row is used only if its stored NAME still equals the
-- employee's current name; otherwise the code is computed live. So a renamed or brand-new
-- employee is never answered from stale data. After changing the phonetic functions themselves
-- (e.g. adding a synonym), run:   SELECT nlq.refresh_name_codes();

CREATE TABLE IF NOT EXISTS nlq.employee_name_codes (
  id    integer PRIMARY KEY,
  name  text   NOT NULL,
  codes text[] NOT NULL
);

CREATE OR REPLACE FUNCTION nlq.refresh_name_codes() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE n integer;
BEGIN
  DELETE FROM nlq.employee_name_codes;
  INSERT INTO nlq.employee_name_codes (id, name, codes)
  SELECT er.id, er.name, coalesce(public.name_phonetic_codes(er.name), ARRAY[]::text[])
  FROM public.employee_roster er;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION nlq.refresh_name_codes() FROM PUBLIC;
REVOKE ALL ON TABLE nlq.employee_name_codes FROM PUBLIC;

SELECT nlq.refresh_name_codes() AS rows_stored;

-- name_codes is produced in an inner step (OFFSET 0 keeps it as a plain column). That matters:
-- the database only optimises the helper functions when their input is a plain column, not a
-- computed expression.
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
  er.name_codes
FROM (
  SELECT r.*, coalesce(nc.codes, nlq.name_codes_of(r.name)) AS name_codes
  FROM public.employee_roster r
  LEFT JOIN nlq.employee_name_codes nc ON nc.id = r.id AND nc.name = r.name
  OFFSET 0
) er
JOIN public.designation_grade dg ON dg.id = er.designation_grade_id
LEFT JOIN public.sail_department sd ON sd.id = er.sail_department_id
LEFT JOIN public."user" u ON u.id = er.user_id;

-- The three helpers, without SECURITY DEFINER: they only call nlq.code (already granted), and
-- as plain SQL the database can pre-compute the constant word once instead of per employee.
CREATE OR REPLACE FUNCTION nlq.word_like(words text[], codes text[], w text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(upper(btrim(w)) = ANY(words), false)
      OR coalesce(nlq.code(w, true)  = ANY(codes), false)
      OR coalesce(nlq.code(w, false) = ANY(codes), false)
$$;

CREATE OR REPLACE FUNCTION nlq.first_word_like(words text[], codes text[], w text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(words[1] = upper(btrim(w)), false)
      OR coalesce(codes[1] = nlq.code(w, false), false)
$$;

CREATE OR REPLACE FUNCTION nlq.last_word_like(words text[], codes text[], w text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(words[cardinality(words)] = upper(btrim(w)), false)
      OR coalesce(codes[cardinality(codes)] = nlq.code(w, true), false)
$$;

GRANT EXECUTE ON FUNCTION
  nlq.word_like(text[], text[], text), nlq.first_word_like(text[], text[], text), nlq.last_word_like(text[], text[], text)
TO nlq_reader;

-- Proof 1: stored codes agree with live codes for everyone (drift check; expect 0).
SELECT count(*) AS stored_codes_that_differ_from_live
FROM nlq.employee_name_codes nc
JOIN public.employee_roster er ON er.id = nc.id AND er.name = nc.name
WHERE nc.codes IS DISTINCT FROM coalesce(public.name_phonetic_codes(er.name), ARRAY[]::text[]);

-- Proof 2 (keep this LAST): the restricted role can use the phonetic columns. It raises an error
-- if not, which undoes this whole file. RESET ROLE matters: the SQL editor runs a file as one
-- transaction, so without it the role switch would leak into anything placed after this block.
DO $$
BEGIN
  SET LOCAL ROLE nlq_reader;
  PERFORM count(*) FROM nlq.employees WHERE nlq.word_like(name_words, name_codes, 'kumar');
  RESET ROLE;
END $$;

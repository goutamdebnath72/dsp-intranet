-- 01_nlq_schema_views_role.sql
-- EXPERIMENT: natural-language -> SQL written by the LLM. This file creates the
-- ONLY objects the LLM-written SQL may touch, and the role it runs as.
-- Additive and idempotent: nothing existing is modified or dropped.
--
-- PREREQUISITES (already in your database, per earlier sessions):
--   public.employee_roster, public.designation_grade, public.sail_department,
--   public."user", and the phonetic functions
--   public.indic_fold(text), public.name_synonym_normalize(text, boolean),
--   public.name_phonetic_codes(text).
--
-- SECURITY MODEL
--   * The LLM's SQL runs as role nlq_reader, inside a READ ONLY transaction,
--     with a statement timeout (see executor.ts).
--   * nlq_reader can SELECT only from the three views below and EXECUTE only
--     nlq.norm / nlq.code. It has NO privilege on public."user" (passwords,
--     tokens), employee_roster, or anything else.
--   * The views deliberately expose NO phone numbers, email addresses or
--     street addresses -- only yes/no flags such as has_email_nic -- so a
--     query can COUNT people without email but can never READ an address.
-- Run this whole file at once.

CREATE SCHEMA IF NOT EXISTS nlq;

-- Punctuation/case-insensitive text normalizer: nlq.norm('C & IT') = 'c and it'
CREATE OR REPLACE FUNCTION nlq.norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(lower(replace(coalesce(t, ''), '&', ' and ')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- Spelling families whose variants the phonetic code cannot see. The -padhyay surnames are written
-- many ways (Mukhopadhyay / Mukhopadhya / Mukhopadhayay ...). Any "-padhya / -padhyaya / -padhayay"
-- ending after the stems Mukho-, Bando-/Bandyo-, Chatto-, Gango- is treated as the full "-padhyay"
-- form, for typed words AND for stored names. Only those four stems, so Upadhyay, Padhi etc. are
-- untouched. (Mukherji / Banerji / Chatterji / Ganguli already share a code with their family.)
CREATE OR REPLACE FUNCTION nlq.spelling_fix(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
         regexp_replace(
         regexp_replace(
         regexp_replace(coalesce(t, ''),
           '\mMUKH?[OA]PADH[AY]{1,5}\M',    'MUKHOPADHYAY',  'gi'),
           '\mBAND[YH]?OPADH[AY]{1,5}\M',   'BANDYOPADHYAY', 'gi'),
           '\mCHATT?OPADH[AY]{1,5}\M',      'CHATTOPADHYAY', 'gi'),
           '\mGANG[OA]PADH[AY]{1,5}\M',     'GANGOPADHYAY',  'gi')
$$;

-- Phonetic code of ONE word, the same code stored in nlq.employees.name_codes.
-- as_last = true applies last-word (surname) synonyms, e.g. NATH -> DEBNATH.
-- SECURITY DEFINER with a pinned search_path so the reader role needs no
-- access to schema public.
CREATE OR REPLACE FUNCTION nlq.code(word text, as_last boolean DEFAULT false) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.indic_fold(public.name_synonym_normalize(nlq.spelling_fix(word), as_last))
$$;

-- Phonetic codes of a whole name, for the view below. WHY THIS WRAPPER EXISTS: the view
-- calls a function that lives in schema public, and functions called from a view run with
-- the privileges of the person querying (nlq_reader), who is deliberately locked out of
-- schema public. SECURITY DEFINER runs this one small function as its owner instead, so the
-- restricted role never needs any access to public.
CREATE OR REPLACE FUNCTION nlq.name_codes_of(full_name text) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.name_phonetic_codes(nlq.spelling_fix(full_name))
$$;

-- Stored phonetic codes (fast). A stored row is used only while its stored NAME still equals the
-- employee's current name, otherwise the code is computed live, so answers are never stale.
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
  SELECT er.id, er.name, coalesce(nlq.name_codes_of(er.name), ARRAY[]::text[])
  FROM public.employee_roster er;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION nlq.refresh_name_codes() FROM PUBLIC;
REVOKE ALL ON TABLE nlq.employee_name_codes FROM PUBLIC;

-- The phonetic layer, as three NULL-SAFE building blocks the LLM combines freely with AND / OR /
-- NOT. "Similar spelling": the typed word matches a name word if it is the same word
-- (case-insensitive) OR has the same phonetic code (Roy=Ray, Mazumdar=Majumdar=Majumder,
-- Nath=Debnath as a last word ...). Arguments are the employee's name_words / name_codes columns.
-- Every branch is wrapped in coalesce so the result is never NULL (a NULL would silently drop the
-- row under NOT(...)). They are plain SQL, not SECURITY DEFINER, so the database can optimise them.
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


CREATE OR REPLACE VIEW nlq.designations AS
SELECT id, code, title, track, rank_order
FROM public.designation_grade;

CREATE OR REPLACE VIEW nlq.departments AS
SELECT id, code, name, cohort_scope
FROM public.sail_department;

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

-- The read-only role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nlq_reader') THEN
    CREATE ROLE nlq_reader NOLOGIN NOINHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA nlq TO nlq_reader;
GRANT SELECT ON nlq.employees, nlq.designations, nlq.departments TO nlq_reader;
GRANT EXECUTE ON FUNCTION
  nlq.norm(text), nlq.code(text, boolean), nlq.name_codes_of(text),
  nlq.word_like(text[], text[], text), nlq.first_word_like(text[], text[], text), nlq.last_word_like(text[], text[], text)
TO nlq_reader;

-- Let the application's own login role assume nlq_reader (SET ROLE).
-- If the app connects as a different role than the one running this file,
-- run:  GRANT nlq_reader TO <that_role>;
GRANT nlq_reader TO CURRENT_USER;

-- Fill the stored phonetic codes once (re-run after changing the phonetic functions).
SELECT nlq.refresh_name_codes() AS phonetic_codes_stored;

-- Verify (expect 3 views + 2 functions; last query must show nlq_reader has
-- NO table privileges outside nlq):
SELECT table_schema, table_name FROM information_schema.views WHERE table_schema = 'nlq' ORDER BY 2;

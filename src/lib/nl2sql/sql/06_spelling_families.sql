-- 06_spelling_families.sql
-- Teaches the name search that spelling variants of the -padhyay surnames are the same name:
-- Mukhopadhya / Mukhopadhayay -> Mukhopadhyay (= Mukherjee), Gangopadhya -> Gangopadhyay
-- (= Ganguly = Ganguli), likewise Bandyopadhya (= Banerjee) and Chattopadhya (= Chatterjee).
-- Works for typed words and for stored names. Stays inside the nlq schema: your phonetic functions
-- in schema public are NOT changed, so the old omnibar search is unaffected.
-- Run this whole file once. Safe to re-run. (A fresh install needs only 01, which now includes this.)

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

CREATE OR REPLACE FUNCTION nlq.code(word text, as_last boolean DEFAULT false) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.indic_fold(public.name_synonym_normalize(nlq.spelling_fix(word), as_last))
$$;

CREATE OR REPLACE FUNCTION nlq.name_codes_of(full_name text) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.name_phonetic_codes(nlq.spelling_fix(full_name))
$$;

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

-- Re-store the phonetic codes with the new rule.
SELECT nlq.refresh_name_codes() AS rows_stored;

-- Proof 1 (plain query): stored codes agree with live codes for everyone (expect 0).
SELECT count(*) AS stored_codes_that_differ_from_live
FROM nlq.employee_name_codes nc
JOIN public.employee_roster er ON er.id = nc.id AND er.name = nc.name
WHERE nc.codes IS DISTINCT FROM coalesce(nlq.name_codes_of(er.name), ARRAY[]::text[]);

-- Proof 2 (keep this LAST): the restricted role still works with the phonetic columns, and the new
-- spellings now share a code. An error here undoes the whole file. RESET ROLE matters because the SQL
-- editor runs a file as one transaction.
DO $$
BEGIN
  SET LOCAL ROLE nlq_reader;
  PERFORM count(*) FROM nlq.employees WHERE nlq.word_like(name_words, name_codes, 'mukherjee');
  IF nlq.code('gangopadhya', true)  <> nlq.code('ganguly', true)
  OR nlq.code('mukhopadhya', true)  <> nlq.code('mukherjee', true)
  OR nlq.code('bandyopadhya', true) <> nlq.code('banerjee', true)
  OR nlq.code('chattopadhya', true) <> nlq.code('chatterjee', true) THEN
    RAISE EXCEPTION 'spelling families are not matching';
  END IF;
  IF nlq.code('mukherjee', true) = nlq.code('banerjee', true) THEN
    RAISE EXCEPTION 'different families must stay different';
  END IF;
  RESET ROLE;
END $$;

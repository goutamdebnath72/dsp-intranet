-- 99_local_test_standins.sql
-- *** TEST ONLY -- DO NOT RUN ON YOUR REAL DATABASE. ***
-- Creates minimal copies of the tables and phonetic functions the experiment
-- depends on, so the whole pipeline can be tested on a scratch local Postgres.
-- The functions here are re-implemented from the JavaScript port in
-- src/lib/employees/namePredicate.ts; the REAL ones live in your database.
-- (The selftest checks these stand-ins against that JavaScript port.)

CREATE TABLE public.designation_grade (
  id smallint PRIMARY KEY, code integer NOT NULL, title text NOT NULL,
  track text NOT NULL, rank_order integer NOT NULL
);
CREATE TABLE public.sail_department (
  id smallint PRIMARY KEY, code integer NOT NULL, name text NOT NULL,
  cohort_scope text NOT NULL DEFAULT 'shared'
);
CREATE TABLE public."user" (
  id text PRIMARY KEY, name text, email text, password text, "contactNo" text,
  "ticketNo" text, name_phonetic text[]
);
CREATE TABLE public.employee_roster (
  id serial PRIMARY KEY, ticket_no text NOT NULL, sail_pno text, name text NOT NULL,
  designation_grade_id smallint NOT NULL REFERENCES public.designation_grade(id),
  sail_department_id smallint REFERENCES public.sail_department(id),
  cohort text NOT NULL, within_grade_position integer NOT NULL,
  global_seniority_rank integer NOT NULL, user_id text,
  address text, webmail_saildsp text, email_nic text
);

CREATE OR REPLACE FUNCTION public.indic_fold(word text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE w text; consonants int;
BEGIN
  w := upper(coalesce(word, ''));
  w := regexp_replace(w, '[^A-Z]', '', 'g');
  IF w = '' THEN RETURN ''; END IF;
  w := regexp_replace(w, 'C(?!H)', 'K', 'g');
  w := replace(w, 'SHH', 'S'); w := replace(w, 'CHH', 'C'); w := replace(w, 'KSH', 'X');
  w := replace(w, 'PH', 'F');  w := replace(w, 'BH', 'B');  w := replace(w, 'DH', 'D');
  w := replace(w, 'GH', 'G');  w := replace(w, 'KH', 'K');  w := replace(w, 'JH', 'J');
  w := replace(w, 'TH', 'T');  w := replace(w, 'SH', 'S');  w := replace(w, 'ZH', 'J');
  w := replace(w, 'CH', 'C');  w := replace(w, 'WH', 'W');  w := replace(w, 'CK', 'K');
  w := replace(w, 'AA', 'A');  w := replace(w, 'EE', 'I');  w := replace(w, 'OO', 'U');
  w := replace(w, 'OU', 'O');  w := replace(w, 'AU', 'O');  w := replace(w, 'OW', 'O');
  w := replace(w, 'AW', 'O');  w := replace(w, 'AI', 'E');  w := replace(w, 'AY', 'E');
  w := replace(w, 'OY', 'O');  w := replace(w, 'EY', 'E');  w := replace(w, 'EI', 'E');
  w := replace(w, 'IE', 'I');  w := replace(w, 'EA', 'I');  w := replace(w, 'UU', 'U');
  w := replace(w, 'OI', 'O');  w := replace(w, 'UI', 'U');
  w := translate(w, 'VWFZQY', 'BBPSKI');
  w := replace(w, 'X', 'KS');
  IF length(w) > 1 THEN w := substr(w, 1, 1) || replace(substr(w, 2), 'H', ''); END IF;
  w := regexp_replace(w, '(.)\1+', '\1', 'g');
  consonants := length(regexp_replace(w, '[AEIOU]', '', 'g'));
  IF consonants >= 3 THEN
    w := translate(w, 'EIOU', 'AAAA');
    w := regexp_replace(w, 'A+', 'A', 'g');
  END IF;
  RETURN w;
END $$;

CREATE OR REPLACE FUNCTION public.name_synonym_normalize(tok text, is_last boolean DEFAULT true) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(tok) = 'nath' AND is_last THEN 'debnath'
    WHEN lower(tok) = 'ray' THEN 'roy'
    WHEN lower(tok) IN ('mazumdar', 'mazumder') THEN 'majumdar'
    WHEN lower(tok) = 'surinder' THEN 'surendra'
    WHEN lower(tok) = 'aggrawal' THEN 'aggarwal'
    WHEN lower(tok) = 'ghose' THEN 'ghosh'
    WHEN lower(tok) IN ('basu', 'bosu') THEN 'bose'
    WHEN lower(tok) IN ('dutt', 'dut') THEN 'dutta'
    WHEN lower(tok) = 'singha' THEN 'sinha'
    WHEN lower(tok) IN ('bandyopadhyay', 'bandopadhyay') THEN 'banerjee'
    WHEN lower(tok) = 'chattopadhyay' THEN 'chatterjee'
    WHEN lower(tok) = 'mukhopadhyay' THEN 'mukherjee'
    WHEN lower(tok) = 'gangopadhyay' THEN 'ganguly'
    ELSE tok
  END
$$;

-- Tokens shorter than 2 characters (initials) are dropped; is_last applies
-- only to the last KEPT token (matches the live function's behaviour).
CREATE OR REPLACE FUNCTION public.name_phonetic_codes(full_name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg(public.indic_fold(public.name_synonym_normalize(tok, ord = total)) ORDER BY ord), ARRAY[]::text[])
  FROM (
    SELECT tok, ord, count(*) OVER () AS total
    FROM (
      SELECT t.tok, row_number() OVER (ORDER BY t.o) AS ord
      FROM unnest(regexp_split_to_array(btrim(full_name), '\s+')) WITH ORDINALITY AS t(tok, o)
      WHERE length(regexp_replace(t.tok, '[.,:]', '', 'g')) >= 2
    ) kept
  ) q
$$;

-- Match Supabase: the public schema is NOT open to arbitrary roles. (A stock local Postgres
-- lets everyone in, which hid a real permission bug during the first round of local tests.)
REVOKE ALL ON SCHEMA public FROM PUBLIC;

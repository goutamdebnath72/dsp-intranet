-- 08_health_checkups.sql
-- The monthly HEALTH CHECK-UP schedules of non-executive employees (an annexure of a circular), as data: who is called on which date.
-- Filled by scripts/import-health-checkups.ts, which reads the roster pages (the date of a group is printed once in a merged cell: it is
-- taken from that cell's ruled lines) and checks every row against the HR directory. Additive and idempotent. Run this whole file at once.
--
-- status: 'verified'   ticket and name agree with the HR directory
--         'corrected'  the ticket was misread; the one HR employee with this name and department was used (status_note says so)
--         'unverified' not confirmed against HR (usually a person no longer in the HR directory). The table keeps ticket_no NULL for these;
--                      the VIEW below still shows the ticket as PRINTED in the circular, with verified = false (Yes/No on screen), so a person
--                      is never shown without their ticket. Two cases are NOT shown with a ticket, because it may belong to someone else:
--                      the printed ticket is another HR employee's (status_note "belongs to") or appears twice in the schedule.

CREATE TABLE IF NOT EXISTS public.health_checkup_schedule (
  id                      serial PRIMARY KEY,
  circular_id             integer  NOT NULL REFERENCES public.circulars(id) ON DELETE CASCADE,
  schedule_year           smallint NOT NULL,
  schedule_month          smallint NOT NULL CHECK (schedule_month BETWEEN 1 AND 12),
  seq                     integer  NOT NULL,            -- position in the roster, 1..n
  page_number             smallint,
  ticket_printed          text,                         -- as read from the page
  ticket_no               text,                         -- confirmed against HR (NULL = not confirmed)
  name_printed            text     NOT NULL,
  department_code_printed integer,
  department_printed      text,
  checkup_date            date,
  date_printed            text,
  date_note               text,                         -- set when a printed date was corrected (a typo in the circular itself)
  status                  text     NOT NULL CHECK (status IN ('verified', 'corrected', 'unverified')),
  status_note             text,
  imported_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (circular_id, seq)
);
CREATE INDEX IF NOT EXISTS health_checkup_ticket_idx   ON public.health_checkup_schedule (ticket_no);
CREATE INDEX IF NOT EXISTS health_checkup_month_idx    ON public.health_checkup_schedule (schedule_year, schedule_month);
CREATE INDEX IF NOT EXISTS health_checkup_date_idx     ON public.health_checkup_schedule (checkup_date);

-- What the question-answering engine may read. Dates come out as plain text 'YYYY-MM-DD' (no time-zone surprises, sorts correctly).
-- The department is the one PRINTED in that schedule (an employee may have moved since). name/name_words/name_codes come from HR when the
-- ticket is confirmed, so the name helpers work exactly as on nlq.employees.
CREATE OR REPLACE VIEW nlq.health_checkups AS
SELECT
  CASE
    WHEN h.ticket_no IS NOT NULL THEN h.ticket_no
    WHEN h.status_note ILIKE '%belongs to%' OR h.status_note ILIKE '%appears twice%' THEN NULL
    ELSE h.ticket_printed
  END                                                                           AS ticket_no,
  coalesce(e.name, h.name_printed)                                              AS name,
  h.department_code_printed                                                     AS department_code,
  h.department_printed                                                          AS department,
  to_char(h.checkup_date, 'YYYY-MM-DD')                                         AS checkup_date,
  h.schedule_year::int                                                          AS schedule_year,
  h.schedule_month::int                                                         AS schedule_month_no,
  trim(to_char(make_date(h.schedule_year, h.schedule_month, 1), 'Month')) || ' ' || h.schedule_year AS schedule,
  'Circular ' || lpad(c."serialNumber"::text, 3, '0') || ' (' || extract(year FROM c."publishedAt")::int || ')' AS circular,
  (h.status IN ('verified', 'corrected'))                                       AS verified,
  coalesce(e.name_words, regexp_split_to_array(upper(btrim(h.name_printed)), '\s+')) AS name_words,
  coalesce(e.name_codes, nlq.name_codes_of(h.name_printed))                     AS name_codes,
  -- appended for the answer's "Source" line (a click opens the circular at the page of the person); the question-answering model is not told about them
  c.id                                                                          AS circular_id,
  c.headline                                                                    AS circular_title,
  h.page_number::int                                                            AS page_number
FROM public.health_checkup_schedule h
JOIN public.circulars c ON c.id = h.circular_id
LEFT JOIN nlq.employees e ON e.ticket_no = h.ticket_no;

GRANT SELECT ON nlq.health_checkups TO nlq_reader;

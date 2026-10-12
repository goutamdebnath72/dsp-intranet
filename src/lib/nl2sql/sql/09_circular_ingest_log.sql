-- 09_circular_ingest_log.sql
--
-- What the upload DECIDED about each circular, one row per upload: which kind it recognised, what it did, and why. Nothing reads this to answer a
-- question; it is the backend's memory, so that "why is there no health check-up data for this circular?" can be answered by looking:
--
--   SELECT c.id, c."serialNumber", l.kind, l.status, l.detail, l.created_at
--   FROM public.circular_ingest_log l JOIN public.circulars c ON c.id = l.circular_id ORDER BY l.id DESC LIMIT 10;
--
-- kind:   'health-schedule'  the pages hold a roster table (T.No / Name / Deptt.Code / Department / Date): read into health_checkup_schedule
--         'holiday-list'     the employee holiday-list circular: display only (its facts are seeded from a curated file)
--         'general'          anything else: read, chunked and embedded as always
-- status: 'applied'      a health schedule was read, checked against HR and stored
--         'needs-review' it was read but something looked wrong (the detail says what): NOT stored; run scripts/import-health-checkups.ts to look
--         'timeout'      the upload ran out of time before it could finish reading the schedule: run the tool
--         'failed'       the reading or the storing failed (the detail says why): run the tool
--         'saved'        a general or holiday-list circular, saved as usual
--
-- Deleting a circular deletes its rows here too (ON DELETE CASCADE), so a deleted and re-uploaded circular starts with a clean history.
-- Safe to run more than once. The upload keeps working if this table does not exist (it only writes the log when it can).

CREATE TABLE IF NOT EXISTS public.circular_ingest_log (
  id          bigserial PRIMARY KEY,
  circular_id integer     NOT NULL REFERENCES public.circulars(id) ON DELETE CASCADE,
  kind        text        NOT NULL,
  status      text        NOT NULL,
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS circular_ingest_log_circular_idx ON public.circular_ingest_log (circular_id);

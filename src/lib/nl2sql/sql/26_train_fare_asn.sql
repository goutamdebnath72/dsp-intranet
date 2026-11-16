-- 26_train_fare_asn.sql
--
-- The saved fares of the trains of the ASANSOL tab, from Asansol (ASN) to the end of each run (src/lib/live/fareStore.ts, station "ASN"): the trains that stop at Asansol and not at Durgapur. Same shape as
-- public.train_fare (21_train_fare.sql), which holds the trains that stop at Durgapur; no train is in both tables, because a train that stops at both is a Durgapur train. The fares are the railway's reservation
-- system's own, through RailRadar's paid fare service (used for one month only, to 14 Dec 2026); fetched_at is when they were received and the card shows it.
--
-- Safe to run more than once. The application also creates this table by itself on first use if its database user may; running this file is the clean way.
-- Nothing in it is personal data. To start again:  DELETE FROM public.train_fare_asn;

CREATE TABLE IF NOT EXISTS public.train_fare_asn (
  train_number  text         PRIMARY KEY,                -- the five-digit number, "12301"
  train_name    text         NOT NULL,
  to_code       text         NOT NULL,                   -- the station code at the end of the run, "NDLS"
  journey_date  date         NOT NULL,                   -- the day the fares were asked for (a day the train is at Asansol)
  distance_km   numeric      NOT NULL,                   -- Asansol to the end station, as the railway gives it
  classes       jsonb        NOT NULL,                   -- [{code, name, total, parts:[{label, amount}]}], only the classes the train has
  fetched_at    timestamptz  NOT NULL                    -- when the fares were received from RailRadar
);

ALTER TABLE public.train_fare_asn ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.train_fare_asn FROM anon, authenticated;

SELECT count(*) AS saved_trains, min(fetched_at) AS oldest, max(fetched_at) AS newest FROM public.train_fare_asn;

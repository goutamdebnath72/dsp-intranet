-- 21_train_fare.sql
--
-- The saved fares of the trains that stop at Durgapur (src/lib/live/fareStore.ts). One row per train: the fares from Durgapur to the end of its run, for each class the
-- train has, as the railway's reservation system gave them through RailRadar's paid fare service, and THE TIME THEY WERE RECEIVED (fetched_at), which the card shows
-- as "Fares last received ...". The paid service is used for one month only (to 14 Dec 2026): until then rows are refreshed; after it, the rows stay as they are, and
-- the card says so.
--
-- Safe to run more than once. The application also creates this table by itself on first use if its database user may; running this file is the clean way.
-- Nothing in it is personal data. To start again:  DELETE FROM public.train_fare;

CREATE TABLE IF NOT EXISTS public.train_fare (
  train_number  text         PRIMARY KEY,                -- the five-digit number, "12019"
  train_name    text         NOT NULL,
  to_code       text         NOT NULL,                   -- the station code at the end of the run, "RNC"
  journey_date  date         NOT NULL,                   -- the day the fares were asked for (a day the train is at Durgapur)
  distance_km   numeric      NOT NULL,                   -- Durgapur to the end station, as the railway gives it
  classes       jsonb        NOT NULL,                   -- [{code, name, total, parts:[{label, amount}]}], only the classes the train has
  fetched_at    timestamptz  NOT NULL                    -- when the fares were received from RailRadar
);

ALTER TABLE public.train_fare ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.train_fare FROM anon, authenticated;

SELECT count(*) AS saved_trains, min(fetched_at) AS oldest, max(fetched_at) AS newest FROM public.train_fare;

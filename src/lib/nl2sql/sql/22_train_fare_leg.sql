-- 22_train_fare_leg.sql
--
-- The saved fares from Durgapur to EVERY STOP after Durgapur on a train's route (src/lib/live/fareLegStore.ts): one row per train and stop, with the fares of each class the train sells between the two, as the railway's
-- reservation system gave them through RailRadar's paid fare service (for a local MEMU train: the hint from the railway's published fare table), and THE TIME THEY WERE RECEIVED (fetched_at). Collected by
-- scripts/harvest-legs.ts while the paid month lasts (to 14 Dec 2026); after it the rows stay as they are and the card says so. The end-of-run fare of each train is in public.train_fare (21_train_fare.sql).
--
-- Safe to run more than once. The application also creates this table by itself on first use if its database user may; running this file is the clean way.
-- Nothing in it is personal data. To start again:  DELETE FROM public.train_fare_leg;

CREATE TABLE IF NOT EXISTS public.train_fare_leg (
  train_number  text         NOT NULL,                  -- the five-digit number, "12019"
  to_code       text         NOT NULL,                  -- the stop's station code, "ASN"
  to_name       text         NOT NULL,                  -- the name RailRadar gives it
  seq           integer      NOT NULL,                  -- its place in the train's route (grows along the run)
  distance_km   numeric      NOT NULL,                  -- from Durgapur
  journey_date  date         NOT NULL,                  -- the day the fares were asked for
  classes       jsonb        NOT NULL,                  -- [{code, name, total, high?, basis?, parts:[{label, amount}]}]
  fetched_at    timestamptz  NOT NULL,                  -- when the fares were received
  PRIMARY KEY (train_number, to_code)
);

ALTER TABLE public.train_fare_leg ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.train_fare_leg FROM anon, authenticated;

SELECT count(*) AS saved_legs, count(DISTINCT train_number) AS trains, min(fetched_at) AS oldest, max(fetched_at) AS newest FROM public.train_fare_leg;

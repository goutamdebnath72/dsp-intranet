-- 27_train_fare_leg_asn.sql
--
-- The saved fares from Asansol (ASN) to EVERY STOP AFTER ASANSOL on the route of each train of the Asansol tab (src/lib/live/fareLegStore.ts, station "ASN"). Same shape as public.train_fare_leg
-- (22_train_fare_leg.sql), which holds Durgapur's. Collected by scripts/harvest-legs.ts --station ASN while the paid fare month lasts (to 14 Dec 2026); the end-of-run fare of each train is in public.train_fare_asn.
--
-- Safe to run more than once. The application also creates this table by itself on first use if its database user may; running this file is the clean way.
-- Nothing in it is personal data. To start again:  DELETE FROM public.train_fare_leg_asn;

CREATE TABLE IF NOT EXISTS public.train_fare_leg_asn (
  train_number  text         NOT NULL,                  -- the five-digit number, "12301"
  to_code       text         NOT NULL,                  -- the stop's station code, "MGS"
  to_name       text         NOT NULL,                  -- the name RailRadar gives it
  seq           integer      NOT NULL,                  -- its place in the train's route (grows along the run)
  distance_km   numeric      NOT NULL,                  -- from Asansol
  journey_date  date         NOT NULL,                  -- the day the fares were asked for
  classes       jsonb        NOT NULL,                  -- [{code, name, total, high?, basis?, parts:[{label, amount}]}]
  fetched_at    timestamptz  NOT NULL,                  -- when the fares were received
  PRIMARY KEY (train_number, to_code)
);

ALTER TABLE public.train_fare_leg_asn ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.train_fare_leg_asn FROM anon, authenticated;

SELECT count(*) AS saved_legs, count(DISTINCT train_number) AS trains, min(fetched_at) AS oldest, max(fetched_at) AS newest FROM public.train_fare_leg_asn;

-- 32_train_kol.sql
--
-- Here I save the trains of the KOLKATA TERMINALS (Howrah HWH, Sealdah SDAH, Santragachi SRC, Kolkata KOAA) that go over NEITHER Durgapur NOR Asansol, with their details and the railway's fares
-- (src/lib/live/kolkataSet.ts has the rules, src/lib/live/kolkataStore.ts the code, scripts/harvest-kol.ts the collection). The trains that stop at, or pass, Durgapur or Asansol are in
-- public.train_fare / train_fare_asn already; a train that starts at one of the four stations is taken ONCE, under its starting station. The fares are the railway's reservation system's own, through
-- RailRadar's paid fare service (used for one month only, to 14 Dec 2026); fetched_at is when each row was received.
--
--   public.train_kol           the catalogue: every train that STARTS at one of the four stations, in_set true/false with the reason when it is out, its details, its halts with times
--   public.train_fare_kol      the fare of each class from the starting station to the end of the run, one row per train
--   public.train_fare_leg_kol  the fare of each class to every halt after the starting station, one row per train and halt
--
-- Safe to run more than once. The collection script also creates the tables by itself. Nothing in them is personal data.
-- To start again:  DELETE FROM public.train_fare_leg_kol; DELETE FROM public.train_fare_kol; DELETE FROM public.train_kol;

CREATE TABLE IF NOT EXISTS public.train_kol (
  train_number text PRIMARY KEY,                 -- the five-digit number, "12841"
  train_name   text NOT NULL,
  train_type   text NOT NULL,                    -- RailRadar's type: "Superfast Express", "Suburban", "Train on Demand" ...
  category     text NOT NULL DEFAULT '',
  from_code    text NOT NULL,                    -- the starting station: HWH, SDAH, SRC or KOAA
  from_name    text NOT NULL DEFAULT '',
  to_code      text NOT NULL,
  to_name      text NOT NULL DEFAULT '',
  run_days     jsonb NOT NULL DEFAULT '[]',      -- the days it leaves the starting station: ["mon","thu"]
  distance_km  numeric,
  duration_min integer,
  total_halts  integer,
  return_train text,
  classes      jsonb NOT NULL DEFAULT '[]',      -- the classes RailRadar lists for the train: ["SL","3A","2A"]
  prs_bookable boolean NOT NULL DEFAULT false,   -- can be booked in the reservation system (suburban and local trains cannot: no fare is saved for them)
  has_reversal boolean NOT NULL DEFAULT false,
  touches      jsonb NOT NULL DEFAULT '[]',      -- which of the four stations' boards the train is on ["HWH","SRC"]; it is taken once, under from_code
  in_set       boolean NOT NULL,                 -- false: out of the set (reason says why)
  reason       text NOT NULL DEFAULT '',
  halts        jsonb NOT NULL DEFAULT '[]',      -- [{seq, code, name, km, arrival, arrivalDay, departure, departureDay}], only for trains in the set
  fetched_at   timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.train_fare_kol (
  train_number text PRIMARY KEY,
  train_name   text NOT NULL,
  from_code    text NOT NULL,
  to_code      text NOT NULL,                    -- the end of the run
  journey_date date NOT NULL,                    -- the day the fares were asked for (a day the train leaves its starting station)
  distance_km  numeric NOT NULL,                 -- as the railway gives it
  classes      jsonb NOT NULL,                   -- [{code, name, total, parts:[{label, amount}]}], only the classes the train has
  fetched_at   timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.train_fare_leg_kol (
  train_number text NOT NULL,
  to_code      text NOT NULL,                    -- a halt after the starting station
  to_name      text NOT NULL,
  seq          integer NOT NULL,
  distance_km  numeric NOT NULL,
  journey_date date NOT NULL,
  classes      jsonb NOT NULL,
  fetched_at   timestamptz NOT NULL,
  PRIMARY KEY (train_number, to_code)
);

ALTER TABLE public.train_kol          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.train_fare_kol     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.train_fare_leg_kol ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.train_kol          FROM anon, authenticated;
REVOKE ALL ON public.train_fare_kol     FROM anon, authenticated;
REVOKE ALL ON public.train_fare_leg_kol FROM anon, authenticated;

SELECT count(*) AS catalogued, count(*) FILTER (WHERE in_set) AS in_set FROM public.train_kol;

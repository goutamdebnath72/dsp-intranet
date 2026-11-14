-- 23_cpi_month.sql
--
-- The saved CONSUMER PRICE INDEX (CPI) of MoSPI (src/lib/live/cpiStore.ts): one row for each month, State (or "All India") and sector (Combined, Urban, Rural), with MoSPI's index and its year-on-year inflation rate, and the
-- time it was received. "2024" rows are the new series (base 2024 = 100, from January 2026, every State); "2012" rows are the old series (base 2012 = 100, all India only, 2016 to December 2025), which give the
-- inflation chart its ten years. The card asks MoSPI only for a month not yet saved (the index of a month is out on the 12th of the next); scripts/harvest-cpi.ts fills the table in one go.
--
-- Safe to run more than once. The application also creates this table by itself on first use if its database user may; running this file is the clean way.
-- Nothing in it is personal data. To start again:  DELETE FROM public.cpi_month;

CREATE TABLE IF NOT EXISTS public.cpi_month (
  base_year   text         NOT NULL,                  -- "2024" or "2012"
  month       text         NOT NULL,                  -- "2026-10"
  state       text         NOT NULL,                  -- "West Bengal", or "All India"
  sector      text         NOT NULL,                  -- "Combined", "Urban" or "Rural"
  idx         numeric      NOT NULL,                  -- the index
  inflation   numeric,                                -- MoSPI's rate, percent, year on year
  fetched_at  timestamptz  NOT NULL,                  -- when it was received from MoSPI
  PRIMARY KEY (base_year, month, state, sector)
);

ALTER TABLE public.cpi_month ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cpi_month FROM anon, authenticated;

SELECT base_year, count(*) AS rows, min(month) AS first_month, max(month) AS last_month, max(fetched_at) AS last_received FROM public.cpi_month GROUP BY base_year ORDER BY base_year;

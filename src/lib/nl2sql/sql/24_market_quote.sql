-- 24_market_quote.sql
--
-- The saved MARKET QUOTES of the Sensex, Nifty and watch-list card (src/lib/live/marketStore.ts): the last good quote of each symbol, as Yahoo Finance gave it, and the time it was received. When Yahoo does not
-- answer (it turns away anyone who asks too fast) the card shows these, marked "not live" with the time they were received, instead of an error. One row for each symbol (about fifteen), replaced by each fresh quote.
--
-- Safe to run more than once. The application also creates this table by itself on first use if its database user may; running this file is the clean way.
-- Nothing in it is personal data. To start again:  DELETE FROM public.market_quote;

CREATE TABLE IF NOT EXISTS public.market_quote (
  symbol      text         PRIMARY KEY,               -- "^BSESN", "SAIL.NS"
  quote       jsonb        NOT NULL,                  -- the quote: name, price, previous close, change, percent, high, low, time of the price, the day's line
  fetched_at  timestamptz  NOT NULL                   -- when it was received from Yahoo Finance
);

ALTER TABLE public.market_quote ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_quote FROM anon, authenticated;

SELECT count(*) AS symbols, min(fetched_at) AS oldest, max(fetched_at) AS newest FROM public.market_quote;

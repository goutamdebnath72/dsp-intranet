-- 25_live_snapshot.sql
--
-- The saved LAST GOOD ANSWER of a live card (src/lib/live/snapshotStore.ts), one row for each card that asks for it (today the gold and silver card, key "gold"): the whole answer as the source gave it and the time it was
-- received. When the source does not answer and the server's memory is empty (a restart, a quiet night), the card shows this, marked "stale" with its own time, instead of an error. Replaced by each fresh answer.
--
-- Safe to run more than once. The application also creates this table by itself on first use if its database user may; running this file is the clean way.
-- Nothing in it is personal data. To start again:  DELETE FROM public.live_snapshot;

CREATE TABLE IF NOT EXISTS public.live_snapshot (
  key         text         PRIMARY KEY,               -- "gold"
  payload     jsonb        NOT NULL,                  -- the answer of the card's route
  fetched_at  timestamptz  NOT NULL                   -- when it was received from the source
);

ALTER TABLE public.live_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_snapshot FROM anon, authenticated;

SELECT key, fetched_at FROM public.live_snapshot ORDER BY key;

-- 20_eds_briefing.sql  (step 73)
--
-- The permanent store of Executive Deep Synthesis briefings (src/lib/search/edsStore.ts). The first GOOD briefing of a question is kept here, and every
-- later ask of the same question, on any server, shows that same briefing, until the archive of circulars changes or the engine's prompt / rules change.
--
-- Safe to run more than once. The application also creates this table by itself on first use if its database user may; running this file is the clean way.
-- Nothing in it is personal data: it holds the question text and the briefing built from the circulars.
-- To make one question be answered afresh:  DELETE FROM public.eds_briefing WHERE query_text ILIKE '%some words%';   (all of them: DELETE FROM public.eds_briefing;)

CREATE TABLE IF NOT EXISTS public.eds_briefing (
  key          text        PRIMARY KEY,                                   -- sha256 of (engine signature + the question, case/punctuation/spacing removed)
  query_text   text        NOT NULL,                                      -- the question as first asked (for people reading this table)
  fingerprint  text        NOT NULL,                                      -- the state of the archive the briefing was made from; a different one = made afresh
  engine       text        NOT NULL,                                      -- the engine signature (prompt + rules) the briefing was made with
  score        integer     NOT NULL CHECK (score BETWEEN 0 AND 100),      -- the quality score the engine gave it (edsQuality.ts)
  result       jsonb       NOT NULL,                                      -- the briefing exactly as shown
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eds_briefing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eds_briefing FROM anon, authenticated;

SELECT count(*) AS stored_briefings FROM public.eds_briefing;

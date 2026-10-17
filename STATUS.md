# DSP Intranet omnibar: status map

Updated 13 Oct 2026 (pack 28a applied and checked by you; step 28b built). Read this first; it says what we are doing and why. Details live in the three `HANDOFF_dsp-intranet_*.md`
files (master, front-path, query-log). Wording of the old ledger items below is reconstructed from the handoff (the item
COUNTS are exact).

## The goal

One search box. The person types a question and presses Enter; the engine behind the box decides which source answers
(holiday data, employee directory, health check-up schedule, circulars, or an executive's written summary). The **Executive
Deep Synthesis (EDS) button is removed**, and the service behind it stays uninterrupted, accurate and well presented.

## The problem list (from the last chat: 20 designed queries + the 60+ query log)

68 items. **20 solved, 5 partly solved, 6 not real defects, 37 pending.**

| area | pending | what they are |
|---|---|---|
| Employee / directory answers | 7 | headings that misstate the question (7), "Understood as" does not name the e-mail source (15), a mobile prefix (17), compound surnames unmeasured (20), dual-surname lists (21), a "Count 5" chip (27), **a wasted 4-6 s people search on every Enter (32)** |
| Platform | 3 | a database outage silently becomes a circular search (28), a 62 s wait before an error (29), rotating secrets (12: you decided it does not matter) |
| Circulars and EDS | 27 | **wrong or invented numbers from badly read scans (51, 54, 55, 56, 63, 65, 66)**, synthesis sees too little text or cites the wrong thing (47-50, 58, 64), synthesis details (38-43, 52, 53), search ranking and confidence (37, 40, 57, 62), smart routing (59, 60), optional (45) |

Since that count (11 to 13 Oct) some of the 27 were closed (OCR corruption fix, archive re-read, health check-up pipeline...)
but **nobody recorded which**. The baseline run (step 2 below) answers this with facts, not memory.

## What was done in this chat

| step | what | for which problem | status |
|---|---|---|---|
| 20a | **Acceptance harness**: 223 of your questions run through the real omnibar, with route, speed, tokens, pass/fail | none: it is the measuring instrument | running on your machine |
| 21a | Holiday counts say 40 (distinct days), not 54; Diwali 2019 / Holi 2027 answered at once instead of by the model | new holiday defects the harness found | **confirmed on screen** |
| 22a, 22b | Year comparison drawn as a card; the missing year is named; the notification answer describes the real reminder | your three review points | **confirmed on screen** |
| 23a | **Route logging**: every search reports its route, stages, model calls and exact tokens (terminal line + headers) | ledger 60 | **confirmed on your machine** |
| 24a | **Front-path gate** (off by default): a question that cannot be an employee question skips the model call | ledger 59, and the waste found by 23a | built, **waiting for your test** |
| 25a | **Executive check from the login session**: synthesis only for a verified executive; the URL's ticket is ignored | security #3 and #6; needed before the button can go | built, **waiting for your test** |
| 28b | **Engine fix**: two missing rules in the model's instructions (top N per department; "grade X or above") + two worked examples; found by the baseline | employee answers (new: two wrong answers on the real data) | built, **waiting for your test** |
| 24a to 27a | **All four delivered as ONE pack** (`patch_step28a.zip`, one command): the front-path gate, the executive check from the login session, the EDS question detector, the Enter key = the old button. All off by default. | see the four rows below | **waiting for you to apply the pack** |
| 26a | **Which questions are EDS**: a detector found from your old query document (pattern below), recorded in the trace; the holiday parser no longer hijacks "compare ... circulars" questions | ledger 59 (smart routing), and a confident wrong answer found on the way | built, **waiting for your test** |
| 27a | **Data-mining definition of EDS** (correlate, hidden, patterns, gaps, implications ...); **the Enter key = the old button** for a logged-in executive on an EDS-type question (same processing panel, same briefing; off by default); an EDS that finds no circular falls back to the normal search | ledger 59; the goal of removing the button | built, **waiting for your test** |

## Direction: EDS will cover every data domain, not only circulars (decided with you, 13 Oct)

EDS is the data-mining route for department executives: it must relate facts that look unrelated, in whatever data the plant holds.
Today it reads the **circulars**. Planned domains, added as the data reaches the database: **employee data** (HR executives),
**holidays** (personnel executives), **production**, **tenders**, **payroll**, **medical**, **procurement / purchase orders**.

What this means for the design (nothing below is built yet; it is the target the current work must not block):

- **A domain is a module**: its read-only database views, its vocabulary for the question detector, its own verified facts to test against.
- **Access is decided on the server, per domain, by the executive's department** (HR executives see employee data, personnel executives
  holidays ...). Payroll and medical are sensitive: **default deny**, never "every executive sees everything". The browser never decides this.
- **One engine, several domains**: a question that spans domains needs every domain the person is allowed to see, and says plainly which
  domain a fact came from.
- **Two limits of today are deliberate and temporary**: the detector treats people-data questions as "never EDS" (right while EDS only reads
  circulars; once an employee-data domain exists, an HR executive's complex people question becomes an EDS question for that domain), and
  `/api/ai-search` has no notion of an executive's department yet.

## Findings of the baseline run (13 Oct, your 20 designed questions, real data)

16 of 16 ran; 12 model calls, 64,836 tokens (about 5,400 per model question; about 35 model questions a day on the free tier).
Only 10 of the 16 passes checked content. The rest, looked at by hand:

| finding | status |
|---|---|
| "five most senior executives in each plant garage section" answered "5 people" (a plain LIMIT 5; should be up to 5 per section) | fixed in 28b (rule + example), **to be re-tested on the live model** |
| "departments with more than 20 non-executives of grade S-9 or above" answered "0 rows"; a direct query shows 45 or more | fixed in 28b (rule + example), **to be re-tested on the live model** |
| "daily wage rates notified for contractor workers for 2024" answered with the 2024 LEAVE circular at 95%: the wage notice (`07_2023.pdf`) is not in the database | **you upload it** (`circulars_wage_one.csv`); the wrong-document-at-95% confidence problem (ledger 57) remains |
| 4 of 10 employee answers sent to a request WITHOUT a login contained the person's SAIL P.No., which is also the login password (security audit #1, CRITICAL) | **waiting for your decision**: remove the P.No from every card and answer |
| department questions waste 2.4 to 3.9 s on a scan of all users before the model starts (the leftover words can never be a name) | planned: skip it when the leftover is longer than 3 words |
| the model's own "thinking" is most of its time (482 to 1,163 tokens per answer); `GROQ_REASONING_EFFORT=low` may help | an experiment to run with the harness (`--compare`) |
| prompt caching works partly (4 of 12 calls: 3,328 or 4,096 of about 4,600 tokens cached) | later |

## The order we follow

1. **Test the gate** (24a) and the executive check (25a). Quick.
2. **Baseline run** of the questions that need the model (employee, health check-up, circulars, EDS). Needs a few days on the free Groq tier (about 30 to 40 model questions a day): `--max-tokens` and `--resume` handle that.
3. **Fix wrong or invented answers**, the serious ones (ledger 51 and its group): first a verified truth set from the 50 circulars, then the engine.
4. **Server-side executive check**: DONE in 25a (pending your test).
5. **Remove the EDS button**.

## Which questions belong to EDS

**EDS = the data-mining route for a policy maker**: the answer is HIDDEN until facts from several circulars are related, compared,
correlated or traced over time ("what are we missing", "where do the rules contradict", "what pattern emerges", "what changed between").
A **Smart Semantic** question asks ONE thing that ONE circular answers ("How do I return my provident fund advance before the due date?").
The detector (`src/lib/search/synthesisIntent.ts`) looks for:

1. an analytic task verb: trace / evolution, contrast, compare, synthesize, cross-reference, briefing (all four old tests start with one);
2. a relation between versions: "what changed between", "original ... corrected", "first announced", "revised after it was announced";
3. an aggregate across a period: "list the events ... in December";
4. discovery language: correlate, hidden, overlooked, inconsistencies, implications, relationship between, overlap, diverge (decisive);
   patterns, trends, recurring themes, how often, across all circulars (supporting);
5. supporting shape: two or more years, "and which / and what", many named things, length.

A question about people (who / senior / designation / ticket) is never EDS. What EDS covers TODAY: the circulars. Mining across the
employee directory, health check-up lists and holidays together would be a different engine (see "Decisions waiting").

How good is the detector? On your real questions: all 9 EDS ones detected, 0 of the 216 others taken for EDS. On 14 policy-maker
questions I wrote and did NOT tune on: **6 detected (43%)**. After I fixed the generic gaps they exposed (a relative "whose" blocked as
a people question, a bare "contradict", "first gift card announcement") it is 11 of 14, but that number is tuned and optimistic. The
three still missed have no cue words at all ("Does the safety circular undermine or reinforce the contractor insurance scheme?").
**Recall matters most, because once the button is gone a missed question cannot be sent to EDS at all**: your real typing, recorded in
the trace, is the honest measure, and it decides whether executives also need a small "analyse with EDS" link.

## Before the EDS button can go (checklist)

- [ ] The server decides who is an executive from the login session (25a).
- [x] The Enter key sends an EDS-type question from a logged-in executive to EDS, with the same processing panel and briefing as the button (27a, off by default).
- [x] ... and a synthesis with no relevant circular falls back to the normal search (27a).
- [ ] **Recall measured on real typing** (trace) and the fallback for missed questions decided (see below).
- [ ] The "Executive Deep Synthesis" title moves inside the processing panel and the briefing header (today the amber button bar carries it).
- [ ] EDS answers never contain a number that is in no circular (ledger 51), checked against a verified truth set.
- [ ] The acceptance set passes at a rate you agree, through the real route.
- [ ] Every EDS failure is labelled route / engine / display.

## Decisions waiting for you

- **A bare "how many holidays"** (no year) silently uses the current year (F-20). Keep, or ask which year?
- **Compound questions** ("how many RH can category B take in 2025 and which fall in November") answer the first half and say "Not answered" for the second. Keep, or answer both?
- **Decided by me (13 Oct), tell me if you disagree**: (1) EDS is for logged-in executives only; (2) the screen, not the server, decides to start it, and the server still verifies the executive; (3) when the button is removed, its amber title bar goes with it, so "Executive Deep Synthesis" becomes the title of the processing panel and of the briefing header (the existing small label is kept); (4) a question the detector misses cannot reach EDS once the button is gone: if the real typing shows misses, executives get a small "analyse with Executive Deep Synthesis" link under circular results.
- *(answered)* EDS will cover every domain (see "Direction" above): you decide the order of the domains as data arrives; I decide nothing about who may see payroll or medical except that the default is deny.

## How to test things

- `node scripts/omnibar-acceptance.mjs --list` : what is in the set.
- `--no-model` : the free part (holidays, Bad Queries). `--max-tokens N`, `--resume FILE` : spread the model part over days.
- Gate: `FRONT_PATH_SKIP_MODEL=true` in `.env.local`, then see `eval/README.md`.
- Synthesis and the security probes: `--cookie "next-auth.session-token=..."` (see `eval/README.md`).
- Every search prints a `[front-path] ...` line in the dev terminal: route, stage times, model calls, tokens.

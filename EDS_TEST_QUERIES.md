# EDS test questions (new panel, 9 Nov 2026)

Written from what the 53 archived circulars really contain. Paste each into the omnibar and press **Enter** (there is no Deep Synthesis button any more).
The Enter key sends a question to EDS only for a logged-in executive AND when `detectSynthesisIntent` scores it 5 or more (`src/lib/search/synthesisIntent.ts`).
As written, only P03, P04, P06, P13 and B03 reach EDS; the rest are answered by the normal search or another engine. Reworded versions that do reach EDS
(checked with the detector, 9 Nov 2026): P05, P10, P18 (see the chat reply of that day). Single-circular lookups (P01, P08, P09, P11, P16, P17) are meant for the normal search.
The same list lives in `scripts/eds-panel-queries.ts`; `npx tsx --env-file=.env.local scripts/eds-panel.ts [P01 P05 ...]` runs them through the engine
(one at a time, no store; each question costs two model calls of about 25-30k tokens, so the Gemini credit must be topped up first).

Since 11 Nov 2026 every briefing gets a SECOND READING (`src/lib/search/edsVerify.ts`): a verifier model reads the circulars and the briefing, and plain code applies only what it can check (STATUS.md row 89). `scripts/test-eds-query.ts` prints what it changed.

"Checked" means: I read the answer against the circular text. "Not run" means the call timed out or the credit ran out before it finished.

| Id | Kind of question | Question | Status on 9 Nov (before the fixes of the same day) |
|---|---|---|---|
| P01 | ladder / stages table | Under the revised Zero Tolerance Safety Rules, what consequence follows each violation at each stage, and through whom is it issued? | Not run |
| P02 | big multi-column table | Compare all the motivational award schemes of DSP by beneficiary grade, award amount, periodicity, executing authority and the occasion on which each is awarded. | Checked: all 12 schemes, figures right |
| P03 | year-on-year comparison | How do the public holidays notified for DSP employees in 2024, 2025 and 2026 compare, and which festival dates differ between the years? | Checked: dates right; "Not stated" used where the item sits in the restricted list |
| P04 | 3-year evolution | How did the holidays and leave entitlements for contractor workers in DSP change between 2023, 2024 and 2025? | Checked: WEAK, said "unchanged" and left out that the festival lists differ each year |
| P05 | recurring instructions | What are the reporting time, venue, preparation instructions and the report-collection arrangements for the non-executive health check-ups in December 2024, January 2025 and January 2026? | Checked: facts right; the January 2025 column was missing |
| P06 | scheme edition comparison | How does the January to May 2026 Hindi Teaching Scheme session differ from the one starting in January 2024 in courses, eligibility, number of candidates and incentives? | Checked: figures right, but "increased across all courses" is false for Parangat |
| P07 | two unrelated topics | Explain the refundable PF loan pre-mature repayment procedure and, separately, the PF contribution granted to Junior Officers of the 2008 and 2010 batches. | Not run |
| P08 | one facility + corrigendum | Describe the 2026 gift card facility for DSP employees: amount, who can opt, how to opt, the last date, and what the corrigendum changed. | Not run (the corrigendum makes it Rs 14,999, not 15,000) |
| P09 | deadlines across circulars | List every 2026 last date announced in the circulars for Mediclaim renewal, ESS allowance entry by non-executives, PF loan repayment requests and the gift card option. | Checked: right, and it used the Rs 14,999 corrigendum; "[]" shown in cells |
| P10 | two rollouts compared | Compare how face-recognition attendance was introduced for executives in 2023 and for contractor workers in 2024: start dates, who is covered, technology used and what happens to those who do not register. | Checked: right; the timeline had 31.10.2023 after 01.11.2023 |
| P11 | who / how many / by when | Who has to submit the Format B declaration for SIR, in how many copies, to whom and by when, and who are the nodal officers? | Not run |
| P12 | people list from an order | Which executives were promoted from E1 to E2 with effect from 31 December 2025, with their present designation, promoted designation and pay scale? | Checked: all 8 rows right |
| P13 | two vacancy notices | Compare the Joint Industrial Adviser vacancy in the Ministry of Steel with the ICVL MD & CEO deputation in Mozambique: eligibility, pay, mode of filling and how to apply. | Checked: right except "5-10 years in Level 10/11" (the circular says 5 years in Level 11 OR 10 years in Level 10) |
| P14 | procedure | Explain the online Leave Management System procedure for non-executives: from when it is compulsory, who recommends, who sanctions and what the employee must do. | Read, not line-by-line checked |
| P15 | two seasons of one event | What selection trials, coach selections, venues, dates and entry conditions were announced for the Inter Steel Plant Football Championship in 2022-23 and in 2024-25? | Read, not line-by-line checked |
| P16 | simple fact, messy wording | wat was the SAIL day walk/run 2026 - date, distance, start point and who all can participate categories | Not run |
| P17 | Hindi question | डीएसपी हिंदी शिक्षण योजना में प्रबोध, प्रवीण, प्राज्ञ और पारंगत पाठ्यक्रमों की पात्रता, अवधि और नकद पुरस्कार क्या हैं? | Not run |
| P18 | amendment of a scheme | What amendment was made to the Merit Award Scheme for contract workers in 2026 and what does it change? | Read, not line-by-line checked |
| B01 | BOUNDARY: doctors / OPD (other engine) | Compare the OPD timings and consultant names of the DSP Main Hospital departments with the reporting time fixed for the non-executive health check-up. | Checked: said plainly the OPD data is not in the circulars; rooms right |
| B02 | BOUNDARY: phone directory / roster (other engine) | Give the phone extensions and email addresses of every officer in the Computers & Information Technology department and compare them with the nodal officers named for SIR. | Checked: no phone or email shown, said it is not in the circulars; padded with a 41-row table |
| B03 | BOUNDARY: not in the archive | Summarise the 2026 bonus and productivity-linked reward rules for executives and compare them with the 2025 rules. | Checked: WRONG on the gift card it offered instead (missed the corrigendum, said executives only, invented the 2025 amount) |

## Fixes made the same day (generic, none names a circular)
- Prompt rules: WHAT DIFFERS, THE NEWEST WORD WINS, WHO IS COVERED, NO FIGURE FROM "AS BEFORE", UNIVERSAL WORDS, ALTERNATIVES STAY ALTERNATIVES, NOT STATED MEANS NOT IN THE CIRCULAR, NOTHING TO ANSWER.
- Code: empty "[]" in a table cell is removed; a timeline whose points all name dates is sorted by date; the score loses points when a question names several years and the tables carry only some of them, and when a circular that amends a cited circular is not cited.
- NOT yet re-run live (credit ran out): the fixes are covered by unit tests only.

## Gold test (9 Nov 2026): `scripts/eds-gold.ts` + `scripts/eds-gold-keys.ts`
Nine questions with answer keys written from the circulars' own text (facts that must appear, statements that must not). `npx tsx --env-file=.env.local scripts/eds-gold.ts [G01 ...]`
runs them through the engine (no store); `GOLD_RESCORE=a.json,b.json` re-scores saved runs for free. Four fresh runs (separate processes; a repeat inside one process is served from the engine's memory cache and is NOT independent):
- Key facts found: 78.5%, 80.8%, 80.0% and 78.5% per run (many of the "misses" are extra detail my keys asked for beyond the question; the core facts asked were found in 7 of 9 questions in every run).
- Stable errors: G01 writes "Not stated" for Bhatridwitiya 2024 and 2025 (4 of 4 runs; the circulars list it as a restricted holiday in 2024 and as an additional festival holiday for Category B in 2025).
  G08 (Hindi Teaching Scheme): "incentives increased for all courses / Parangat increased" in 2 of 4 runs (Parangat did not change); the weekly-hours, language-based eligibility and 25-per-course facts are missing in some runs.
  G09: "5-10 years in Level 11/10" in 1 of 4 runs (the circular gives two alternatives).
- Figures not found in any circular read: none that were not a circular label (0 invented numbers in 36 answers).

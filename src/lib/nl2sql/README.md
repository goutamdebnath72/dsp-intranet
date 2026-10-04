# NL → SQL experiment (the language model writes the query itself)

**Status: experiment, isolated.** Nothing in the existing omnibar imports this, and this imports nothing from the existing employee-query engine (`parser.ts`, `namePredicate.ts`, `queryOrchestrator.ts` … all untouched and dormant). Delete the three new folders and the app is exactly as before:

- `src/lib/nl2sql/` – the engine, SQL files, tests
- `src/app/api/nl2sql/route.ts` – experiment endpoint (404 unless enabled)
- `src/app/nl2sql-lab/page.tsx` – a page to try questions by hand

## In the omnibar (implemented 4 Oct 2026)

The app's search route (`src/app/api/ai-search/route.ts`, semantic mode) now sends questions through the model path in `omnibar.ts`:

1. **Holiday questions** that the existing deterministic holiday parser recognises keep their deterministic answers (a separate, verified feature).
2. **Everything else goes to the language model, with no keyword gate.** The model decides: an employee question gets SQL and an answer; a question that is not about employees (circulars, policies ...) returns `out_of_scope` and the route continues with circular search exactly as before; employee data we do not hold (salary ...) gets a plain explanation; an ambiguous question gets a clarifying question.
3. **Safety net:** if the model is unreachable (provider limit/outage) or cannot produce a working query, the previous rule-based employee engine answers, so the omnibar never goes dark.

Answers appear in the omnibar's existing cards: a number (counts), the people cards with masked phone/e-mail and the reveal button (lists of people, in seniority order, first 100 with the true total), or a table (breakdowns). Each model-written answer also shows **Understood as**, **Departments covered** (computed from the SQL), a tick/cross (stored in `public.nl2sql_log` through `/api/nl2sql/feedback`) and the SQL, collapsed.

Kill switch: `NL2SQL_OMNIBAR_ENABLED=false` in the environment sends employee questions to the previous engine only (default: on). The lab page (`/nl2sql-lab`) and `NL2SQL_LAB_ENABLED` are unchanged and independent.

New files: `omnibar.ts`, `clientTypes.ts`, `src/components/Nl2SqlAnswerExtras.tsx`, `src/app/api/nl2sql/feedback/route.ts`. Edited: the search route (one call site), `OmnibarModal.tsx` (three insertions), `useOmniSearch.ts` (one type field). The self-test (section K) covers the whole path.

## The learning loop (Yes / No on every answer)

Every answer in the omnibar — model-written, verified, holiday, old engine, circular results, even "no results" — has a **"Was this what you were looking for? Yes / No"** in the footer (`AnswerFeedback.tsx`). Clicks go to `/api/omnibar/feedback` and are stored in `public.omnibar_feedback`; for model-written answers the verdict is also set on the answer's row in `public.nl2sql_log`.

**Yes teaches.** The question + SQL becomes a worked example for similar questions. When at least `NL2SQL_VERIFIED_MIN_CONFIRMS` (default 2) DIFFERENT people confirmed the same SQL for the same question and nobody rejected it, it becomes a **verified answer**: the SQL is re-run (fresh data, same guard and checks) without calling the model, and the card says "Verified answer — confirmed by N people". A single later No revokes it.

**No asks one question — "What was wrong?" — then tries again differently**, chosen by the reason:
| Reason | What happens next |
|---|---|
| I wanted documents | the model is skipped; the app searches circulars instead |
| I wanted people / employee data (after documents) | the model is told to read it as an employee question |
| The result is wrong / wrong department(s) / a name was matched wrongly / something else | the model writes a genuinely different reading, told the rejected SQL, the reason and the person's own words |
After 3 attempts it stops and says so; every No is kept for review.

**No also teaches.** The rejected SQL is never offered again to that person for that question; after two different people reject it (and nobody confirms) it is blocked for everyone; and rejected readings of SIMILAR questions are shown to the model as "mistakes to avoid".

**Nothing is retrained.** "Learning" means these three mechanisms plus a human review step: `npx tsx --env-file=.env.local src/lib/nl2sql/eval/feedback-report.ts [--days=N]` writes `nl2sql-eval-feedback.md` (Yes/No by route, reasons, most-rejected questions with their SQL, No's fixed by a second attempt = ready-made regression cases, verified answers, volume). Turn recurring failures into rules, examples and golden tests.

Files: `learning.ts`, `feedback.ts`, `components/AnswerFeedback.tsx`, `api/omnibar/feedback/route.ts`, `eval/feedback-report.ts`, `sql/07_feedback_learning.sql` (**required** on the live database before the code is used: it adds the log columns and the feedback table).

## What it does

```
question ──► prompt (schema + domain rules + phonetic teaching + live lists + worked examples)
         ──► language model writes JSON: { sql, understood_as, confidence, … }
         ──► guard   (parses the SQL; one read-only SELECT on 3 approved views, approved functions only)
         ──► executor (READ ONLY transaction, role nlq_reader, 5 s timeout, row cap, always ROLLBACK)
         ──► answer  (rows + total + "Understood as" + the SQL, with ✓ / ✗)
```
If the guard or the database rejects the SQL, the model is shown the exact problem and retries (up to 3 attempts).

**PL/pgSQL:** deliberately not used. PL/pgSQL needs `CREATE FUNCTION`, which is a database *change* and would break the "read-only" guarantee. A single `SELECT` with CTEs, window functions and the helper functions below can express everything asked of the omnibar so far.

## How the phonetic matching is taught

Your existing phonetic functions (`indic_fold`, `name_synonym_normalize`, `name_phonetic_codes`) are used as-is. The model is taught them two ways:

1. **Three null-safe SQL building blocks** it combines with AND / OR / NOT: `nlq.word_like`, `nlq.first_word_like`, `nlq.last_word_like` (arguments: `name_words`, `name_codes`, the typed word).
2. **Written rules in the prompt** (`prompt.ts`): similar-spelling is the default; *exact* when the name is in double quotes, or when two similar names are set against each other ("debnath but not nath"); text matches (`starts with`, `contains`, `not at the end`) are literal; recipes for first / last / middle.

Improving behaviour = editing that text or adding worked examples. No parser rules.

## Safety: four independent layers

1. **Views only.** The model can read `nlq.employees`, `nlq.designations`, `nlq.departments`. Phone numbers, e-mail addresses and street addresses are **not exposed at all** – only flags like `has_email_nic`. Passwords/tokens are unreachable.
2. **Database role.** Queries run as `nlq_reader`, which has SELECT on those three views and nothing else, inside `BEGIN READ ONLY`, with `statement_timeout`.
3. **SQL guard** (`guard.ts`). A real PostgreSQL parser + full syntax-tree walk: one statement, SELECT only (also inside `WITH`), approved relations, approved functions (no `pg_sleep`, `set_config`, `pg_read_file`, `nextval`, `dblink` …), no comments/semicolons/locking clauses. Anything it cannot positively approve is refused.
4. **Executor text check** – refuses `;` and comments independently of the guard, since the SQL is embedded in a wrapper query.

*Residual risk, stated plainly:* without `sql/03_*.sql` the app runs the queries by switching its own connection to `nlq_reader`; the guard blocks the one known way back out (`set_config('role', …)`). With `sql/03_*.sql` and `NL2SQL_DATABASE_URL` (recommended) a dedicated login role makes that impossible.

## Setup

```bash
npm install                     # adds pgsql-ast-parser (MIT)
```
1. In the Supabase SQL editor run, one file at a time, whole file: `sql/01_nlq_schema_views_role.sql`, then `sql/02_nl2sql_log_tables.sql`. Optional but recommended: `sql/03_optional_dedicated_login_role.sql` (edit the password first), then set `NL2SQL_DATABASE_URL`.
   **Never run `sql/99_local_test_standins.sql` – it is for a scratch database only.**
2. Environment: `NL2SQL_LAB_ENABLED=true` (the route and page stay off without it). `GROQ_API_KEY` is already set; `GROQ_MODEL` optional.
3. Clear `.next`, restart, open `/nl2sql-lab` while logged in.

## Testing

**Self-test** (proves everything except the real model; needs a scratch local Postgres – never your real database):
```bash
NL2SQL_TEST_ADMIN_URL=postgres://postgres:<pw>@127.0.0.1:5432/postgres npm run nl2sql:selftest
```
156 checks: guard accept/reject matrix; hostile SQL run as the reader role (passwords, direct tables, writes, DDL, file reads, timeout); phonetic SQL vs the app's JavaScript engine; the taught building blocks vs the existing name engine; prompt contents; reply parsing; repair loop; logging and tick/cross; all golden questions through the full pipeline.

**Live evaluation** (the real test – real model, your real data, read-only):
```bash
npm run nl2sql:live                          # all 20 questions, 65 wordings
npm run nl2sql:live -- --quick               # first wording of each
npm run nl2sql:live -- --only=gm_cit_nath,debnath_not_nath
```
Writes `nl2sql-eval-report.md` / `.json`: pass rate overall and per question, the SQL and the model's own reading for every failure, and which passes needed a retry. Paste the **Failures** section back to guide prompt changes.

The run saves results after every question and stops cleanly if the model provider's daily token allowance runs out; continue later with `npm run nl2sql:live -- --resume` (questions that already got a real answer are not asked again). The report shows tokens per question, which matters: each question costs roughly 5,000 tokens, so a 200,000-token daily allowance is only about 35-40 questions for the whole organisation.

**Review run (real questions).** `eval/review.ts` takes a text file of real questions (one per line) and writes `nl2sql-eval-review.md`: for each question, what the model understood, its SQL, and the result size. There is no reference answer; a person judges each reading. By default the sheet contains no employee data (only aggregate numbers such as counts); `--rows=N` adds the first N rows of each list of people. Example: `npx tsx --env-file=.env.local src/lib/nl2sql/eval/review.ts nl2sql-eval-questions.txt` (add `--resume` to continue after a daily-limit stop).

`eval/golden.ts` is the suite: each question is one meaning in several wordings plus a reference SQL that defines the right answer. Add your own cases there – that is how "many different phrasings" gets measured instead of guessed.

## Keeping the phonetic codes current
The phonetic code of every name is stored in `nlq.employee_name_codes` so matching stays fast (about 70 ms for 6,500 people instead of several seconds). A stored code is used only while its stored name still equals the employee's current name, so a renamed or newly added employee is always answered correctly without any action. After you change the phonetic functions themselves (for example adding a synonym in `name_synonym_normalize`), refresh the stored codes: `SELECT nlq.refresh_name_codes();`

**Spelling families.** Spelling variants of the -padhyay surnames (Mukhopadhya, Gangopadhya, Bandyopadhya, Chattopadhya ...) are treated as the same name as their family (Mukherjee, Ganguly, Banerjee, Chatterjee), for typed words and for stored names, by `nlq.spelling_fix` (file `06`, included in `01` for fresh installs). It lives in the `nlq` schema only; the phonetic functions in `public` are not changed. To add another family, extend that function and run `SELECT nlq.refresh_name_codes();`.

Setup files, in the order they were needed: `01` (views, helpers, role, stored codes), `02` (log table), `03` (optional login role), `04`, `05`, `06` and `07` (fixes and additions for a database that already ran the first version of `01`; a fresh install needs only `01`, `02`, `03`; if you run `05`, do not run `04` afterwards).

## The learning loop
Every question is stored in `public.nl2sql_log`. A ✓ marks the question/SQL pair as a worked example that is retrieved (by similarity) into future prompts. A ✗ stops that exact SQL being shown to that person again for that question. This improves answers **without code changes**.

## Known limits
- Not yet measured with the real model – that is what `nl2sql:live` is for.
- Each prompt carries the full live department list (~300 names), so it is roughly 8,000 tokens; expect 2–6 s per question.
- The SQL parser cannot read: array slices `a[2:5]`, `SELECT INTO`, `IS [NOT] DISTINCT FROM`, `SIMILAR TO`, `EXCEPT`, `INTERSECT`, `trim(both …)`. The model is told, and a rejected query is retried.
- `employee_roster` is a snapshot (26 Sep 2026); this reads whatever the views currently show.
- The local self-test uses stand-ins for your phonetic functions (built from the JavaScript port and verified against it). Your real functions are only exercised on your real database – the live evaluation does that.
- Answers are only as good as the model's reading. The "Understood as" line, the visible SQL and ✓/✗ exist because that reading can be wrong.

## Extending
- New short forms for departments/designations: `aliasHints.ts` (data, one line each).
- New worked examples: `examples.ts` (`SEED_EXAMPLES`; the self-test verifies each one runs).
- New rules or vocabulary: `prompt.ts`.
- New columns: add to the view in `sql/01_*.sql` **and** to the column list in `prompt.ts`. Never expose raw contact details.

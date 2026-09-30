# NL → SQL experiment (the language model writes the query itself)

**Status: experiment, isolated.** Nothing in the existing omnibar imports this, and this imports nothing from the existing employee-query engine (`parser.ts`, `namePredicate.ts`, `queryOrchestrator.ts` … all untouched and dormant). Delete the three new folders and the app is exactly as before:

- `src/lib/nl2sql/` – the engine, SQL files, tests
- `src/app/api/nl2sql/route.ts` – experiment endpoint (404 unless enabled)
- `src/app/nl2sql-lab/page.tsx` – a page to try questions by hand

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

`eval/golden.ts` is the suite: each question is one meaning in several wordings plus a reference SQL that defines the right answer. Add your own cases there – that is how "many different phrasings" gets measured instead of guessed.

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

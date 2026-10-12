# DSP Intranet

The intranet of SAIL Durgapur Steel Plant: home page, circulars archive, holiday calendar, employee directory, and the **omnibar**, a natural-language search bar that answers questions about employees, holidays, circulars and health check-up schedules.

Built with Next.js 14 (App Router), TypeORM on Postgres (Supabase), Vercel Blob for the circulars' page images, Tesseract OCR, and Groq / Gemini for the language model and embeddings.

## Run it locally

```bash
npm install
cp .env.example .env.local     # then fill in the values (names only are in .env.example)
npm run dev                    # http://localhost:3000
npm run build                  # the production build (type-check and lint included)
```

## Database setup

Run the files in `src/lib/nl2sql/sql/` in the Supabase SQL editor, in numeric order (each is safe to run again):

| File | What it sets up |
|---|---|
| `01_nlq_schema_views_role.sql` | the read-only `nlq` views and role the omnibar queries |
| `02_nl2sql_log_tables.sql` | the log of every question and its SQL |
| `03_optional_dedicated_login_role.sql` | optional: a separate login for the question answering (recommended for production) |
| `04`–`07` | name matching and the learning from the yes/no on answers |
| `08_health_checkups.sql` | the health check-up schedules and their view |
| `09_circular_ingest_log.sql` | what the upload decided about each circular |
| `99_local_test_standins.sql` | **never run on a real database**: tables for the scratch test database only |

## How circulars work

Uploading a circular (Circulars Archive) renders its pages, reads them with OCR and makes them searchable. The upload also recognises, **from the pages themselves**, a health check-up schedule (a ruled roster table with a column of merged date cells): it reads it, checks every person against the HR directory and stores it, so the omnibar can answer questions about it at once. The decision for each upload is written to `circular_ingest_log`. Deleting a circular removes its schedule and its log with it.

The holiday facts are not read from circulars: they are seeded from the curated files `Holidays/holiday20XX_enriched.json`.

## Tests

The suites need a scratch local Postgres (never the real database). Examples:

```bash
npx tsx src/lib/ingestion/schedule/rosterProbe.selftest.ts
npx tsx src/lib/ingestion/schedule/schedule.selftest.ts
NL2SQL_TEST_ADMIN_URL=postgres://postgres:<pw>@127.0.0.1:5432/postgres npx tsx src/lib/ingestion/schedule/ingest.selftest.ts
NL2SQL_TEST_ADMIN_URL=postgres://postgres:<pw>@127.0.0.1:5432/postgres npx tsx src/lib/nl2sql/eval/selftest.ts
```

## Tools (`scripts/`)

| Script | Use |
|---|---|
| `import-health-checkups.ts` | list the health check-up circulars and what was stored; read one by hand (`--ids N`, then `--apply`) |
| `reread-circulars.ts` | re-read stored circulars with the current OCR (a dry run first) |
| `bulk-upload.mjs` | upload many circulars from a folder using `circulars_manifest.csv` |
| `wipe-circulars.mjs` | `npm run wipe:circulars`: delete circulars |
| `audit-blob.mjs` | find page images in Blob storage that no circular uses |
| `test-search.mjs`, `circular-battery.mjs` | question batteries against a running server |

## Deploying to Vercel

Set every variable in `.env.example` in the Vercel project. The upload route runs for up to 300 seconds (the Hobby plan's ceiling) and needs the native packages `sharp`, `@napi-rs/canvas` and `pdfjs-dist`, which `next.config.js` includes explicitly.

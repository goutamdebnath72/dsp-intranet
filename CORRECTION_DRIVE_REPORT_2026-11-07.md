# dsp-intranet: correction drive after the Gemini handoff

- **Date:** 2026-11-07
- **Project:** `/Users/apple/projects/dsp-intranet`, branch `ai-search-feature` (HEAD still `184bcc3`)
- **Ticket:** 498301 (HOD, C&IT)
- **State of the work:** everything below is **uncommitted** in the working tree. Nothing was committed, pushed or merged by Claude. Committing is the owner's job.
- **Contains no secrets.** Safe to commit.

---

## 1. What was asked

1. Read two handoff files: Claude's earlier `HANDOFF_dsp-intranet_2026-11-02_shared-kit-and-command-admin.md` and Gemini's `HANDOFF.md`. Cross-check everything Gemini built over the previous 4 days for hidden bugs and for whether each feature was built in the best way.
2. Then: "take over the charge of this code and make it perfect at every corner where it is wrong now", fixing every finding one after another.

Standing rules followed throughout:
- Replies stay short.
- The owner commits, pushes and merges.
- Luxon for all dates.
- Contact data is only ever masked.
- Facility-kit patterns: `store.begin()` lock with the database as authority, `guardRecord` version guard, audit rows.
- Modal text-scale guard.
- Say plainly what a patch needs.

## 2. How the work was done

- Five independent review passes over the Gemini changes. Their findings were verified, not trusted.
- I also found bugs the reviewers missed. The main one was the announcement `FOR UPDATE` bug (see 4.5).
- Claims were checked read-only against the live database and the live Gemini API:
  - `information_schema`, `ListModels`, `EXPLAIN`.
  - All 25 expected tables exist.
  - `facility_audit.action` accepts any lowercase word.
  - `contact_access_log.id` is a varchar uuid and `accessedAt` is timestamptz in UTC.
  - There are no pending holiday staging rows (only 5 rejected ones).
- Every fix was then tested. New "live" tests run the real store code against the real schema in a transaction that is always rolled back.

## 3. Verification results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next lint --dir src` | clean |
| `next build` (production) | two clean builds |
| Full selftest sweep | **130 / 130 pass** (was 119 / 125 before) |
| Dates selftest in 4 time zones | 56 / 56 in each |
| Live rollback tests | announcements 13, holidays 21, access log 16, all pass; each was mutation-proved (original bug put back, test fails) |
| Left-behind data | nothing; rollback confirmed |

End-to-end HTTP tests on the built server (port 3055, since stopped):
- GPAIS, wages, gate-pass and quarters queries return the correct circulars first.
- "hello" answers instantly.
- Hospital: "No, Dr. Ajit Karmakar does not sit on Tuesday…" and "Yes … Thursday".
- NL2SQL "how many employees work in C&IT" returned **25** with correct SQL on Gemini, in about 8 s.

Notes on the sweep:
- Four React selftests showed "React is not defined". That was only a missing `--tsconfig tsconfig.selftest.json` flag, not a real failure.
- `facility.selftest` and `adminStore.selftest` are still skipped. They need `NL2SQL_TEST_ADMIN_URL`, a scratch database.

---

## 4. Findings fixed, by area

### 4.1 Secrets and repository hygiene
- `HANDOFF.md` contained live secrets (Gemini key, DB password, NEXTAUTH_SECRET, Blob token, GitHub secret). They are **blanked**, and a CORRECTIONS banner at the top lists the false claims in it.
- `.gitignore` now also ignores:
  - `/2026 to 2022/` (130 MB of circular PDFs)
  - `reread-gemini-cache/`
  - `ocr-test-results/`
  - `DSP_Circulars_Query_Test_Set.pdf`
  - `HANDOFF*.md`
- Checked with `git add -A -n`: it stages nothing sensitive (only `.env.example`).
- `.env.example` is updated with `GEMINI_CHAT_MODEL`, `GEMINI_SYNTHESIS_MODEL`, `GEMINI_SYNTHESIS_THINKING`, `GEMINI_VISION_MODEL` and `LLM_PROVIDER`. Groq is now optional.

### 4.2 One hardened Gemini adapter (new `src/lib/ai/geminiChat.ts`)
**Problem.** Gemini calls were scattered and fragile. A live measurement showed Gemini 3 counts thinking tokens against `maxOutputTokens`, so Executive Deep Synthesis on Pro with a small cap returned just `{` with `MAX_TOKENS`.

**Fix.** One adapter, `geminiGenerate(prompt, req)`, now handles every Gemini text call:
- Model fallback chain: chat is `GEMINI_CHAT_MODEL` or `gemini-3.8-flash`, then `gemini-flash-latest`. Synthesis is `GEMINI_SYNTHESIS_MODEL` or `gemini-3.1-pro-preview`, then `gemini-pro-latest`, then `gemini-3.8-flash`.
- Per-attempt timeout (`AbortSignal.timeout`) plus a total deadline.
- `thinkingLevel` defaults to `low`, with an output padding by level (minimal 256, low 2048, medium 6144, high 12288).
- It joins only non-thought text parts.
- `finishReason === "MAX_TOKENS"` is treated as an error instead of silently returning truncated text.
- The API key goes in the `x-goog-api-key` header, not the URL.
- Error handling:
  - 429, 404, 5xx and timeouts go to the next model.
  - A 400 that mentions thinking retries the same model without it.
  - 401, 403, `API_KEY_INVALID` and other 4xx stop immediately.
- `GeminiError` carries a safe message for the browser, with detail kept for logs only.
- `traceModelCall` includes thinking tokens.

**Groq is no longer required.**
- `src/lib/nl2sql/llm.ts` gained `geminiLlm()` and `chatLlm()`. Gemini is the default when `GEMINI_API_KEY` exists. Groq is used only if `LLM_PROVIDER=groq`, or if it is the only key present.
- `nl2sql/route.ts`, `ai-search/answer/route.ts` and `nl2sql/omnibar.ts` use `chatLlm()`.
- `ai-services.ts`: `generateChatResponse` routes to Gemini when `AI_ENVIRONMENT === "cloud"` and Groq is not preferred. The header comment is rewritten. `generateEmbedding` is now a re-export from `geminiEmbedding`.

### 4.3 AI search: router, hospital, ranking, synthesis

**Router (`src/lib/search/pureAiEngine.ts`, rewritten)**
- `parseQueryWithLlm` returns a validated `ToolCall | null`.
- Greeting-only queries are answered instantly. ID-like queries are never sent to the LLM.
- The keyword fallback that guessed "hospital" is gone.
- Replies are capped at 400 characters only for conversational answers.
- `agentRouter.ts` and its selftest are deleted. `runPureAiAssistant` is removed.
- The route runs the router only when `mode === "semantic"`, the query is not retrieval-only, and it is not a retry.
- A router "circular_search" skips the employee model only if the deterministic `decideModelSkip` agrees.

**Hospital answers**
- The executor is data-driven.
  - Doctor matching is by whole name parts: `findDoctors`, `resolveDoctor`, and a "Which doctor?" question on ambiguity.
  - The day check covers all units.
  - `holdsQualification` matches whole words, so "MD" no longer matches "MDS".
- No invented facts. The old "tokens are mandatory" and "yes after 5 PM" are gone. Answers use `timingNotes()` and `SCHEDULE.generalOpd`, `SCHEDULE.emergency` and `SCHEDULE.unitRule`, all from `opd_schedule.json`.
- New `hospitalDispatch.ts` (`answerHospitalQuestion`). It tries the original engine first. If that engine's card tone is "unknown" and the new executor can answer, it uses the new executor. This fixed "karmakar there 5pm" being answered with "could not find doctor …".
- `hospital/engine.ts` exports `timingNotes` and `holdsQualification`.
- Selftest rewritten: deterministic, 48 checks, mutation-tested.

**Ranking (`rankAdjust.ts`)**
- The hard filter that removed every contractor circular is now a **demotion**: −12, or −30 when the query names employees.
- Contractor circulars are dropped only for explicit-employee queries when a regular circular scores at least as well.
- Contractor holiday circulars are never dropped for contractor questions.
- New `CONTRACT_QUERY_RE` covers contract, contractor, CW, labour and workers.
- Selftest rewritten: 27 checks with realistic per-query pools.

**Executive Deep Synthesis (`executiveSynthesis.ts`)**
- Uses the shared adapter (cap 6000, thinking from `GEMINI_SYNTHESIS_THINKING`, default low, 40 s per attempt, 52 s total).
- Source budget `SYNTH_TOTAL_BUDGET = 150000` is split across sources.
- Safe outer catch, so only safe messages reach the browser.
- The **overview is now checked against the source text**: sentences with ungrounded figures are dropped, with a fallback to the first verified finding. Previously only the findings were checked.
- New `executiveGrounding.selftest.ts` (8 checks).

**Search bar**
- New `idQuery.ts` with `isIdQuery`. Years 1990 to 2100 are not treated as IDs. Selftest has 18 checks.
- `useOmniSearch` now returns `isStale`.
- `OmnibarModal` has an `employeeReq` sequence guard, so out-of-order responses are ignored, and the banner is hidden while results are stale.
- `HospitalAnswerCard`: escaped RegExp and a null-safe `keepOnOneLine`.

### 4.4 Embeddings and re-ingest
- **Problem:** new circular uploads stored embeddings as query-type vectors, while the 57 re-read circulars are document-type. Mixed spaces hurt retrieval.
- **Fix:** every stored embedding is now `"search_document"` (`RETRIEVAL_DOCUMENT`). Queries use `RETRIEVAL_QUERY`. This covers the circulars route and `scripts/reread-circulars.ts`.
- `scripts/reingest-circulars-gemini.ts` hardened:
  - Skips holiday and roster circulars.
  - Refuses incomplete, short or empty readings, and never caches them.
  - `.committed` flag for safe resume.
  - Per-circular try/catch and a proper exit code.
  - Luxon dates.
  - A dry run from cache matched what is stored.
- `scripts/test-eds-query.ts` moved to Luxon.

### 4.5 Announcements
- **Edit and delete failed on every call**, from two stacked SQL bugs found by me (not the reviewers):
  1. `FOR UPDATE` cannot lock the nullable side of a LEFT JOIN, so it now uses `FOR UPDATE OF a`.
  2. The code used the wrong read-status table name. It is `announcementreadstatus`.
- Also: an explicit column list instead of `a.*`, publish-date validation with Luxon, and `limit` clamped to 1–50.
- The legacy unaudited routes (`api/announcements` POST, `[id]` PATCH and DELETE) now return **410**.
- `AnnouncementsFeed.tsx`: the trash icon opens the manager instead of deleting directly.
- `AnnouncementAdminUi.tsx`: HTML is sanitised on render with `sanitizeAnnouncementHtml`.
- Proven by `announcementLive.selftest.ts` (13 checks).

### 4.6 Circulars
**Upload (`api/circulars/route.ts` POST)**
- Same-origin check, then a login check, then the Circular authority check before any work. The author is the **session ticket**, not a client-supplied name.
- Server-side limits: 15 MB, PDF/PNG/JPEG only, magic-byte check, and the date must not be in the future and must be 2000 or later.
- The audit row is written **in the same transaction** as the upload (`begin(q, "circular", actor)` plus `writeAudit`). Before, it was a separate client call that could be skipped.
- A `warning` field is returned if zero chunks were produced.
- Safe error messages, and 403 for `Forbidden`.

**Edit and delete (`api/circulars/[id]/route.ts`)**
- PATCH changes the headline only. It no longer accepts `fileUrls`, which was a hole that could have let a caller delete other Blob files.
- A new `authorise()`: the HOD can edit or delete any circular; a delegate only their own, within `EDIT_DELETE_WINDOW_HOURS`.
- Facility lock after year lock, `FOR UPDATE` existence check, audit rows, `NotFoundNow`.

**UI and store**
- `CircularAdminPanel.tsx` reads `data.circular.{id, fileUrls}`, shows the warning, and no longer calls `record-audit`.
- `circulars/admin/api.ts` dropped the `record-audit` op and clamps the `recent` limit. `store.ts` dropped `recordCircularAudit`.
- `CircularAdminUi.tsx` has a history labels map.
- `CircularsModal.tsx` shows its buttons for `isSuperAdmin` and shows the server's error.

### 4.7 Holidays
- **Five legacy routes with no login are deleted:** `upload-and-seed`, `unseed`, and `extraction-staging` (list, confirm, reject).
- All staging code is removed from `store.ts`, `api.ts`, `intent.ts`, `types.ts` and `HolidayAdminUi.tsx`.
- Store hardening:
  - The version guard is **mandatory** for seed and clear.
  - The version now covers note, categories and quota values.
  - Dates use `to_char`.
  - Year, type and quota are validated.
  - The RH quota is replaced only if the file carries one.
  - Non-ASCII text is kept by the parser.
- Policy chunks (holiday notes in search) are built **before** the lock and written **inside** the seed transaction. This uses the new `buildPolicyChunkRows` and `writePolicyChunkRows` in `policyChunks.ts`.
- `HolidayAdminPanel.tsx` sets `yearView = null` plus an error when loading fails, and disables Seed when there is no version.
- `facility/audit.ts`: `lastChangeOf` now ignores `grant`, `revoke` and `view` rows.
- Proven by `holidayLive.selftest.ts` (21 checks).

### 4.8 Contact Access Log
- **Viewing the log is now audited.** `recordAccessLogView` writes a `view` row (who, when, filters, total, never the lines). Looks with the same filters within 2 minutes write one row. If the row cannot be written, the lines are not shown.
- Fixes:
  - Page and pageSize are truncated to integers, so fractional or huge values no longer 500.
  - Day bounds are in **IST**. Previously a 23:30 IST entry showed under the next day.
  - `%` and `_` typed by the user are escaped (`likeEscape`).
  - A `LATERAL` roster join removes duplicated rows.
  - `id` is a string (it is a uuid), also in `types.ts` and the UI.
  - Bad dates now return a clear 400.
- `AccessLogAdminUi.tsx` shows "Viewed the Access Log".
- `superAdmin.ts`: the `SUPERADMIN_TICKETS` environment variable now **overrides** the built-in 498301. Before, the old HOD stayed HOD of all six tools until the code was edited.
- Proven by `accessLogLive.selftest.ts` (16 checks).

### 4.9 Departments and employee queries (NL2SQL)
- `aliasHints.ts` and `prompt.ts` reverted to HEAD. Gemini's additions blew the prompt budgets and broke two selftests. That is why the two failing selftests now pass.
- `context.ts`: `parent_id` removed.
- `sailDepartments.ts`: one display rule, `formatDepartmentDisplay`. A normal department shows as "X (Marketing)"; an office department shows as "X (OFFICE, Marketing)". `parentId` is removed.
- `employees/admin/store.ts`: the SQL `CASE` is removed in favour of JS formatting. `rosterQuery.ts` formats the department.
- `departmentAsk.ts`: the word "department" counts as a department question only in questions of 4 words or fewer.
- Fixture `departments.real.json` reverted via `git checkout`.
- New `departmentDisplay.selftest.ts` (10 checks).

### 4.10 Other
- `api/employees/photo/route.ts`: a missing `Content-Length` now gets 411. It used to count as 0, so a chunked body was read in full before any size check.
- `STATUS.md` has a new row 72 describing this drive.

### 4.11 New test infrastructure
- `src/lib/facility/rollbackDb.ts`: a `FacilityDb` that runs everything inside savepoints in one transaction that is always rolled back.
- Live selftests, skipped unless `ADMIN_LIVE_TEST_URL` is set:
  ```
  ADMIN_LIVE_TEST_URL="$DATABASE_URL" npx tsx src/lib/announcements/admin/announcementLive.selftest.ts
  ADMIN_LIVE_TEST_URL="$DATABASE_URL" npx tsx src/lib/holidays/admin/holidayLive.selftest.ts
  ADMIN_LIVE_TEST_URL="$DATABASE_URL" npx tsx src/lib/accessLog/admin/accessLogLive.selftest.ts
  ```
  (If a path differs, find the file with `ls src/lib/*/admin/*Live.selftest.ts`.)
- `executiveGrounding.selftest.ts`, `idQuery.selftest.ts`, `departmentDisplay.selftest.ts`, and rewritten `rankAdjust` and `pureAiEngine` selftests.

---

## 5. File inventory (all uncommitted)

**Created:** `src/lib/ai/geminiChat.ts`, `src/lib/search/hospitalDispatch.ts`, `src/lib/search/idQuery.ts` (+ selftest), `src/lib/facility/rollbackDb.ts`, the three live selftests, `executiveGrounding.selftest.ts`, `departmentDisplay.selftest.ts`, this report.

**Deleted:** `src/lib/search/agentRouter.ts` (+ selftest), `src/app/api/holidays/{upload-and-seed, unseed, extraction-staging/**}`.

**Modified:** about 56 files across `src/app/api/*`, `src/components/*`, `src/lib/{ai-services, announcements, accessLog, circulars, employees, facility, holidays, hospital, nl2sql, search}`, `src/hooks/useOmniSearch.ts`, `scripts/*`, `.gitignore`, `.env.example`, `STATUS.md`, `HANDOFF.md`.

Git state at the end: 56 modified, 7 deleted, 15 untracked.

---

## 6. What the owner must do

1. **Rotate the exposed secrets:** the Gemini key, DB password, `NEXTAUTH_SECRET`, Blob token and GitHub secret. They were in a plain file and in the chat transcript.
2. **Review and commit.** `git add -A` is safe. Suggested message:
   `fix: correction drive after cross-check (Gemini adapter, search ranking, announcement/circular/holiday/access-log tools, legacy open routes)`
3. **Vercel environment:**
   - Required: `GEMINI_API_KEY` (paid) and `SUPERADMIN_TICKETS`.
   - `GROQ_API_KEY` is now optional.
   - Optional: `GEMINI_CHAT_MODEL`, `GEMINI_SYNTHESIS_MODEL`, `GEMINI_SYNTHESIS_THINKING`, `LLM_PROVIDER`.
4. **Test on screen** (none of this was browser-tested):
   - Announcement edit and delete.
   - Circular upload and delete, and check the History tab shows the audit rows.
   - Holiday seed and clear.
   - Access log view, then check the audit entry.
   - Hospital questions, and several employee and department questions on Gemini.

## 7. Known open items (not changed)

- **Circular upload vs Vercel:** the screen allows 15 MB, but Vercel rejects request bodies over 4.5 MB. This was already the case. Large PDFs need a direct-to-Blob upload.
- **Uploads still read with Tesseract.** Gemini is only an optional second reading, not the main reader as the handoff claimed.
- **Employee-question quality on Gemini** was measured on only a few queries. Run the NL2SQL evaluation set before relying on it.
- **Router latency:** every plain semantic search pays about 1–2 s and about 1,300 tokens for the router call.
- **Circular 86 "TEST GPAIS premium"** is a test row in the real archive and shows up in search. Left untouched. Delete it if you agree.
- **Stale `circular_page_check` rows** after the re-read. Run `scripts/check-readings.ts` to refresh.
- **`facility.selftest` and `adminStore.selftest`** are still skipped (need `NL2SQL_TEST_ADMIN_URL`, a scratch DB).
- **`EDIT_DELETE_WINDOW_HOURS` = 60 days** is a marked temporary widening of the edit/delete window.
- **`extraction.ts`** (Groq-based holiday extraction) is dead code, left in place.

## 8. Problems met along the way

- The macOS shell has no `timeout`, so I used perl `alarm`.
- zsh glob and echo quoting errors, fixed by quoting.
- An empty Gemini curl probe was a shell quoting issue. I redid it in Node and learned `thinkingLevel: "low"` works and that default thinking truncates Pro output.
- The first `rankAdjust` selftest failed because my candidate pool was unrealistic. I rewrote it with per-query scores and refined the rule.
- `tsc` "Cannot redeclare block-scoped variable" in the live selftests, fixed with `export {}`.
- A `prefer-const` lint error in `pureAiEngine`, fixed.
- One shell safety check blocked a Python heredoc (misread as `rm`; nothing ran). I redid those edits with the Edit tool.

# eval/ : the omnibar acceptance set

`router-acceptance.json` is the list of questions the omnibar must answer, with what a correct answer looks like.
`node scripts/omnibar-acceptance.mjs` sends each one through the real `/api/ai-search` (the same door the Enter key
uses) and writes a report to `eval/results/` (git-ignored: it holds answers from the live directory).

Read `scripts/omnibar-acceptance.mjs` (the header) before the first run: local dev and Vercel share the same Groq
account. Measured on 13 Oct: one model call is about 4,900 tokens, the free tier allows about 8,000 tokens a minute and
200,000 a day, so a full run does not fit in one day (use `--max-model-calls`, then `--resume`; the runner waits
`--model-pause`, 40 s by default, after each question that used the model). Start with `--no-model` (free).
Since step 23a the app reports, in response headers (`x-omni-*`, `Server-Timing`) and in one `[front-path] ...` line per
question in the server console, the route that answered, each stage's time, the model calls and the exact tokens. The runner
records them (so `--max-tokens` is exact) and the report shows model use and where the time goes, per route.

## A record

| field | meaning |
|---|---|
| `id`, `query`, `area`, `source` | name, the exact words typed, topic, where it came from (A B K H F HC S CB G; `user` for yours) |
| `expectedRoute` | the channel that must answer: `HOLIDAY` `EMP-SQL` `HEALTH-SQL` `CIRCULAR` `POLICY` `EDS` `BAD-QUERY` `NOT-FOUND` (an empty list or a "cannot answer" card), a list of acceptable ones, or `ANY` |
| `expectedFacts` | text that must appear (whole words, punctuation ignored). An inner list = any one of these |
| `forbiddenFacts` | text that must NOT appear |
| `rowHas` | rows of tokens that must sit together in ONE row of the answer (a table row, a person, a holiday) |
| `expectedCount` | `{of: count / rows / people / holidays / details / results, n}`: the number the answer reports |
| `circular` | the circular battery's rules (`expect`, `ok`, `forbid`, `notAbove`, `topIs`, `expectType`, `expectAny`) |
| `lastKnown` | status in the query log: ✅ verified on Vercel, ✔ passed earlier, ❌ failed, ❓ untested, 📌 computed from the source data |
| `regression` | verified on screen: must never break (only ✅ records) |
| `timeSensitive` | the right answer depends on today's date |
| `pendingDecision` | an open decision: the answer is shown in the report but not judged |
| `requires` | flags that must be given with `--with` |
| `run` | `{mode: "intellectual", ticket: "$EXEC"}` for Executive Deep Synthesis (runs only with `--eds`) |

## How a failure is labelled

`ROUTE`: the question went to the wrong channel (the front path's fault). `ENGINE`: right channel, wrong or missing
content. `ERROR`: no usable answer (timeout, 5xx, model allowance used up). Whether the answer is *displayed*
truthfully is not judged by a script: look at the screen for anything that matters.

## Adding your own queries

Append a record with `"source": "user"`, run `node scripts/omnibar-acceptance.mjs --only YOUR-ID`, and then run
`node scripts/omnibar-acceptance.selftest.mjs`, which checks that the file is still well formed.

## The front-path gate (step 24a): testing it with this harness

`FRONT_PATH_SKIP_MODEL=true` in `.env.local` (restart `npm run dev`) turns the gate on; any other value keeps today's
behaviour exactly. With it on, a question that mentions no one in the directory, no department, no ticket and no
people-data word skips the model call and goes straight to circular search; if circular search finds nothing, or fails,
the model is asked after all. The report counts `skipped / model / fallback` and shows the tokens saved.

How to test it:
1. `node scripts/omnibar-acceptance.mjs --source CB --tag gate-on --max-tokens 100000` with the gate ON. These are the
   58 circular questions: most should cost 0 tokens, and every one must still return the circular its record expects.
2. `node scripts/omnibar-acceptance.mjs --source A,B,K,S,HC --max-tokens 120000 --tag gate-on-people` with the gate ON:
   employee and health check-up questions must still go to the model (`gate model`) and pass as before.
3. Any question the gate skipped that should not have been shows as a ROUTE failure: send me the report.

## Synthesis (EDS) questions and the security probes (step 25a)

Since step 25a the server decides WHO is calling from the login session only; the `ticket` parameter in the URL is
ignored. So the four synthesis records (`run.auth: "exec"`) need a real executive session:

1. Log in to the app in your browser as an executive.
2. Open the developer tools > Application > Cookies, and copy the value of `next-auth.session-token`.
3. `node scripts/omnibar-acceptance.mjs --only A-C1,A-C2,A-C3,A-C5 --eds --cookie "next-auth.session-token=PASTE" --tag eds`

The cookie is sent only with the synthesis questions, and is never written to a result file or echoed (it shows as
`[hidden]`). Without `--cookie` those records are skipped, with that reason in the report.

The two `SEC-` records need no cookie: they ask for synthesis WITHOUT a login (one also types an executive's ticket into
the URL) and FAIL, with a SECURITY note, if the server ever answers with a synthesis. Run them after any change to the
route: `node scripts/omnibar-acceptance.mjs --source SEC --tag sec`.

## Which questions are EDS, and the Enter key (steps 26a and 27a)

EDS is the "data mining" route for a policy maker: questions whose answer is HIDDEN until facts from several circulars are related
(compared, correlated, traced over time, checked for gaps and contradictions). The detector is `src/lib/search/synthesisIntent.ts`
(read its header). It looks for: an analytic verb (trace, compare, contrast, synthesize, cross-reference, briefing), a version relation
("what changed between", "original ... corrected", "first announced"), an aggregate over a period ("list the events in December"),
DISCOVERY language (correlate, hidden, overlooked, inconsistencies, implications, relationship between, overlap, patterns, trends,
how often, across all circulars ...), plus supporting shape (two or more years, "and which / and what", many named things, length).
A Smart Semantic question asks ONE thing that ONE circular answers. People-data questions are never EDS.

* The verdict is always recorded (`x-omni-synth`, and `synth synthesis 6` in the terminal line).
* THE SCREEN DECIDES (step 27a): with `NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=true` in `.env.local` (restart `npm run dev`), a LOGGED-IN
  EXECUTIVE who presses Enter on an EDS-type question gets Executive Deep Synthesis, exactly like the old button: the same processing
  panel, the same briefing. The server verifies the executive again. If that synthesis finds no relevant circular, the screen falls back
  to the normal search by itself. Off by default.
* Every record says what it should be (`synthesis: true`) and EVERY OTHER record must NOT be taken for EDS: a mismatch is a ROUTE
  failure. `--source INT` (16 records) runs the EDS-type questions as a plain Enter without a login: they must be recognised, never synthesised.
* `--source SS` runs the 5 Smart Semantic questions of the old query document, with their expected circulars.
* `--source EDS --eds --cookie "..."` runs the 4 old EDS tests as an executive (route only until the verified truth set adds facts).

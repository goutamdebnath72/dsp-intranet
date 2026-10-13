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

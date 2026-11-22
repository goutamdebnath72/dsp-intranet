# One umbrella for every query the search bar answers (plan, 22 Nov 2026)

Scope: everything the search bar answers **except** Utility Services (`src/tools/`) and Executive Deep Synthesis (EDS). Those two stay exactly as they are.
Status: PLAN ONLY. Nothing in this file is built yet. Written from a reading of `route.ts`, `omnibar.ts`, `OmnibarModal.tsx`, `idQuery.ts`, `nameSearchGate.ts`, `employeeSearch.ts`, `pax/route.ts`, `hospitalDispatch.ts` and `pureAiEngine.ts`.

## 1. What is there today, and why it needs an umbrella

A typed line is decided in **three places**, by three different mechanisms:

| Layer | Where | How it decides |
|---|---|---|
| Browser | `OmnibarModal.tsx` Enter handler | a fixed `if` ladder: calculator/tool, then ID line, then management words, then "which utility", then executive question, then name search + search |
| Server, outer | `api/ai-search/route.ts` `handleSearch` | management fast path, name checks (`looksLikeName`, department-in-text), then the **model router** `parseQueryWithLlm` (hospital / employee / circular / EDS / holiday / PAX / chat), then the front-path gate |
| Server, inner | `nl2sql/omnibar.ts` `runOmnibar` | a hard-coded first-match-wins chain: management hub, employee admin, dates, PAX admin, holiday admin, circular admin, announcement admin, access-log admin, PAX, hospital, PhD, degrees, holiday, department words, verified answer, then the **model writes SQL** |

Problems this causes, all visible in the code:

1. **Order lives in code comments** (`0-----`, `0----`, `0---` ...). Adding a domain means editing three files. The tools registry already solved this for utilities (one folder, one line); the records side has no equivalent.
2. **Up to three model calls for one sentence**: the browser's "which utility do you mean" (`intentAi`), the server router, then the SQL writer. Each costs time and tokens.
3. **First match wins, not best match.** "pax number of hospital opd" is right only because PAX is placed before hospital. Every new domain must be slotted by hand against every old one.
4. **Name detection exists four times**: `looksLikeName` (route), `looksLikeNameSearch` (nameSearchGate), `isNameShaped` (route), the name hint. They can drift apart.
5. **Identifier handling is split**: the browser fetches `/api/employees/search?mode=id` live (P.No, mobile and CUG4 need a login, else 401), while PAX and dates re-detect tickets on the server.
6. **No record of why** a line went where it went, and no way to ask "what else could it have been?"

## 2. Principles (what makes it robust)

Nothing here is "foolproof" in the sense that an error cannot happen. The aim is that **a failure is safe, visible and cheap to fix**:

- **P1. Claim, don't chain.** Every domain declares what it can answer and *scores* its claim. One router picks the highest. Adding a domain never means re-ordering the others.
- **P2. Facts before the model.** Deterministic claims (identifiers, names, department and designation words, explicit cue words) are tried first and cost nothing. The model is used only when no deterministic claim is strong enough. Identifiers (ticket, P.No, mobile) never go to any model.
- **P3. Ambiguity is asked, never guessed.** If two claims are within a margin of each other, the bar shows a small choice ("a person / a department / a document") and records the answer. A silent wrong guess is the worst outcome, an extra tap is the cheapest.
- **P4. Access is declared once.** Each domain says who may use it (everyone, signed in, HOD only, admin) and what is masked. The router enforces it in one place, so no domain can forget.
- **P5. Shared files name no domain.** The same rule the tools registry already enforces with `registry.selftest.ts`.
- **P6. Nothing flips without proof.** A regression corpus and a shadow mode (new router runs beside the old chain and only logs disagreements) come before any switch.
- **P7. Every step has a kill switch** and the old path stays for two releases.

## 3. Words used in this plan (decided here)

| Term | Meaning |
|---|---|
| **Line** | exactly what the person typed, after `cleanQueryString` |
| **Entity** | a piece of the line the tagger recognised: an identifier (ticket, P.No, mobile, CUG4), a name word, a department phrase, a designation phrase, a grade, a year, a date, a number |
| **Cue** | a word that names a domain: `pax`, `opd`, `holiday`, `circular`, `notice`, `policy`, `birthday` ... Each domain owns its cues. |
| **Claim** | a domain's pure answer to "is this yours?": `{ score, intent, filters }` or nothing. Offline, under 5 ms. |
| **Band** | the tier a claim belongs to (section 5). The score is `band x 100 + strength`. |
| **Intent** | what is wanted from the subject: `find`, `list`, `count`, `head-of`, `compare`, `attribute` (phone, e-mail, dates), `explain` |
| **Plan** | the router's output: the ordered list of claims to try, and the reason for the order |

## 4. The domains under the umbrella ("Records")

| Domain | What it answers | Today answered by | Access |
|---|---|---|---|
| **people** | find / list / count / compare employees (the multi-dimensional one, section 6) | `employeeSearch.ts`, `rosterQuery.ts`, NL to SQL | name and roster: everyone; P.No, mobile, CUG4 lookup: signed in; reveal: signed in + audit |
| **pax** | a department's PAX number; an executive's CUG number | `pax/route.ts` | everyone (CUG masked) |
| **hospital** | OPD doctors, units, timings, closures, "can I see Dr X on Tuesday" | `hospital/engine.ts` + `hospitalDispatch.ts` | everyone |
| **holidays** | holiday lists, "is it a holiday on", comparisons | `holidays/parser.ts`, `employees/analytics.ts` | everyone |
| **qualifications** | what a degree means; PhD holders; lists by qualification | `degreeAnswer.ts`, `phdHolders.ts` | everyone |
| **dates** | date of birth / date of joining of a person | `peopleEvents/datesLookup.ts` | HOD of C&IT only, refusal otherwise |
| **management** | the management page and each admin tool (employees, PAX, holidays, circulars, announcements, access log) | `answerAdminFast` responders | admin per tool |
| **documents** | circulars and announcements (the plain search, not EDS) | `executeSmartSemanticRouter` and the circular answer | everyone |
| **assistant** | greetings, "what can you do" | router's `conversational` | everyone |

Left out on purpose: Utility Services, EDS. The browser still asks the tools registry first; this umbrella starts where that ends.
To confirm before building: the people-events calendar (birthdays on the home page) has no omnibar route today; whether it should become one is an owner decision (section 10).

## 5. Order: bands, then score, then a declared tie-break

A line is tagged once, then every domain claims. Highest `band x 100 + strength` wins. The bands:

| Band | What | Why it ranks here |
|---|---|---|
| 0 | **Changes and management**: an action word must **lead** the line ("add new employee", "post circular", "manage holidays") or the line is the management page's own words | a request to change data must never be read as a search; this is today's rule, kept |
| 1 | **Explicit cue**: the line holds a domain's own cue (`pax`, `opd`, `holiday`, `circular`, `degree` ...) | the person said what they want. "pax number of hospital opd" is PAX, not hospital |
| 2 | **Exact identifier**: ticket, P.No, mobile, CUG4, (a PAX extension only with a PAX cue) | exact, free, no ambiguity once the shape is right |
| 3 | **Entities**: names, departments, designations, grades, with an intent | the directory words are matched in memory |
| 4 | **Analytic question** for the model (SQL writer) | costs a model call, so it is after everything free |
| 5 | **Documents**: circular and announcement search | the catch-all for text with no record in it |

Rules inside and between bands:

1. Higher band wins. Inside a band the higher strength wins. Strength comes from the tagger: how many of the line's informative words the claim explains, minus words it does not.
2. **Two claims within 15 points, different domains: ask** (P3). Exception: the collision register below, where the answer is already decided.
3. A claim that answers `null` (the engine looked and found nothing it can say) **falls through** to the next claim. The final fall-through is always documents.
4. A claim whose domain refuses (access) answers the refusal. It does not fall through (a signed-out person asking someone's date of birth gets the refusal, never a search of circulars).
5. The model's router (`parseQueryWithLlm`) is no longer a gate in front of everything. It is only consulted when the best deterministic claim is below band 3 or ambiguous, and its answer is one more claim (never an override of a band 0 to 2 claim).

### Collision register (data, each row is a test)

| Line | Could be | Decision |
|---|---|---|
| `2025` | year (circulars) or CUG4 | a year between 1990 and 2100 is a year (today's rule); any other 4 digits is CUG4 |
| `42046` | PAX extension or nothing | only with a PAX cue ("who has 42046", "is 42046 a pax number"); otherwise documents |
| `roy blast furnace` | person + department | people, intent `find`, filter department |
| `blast furnace` | department or document | people (`list`) claims at band 3; documents at band 5; ask only if the line also holds a document cue |
| `c&it attendance` | department + topic | documents (a department with a topic word is not a person) |
| `dr karmakar` | doctor in OPD, or employee | hospital if a time, day or OPD word is present; otherwise people with the doctor card; if both fit, ask |
| `pax number of X` | PAX, person contact | PAX cue is band 1: X is tried as a department first, then as an executive (today's order, kept) |
| `contact number of X` (no pax) | person, PAX | people, attribute: the contact (masked, reveal); PAX only if X is a department |
| `holiday list 2025` | holidays or circular | holidays; the circular "holiday list" stays as a source on the card |
| `leave policy` | holidays, documents | documents (no holiday cue, no date) |
| `datta` / `dutta` | same family | one person family (done), nothing to decide |
| a name equal to a department word (`mechanical`, `fire`) | person or department | department wins when the word is the whole line; a name wins when a second name word is present |
| `dob of X`, `joining date of X` | people, dates | dates, always (it is HOD-only, and settles before any other route) |

The register lives in `src/records/collisions.ts` as a table that the selftest feeds through the router. A new collision found in live use is one new row.

## 6. The multi-dimensional case: people

The people domain is one claim with **facets**. The tagger fills the facets, the intent comes from the remaining words. Resolvers run in this fixed order, each deterministic until the last:

| # | Subject in the line | Examples | Resolver | Model? |
|---|---|---|---|---|
| A | one identifier alone | `498301`, `D123456`, `9434791234`, `2584` | exact lookup (`searchEmployeesById`); case-insensitive P.No; signed-in rule kept | no |
| B | an identifier inside a sentence | `details of 498301`, `phone of D123456` | same lookup, intent from the other words | no |
| C | a name (1 to 4 words), optionally + department or designation | `rakesh ojha`, `ojha c&it`, `sharma dgm` | phonetic name search with the spelling families; the extra word narrows | no |
| D | department and/or designation, with a list/count/head intent | `employees of chrd`, `all dgms in c&it`, `who is hod of blast furnace` | deterministic roster query (`rosterQuery.ts`) over the tagged department and designation, seniority order | no |
| E | an attribute of a named person | `email of X`, `mobile of X` | resolve X by C, then the masked card with reveal | no |
| F | anything analytic | `how many employees posted in c&it and who is the head`, `average age by grade` | SQL writer (existing, unchanged) | yes |

What "multi-dimensional" needs, and the rule for each:

- **Combine, don't choose.** A line can hold several entities (name + department, designation + department, department + qualification). The tagger returns all of them; the resolver applies every filter. A combination the deterministic roster query cannot express goes to F, not to an error.
- **Intents are small and closed**: `find`, `list`, `count`, `head-of`, `compare`, `attribute`. Their cue words (`how many`, `list`, `who is in charge`, `head of`, `hod`, `compare`, `phone`, `email`) belong to people and are data.
- **Ordering is fixed**: every list is seniority order (`global_seniority_rank`), the project's no-compromise rule.
- **Cheap before costly**: A to E need no model. Only F is a model call, and F already has its own four safety layers.
- **Wrong person is the worst error**: C returns near matches as a short list, never auto-picks one when two names are equally close.

## 7. How a line travels (target)

```
browser:  tools registry first (unchanged)  ->  planLine(line)  [pure, shared with the server]
              plan = open a utility | live ID lookup | send to the server
server :  tag(line)  ->  every domain claims  ->  router orders the claims  ->  try each until one answers
              (trace: winner, runner-up, scores, the reason; header x-omni-domain)
              deterministic claims first; the model only if nothing strong is left (rule 5)
```

- The browser's plan is **only for speed and for keeping identifiers local**. The server never trusts it: it tags the line again.
- One tagger, one vocabulary load (department phrases, designation phrases, directory name words), cached per server copy, in memory. The four name checks of section 1 collapse into it.
- The route keeps its rate limits, the 1,000 character limit, the session as the only source of "who is calling", masking at the response boundary (`shaped()`), and the SQL log.

## 8. Where the code goes (same shape as the tools registry)

```
src/records/
  types.ts          Entity, Claim, Plan, Domain (no domain named)
  tag.ts            the one tagger (pure): identifiers, name words, departments, designations, grades, years, cues
  vocabulary.ts     loads and caches the word lists once
  router.ts         bands, scores, margin, tie-break, fall-through, trace
  collisions.ts     the register of section 5 (data)
  registry.ts       one line per domain
  <domain>/domain.ts   claim() (pure, offline) + answer() (calls the existing engine unchanged) + cues + samples + access
  README.md         how to add a domain
```

The existing engines (`hospital/engine.ts`, `pax/*`, `holidays/parser.ts`, the NL to SQL pipeline, `rosterQuery.ts`) are **wrapped, not rewritten**. They have hundreds of tests and the owner's verified rules; the umbrella changes who calls them and in what order, not what they say.
The guide's sample-question and "what to type" pages are generated from the descriptors, like the tools' pages, so the documentation cannot drift.

## 9. Migration, in steps that each ship safely

| Step | What | Behaviour change | Size |
|---|---|---|---|
| 0 | **Baseline corpus.** Collect every question we have: `nl2sql_log`, `omnibar_feedback`, sample questions, the quick-reference page, all selftest questions. Label the domain each should reach. Record where the **current** chain sends each one (the existing trace). | none | M |
| 1 | **Tagger + vocabulary + types + registry skeleton**, with selftests (identifiers, names, departments, designations, cues). Nothing calls it yet. | none | M |
| 2 | **Descriptors for every domain**: `claim()` derived from each engine's own existing detection (so it agrees by construction), `answer()` calling the engine. Router built and run in **shadow mode**: beside the old chain, it logs `agree` or `disagree` (domain, scores). | none (only a log line) | L |
| 3 | **Read the disagreements.** Each one is either a bug in the new claim, a bug in the old order, or a collision row to add. Repeat until the corpus agrees and live shadow shows no unexplained disagreement. | none | M |
| 4 | **Flip the server** to the router behind `RECORDS_ROUTER=on` (default on after the proof), `legacy` keeps the old chain for two releases. | the order becomes score based | M |
| 5 | **People facets** (section 6): A to F as separate resolvers, filling any gap found in step 3 (e.g. designation + department lists that today reach the model). | some lists become faster | M |
| 6 | **Browser**: the Enter ladder replaced by `planLine`; the four name checks removed. | none visible, less code | M |
| 7 | **Model calls from three to one**: the router model becomes the tie-break only (rule 5); the "which utility" call stays in the tools side. Measure latency before and after. | faster, fewer tokens | M |
| 8 | **Retire** the dead chain, move the docs to generated pages. | none | S |

Each step ends with the full sweep (`sweep.sh`: 264 files, 0 failed today), `tsc`, `eslint`, the corpus run, and a STATUS row. Nothing is committed without the owner's command, as always.

## 10. Test strategy ("foolproof" is made of these)

1. **Corpus test**: every labelled question must reach its domain; the run prints a confusion table (expected vs reached). Reuses `scripts/omnibar-acceptance.mjs` and `scripts/test-search.mjs`.
2. **Collision register**: every row of section 5 is an assertion.
3. **Order independence**: shuffle the registry order; the winners must not change (proves nothing depends on the position of a line in a file).
4. **One winner or a declared ask**: for every corpus line the router returns exactly one winner, or an ask with at most 3 options. Never zero, never a silent tie.
5. **Offline claim phase**: the selftest replaces `fetch` and the database with throwers while claims run; a claim that touches either fails. Latency budget: tag + claims under 5 ms for 100 lines.
6. **Access matrix**: for each domain x (signed out, signed in, executive, HOD) the expected answer or refusal.
7. **Privacy**: no identifier in any model request (the same test the router has today, extended to the new paths).
8. **No domain imports another** (selftest, like the tools).
9. **Shadow log in live use** (step 2 to 4), then the same trace stays on: a "No" on an answer records the domain that answered, so the learning loop can name the *route* that failed, not only the SQL.

## 11. Decisions I took (the owner may overrule any)

1. Name of the umbrella: **Records** (folder `src/records/`).
2. Documents (circular search) is a domain at the bottom band; EDS stays separate.
3. An explicit cue beats an entity match.
4. Ambiguity within 15 points **asks**, with at most 3 options.
5. The model's router becomes a tie-break claim, no longer the gate.
6. The existing engines are wrapped, not rewritten.
7. A 4-digit number keeps today's year-or-CUG4 rule.
8. Access rules stay exactly as they are (HOD-only dates, signed-in P.No / mobile / CUG4, audit on reveal).

## 12. What I would not do

- A big-bang rewrite. The routes carry the owner's verified rules.
- Embeddings or a trained classifier for routing at the start. They are opaque, cannot be fixed with one table row, and the deterministic claims already cover the common lines.
- Merging utilities or EDS into this. Different cost, privacy and access profile.
- Sending any identifier to a model "to help routing".

## 13. Open questions for the owner

1. Should birthdays / anniversaries (the home calendar's people events) become searchable in the bar ("birthdays today")?
2. Are there query types used in the plant that this inventory missed (an office, a training, a quarter allotment ...)? Each is one more descriptor, but the corpus should have it from step 0.
3. When two claims tie, do you prefer the **ask** (my choice) or the more common reading with a small "not this? choose another" under it? The second is quicker for the reader but can mislead.

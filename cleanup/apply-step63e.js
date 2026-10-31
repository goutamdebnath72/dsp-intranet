// cleanup/apply-step63e.js
//
// Step 63e (CUMULATIVE over 63a, 63b, 63c and 63d): "pax number", "phone number" and "contact number" are one keyword; the SUBJECT decides: a department or other non-human entity gives its PAX number,
// an executive (ticket 4xxxxx) gives his or her CUG mobile number (masked, with the Reveal button). Works from the ORIGINAL 62a files AND from a tree where 63a was already applied.
// Edits in place:
//   - src/lib/nl2sql/omnibar.ts                  : the PAX route (dependency, first place in runOmnibar, wiring); the 63a wiring is REPLACED by one call to answerPaxRoute
//   - src/lib/search/nameSearchGate.ts (+ selftest) : "pax" and "extension" are topic words
//   - STATUS.md                                  : the rows of 63a (if missing) and 63b
// The new files (src/lib/pax/*, cleanup/sql/63a_check_pax_directory.sql) come with the zip.
//
// Run from the project root:  node cleanup/apply-step63e.js
// IN PLACE and ALL-OR-NOTHING (every change is worked out in memory; if any place is not recognised NOTHING is written and the script says which),
// ORDER-PROOF and SAFE TO RUN TWICE (a change whose marker is already there is skipped; every anchor must occur EXACTLY ONCE in the file as it stood before this script).

const fs = require("fs");
const path = require("path");

const ROW_63A = "| 63a | **The PAX phone-number search (31 Oct 2026; the first feature of the new chat).** PAX = the land-line phone that works only inside DSP work areas (5 digits; the Telecom department keeps the list in `public.pax_directory`, sql/12, live: 65 rows, 54 names). A new deterministic route in `runOmnibar`, FIRST (before the hospital route, because the word \"pax\" is explicit), no model call, reading the table with the application's OWN connection (`getDb()`), never the model's read-only client (a test checks the wiring; the table is not in the `nlq` schema). New files: `src/lib/pax/matcher.ts` (the planner and the matcher, pure), `answer.ts` (the card: the number or name as the big headline, table, folded \"What is PAX?\"; reuses `HospitalAnswerCard` through `payload.hospital`, so the screen needs no change), `store.ts` (the loader; the area comes from `public.pax_area()` and its wording is normalised). WHAT IT ANSWERS: name to number (\"pax number of fire service\", \"pax c&it\", \"pax civil a zone\", spelling slips said on screen), number to name (\"who has 42046\", \"pax 420\" = prefix, several numbers), lists and counts (\"pax\", \"how many pax numbers\", \"pax numbers outside plant\", \"township pax numbers\"), faults (\"pax not working\" goes to the rows named PAX Complain; the MRS Control electrical desk only when asked for). WHEN IT TAKES A QUESTION: the word \"pax\" always; one bare 5-digit number only if it IS in the directory; a weak cue (extension, intercom, landline, telephone, phone) only on an exact full name match and never for a person, a doctor, the hospital or a fault; never a number of six or more digits or a word about circulars (notice, policy, tariff...). A bare name (\"fire service\") is NOT taken. NOT FOUND is an amber \"Not found\" (closest names as a line, never as the answer); a number on two names (42043) and an unclassified number (46298) get a red note. Feedback source is tagged `holiday`, like the hospital's. `nameSearchGate.ts`: \"pax\" and \"extension\" are topic words, so the people name search is not fired for them. PROOF (sandbox, NOT live): `pax.selftest.ts` 146 checks, `paxStore.selftest.ts` 9 checks against a real Postgres, `nameSearchGate.selftest.ts` 55; the new checks fail on the old omnibar.ts and gate; type check, lint, big suite 770, 92 other suites, `next build` OK; the install script run twice from the original files. NOT VERIFIED: sql/12 is not in the repository, so the code assumes the columns the handoff names: run `cleanup/sql/63a_check_pax_directory.sql` once and compare; the card has not been seen on a real screen with PAX content. OPEN: admin upload or form (next); Telecom to say which of the two names on 42043 is current; the owner's reading of plant / outside plant and of 46298. | owner to install and test |";
const ROW_63E = "| 63e | **Plant Control and Plant Medical are COMPLETE department names, never cut (owner, 31 Oct 2026).** Both begin with \"Plant\", so the sharing-of-first-words rule had read them as one department \"Plant\". `WHOLE_DEPARTMENTS` in `src/lib/pax/display.ts` (a short list; add a name when a department's own name begins with a word that others share): a name that begins with one of them is that department, whole, and what follows is its location: Plant Control = Plant Control | Office (the temporary word for an empty location), Plant Medical (PMU) = Plant Medical | PMU. OPEN: other departments whose own name begins with a shared word are still grouped by that word (the rule that makes CISF a department); the full list of 54 names has not been checked on screen. Cumulative over 63a to 63d. | owner to install and test |";
const ROW_63D = "| 63d | **'phone number of departments' and the Location column.** (1) 'phone number of departments', 'contact number of all departments' (any alias with the word department or departments and no other subject) give the same directory list as 'pax number of departments' (the owner's screen, 31 Oct 2026: it was not understood); a bare 'phone' or 'contact number' still claims nothing. (2) **The Location column shows 'Office' when a name has no location (owner, 31 Oct 2026; TEMPORARY).** Only the screen is affected, nothing is stored or matched: `EMPTY_LOCATION` in `src/lib/pax/answer.ts` (one word to change or remove when Telecom's list says better); a location that exists is never replaced. Cumulative over 63a, 63b and 63c (works from any of those states). | owner to install and test |";
const ROW_63C = "| 63c | **The PAX table: Department | Location | PAX, the first column A to Z, nothing about plant or outside plant (owner's screen, 31 Oct 2026).** The PAX number is the THIRD column. The first two come from the printed name by ONE rule (`src/lib/pax/display.ts`, pure, the database is not touched): names that start with the same words share a department and the rest is the location (CISF Admin Gate, CISF Main Gate (IN), CISF Pass section(Opp Admin. Bldg.), CISF (PCR) = CISF | Admin Gate, Main Gate (IN), Pass section(Opp Admin. Bldg.), PCR; Network Team (C & IT) and (CMMS) = Network Team | C & IT, CMMS); a name that stands alone is cut at its bracket (Plant Medical (PMU) = Plant Medical | PMU; Fire Service = Fire Service | empty). The sharing of first words is read from the WHOLE directory, not from the rows shown. The Area column, the area words in the sentences, the area breakdown lines and the red note for an unclassified number are GONE; the area FILTERS stay ('pax numbers outside plant' still narrows the list). The red note for a number on two names stays. The headline numbers follow the order of the table. A name that stands alone but uses the SAME NUMBER as a department's name belongs to that department, its whole printed name being the location (CISF Tumla Gate and Weigh Bridge - Tumla Gate share 42043 = CISF | Tumla Gate and CISF | Weigh Bridge - Tumla Gate; the red note says it the same way). A department (one place) with more than one number is ONE row, 'first / second' (40926 / 42043), also in the headline and the sentence. Cumulative over 63a and 63b. NOT VERIFIED: the real split of all 54 names on screen (only the labels seen in the owner's screenshot and the handoff were tested). | owner to install and test |";
const ROW_63B = "| 63b | **PAX number, phone number and contact number are ONE keyword; the SUBJECT decides what number is meant (owner, 31 Oct 2026).** A department, a place or any other non-human subject gives its PAX number (as in 63a); a PERSON who is an executive (ticket 4xxxxx, by name or by ticket: \"contact number of sanjay roy\", \"phone number of 498301\", \"pax of ...\") gives his or her CUG mobile number. The CUG number stays MASKED (943479xxxx) as the big headline, with the existing person card and Reveal button (login check, audit row); the e-mail button is left off the card because it was not asked for. ORDER OF THE SUBJECT (`src/lib/pax/route.ts`): 1) a directory entry that matches in full, 2) an executive whose stored name holds EVERY typed word as a whole word (the directory's fuzzy name search is never trusted to decide that a question is about a person), 3) a directory entry with a spelling slip (the correction said), 4) not ours (with the word pax an honest Not found). A NON-EXECUTIVE person is NOT answered (no rule was given): the question goes on to the other routes unchanged. Words of the aliases: pax (always ours), phone, telephone, contact, extension, extn, intercom, landline (ours only when the subject is found; never for a doctor, the hospital, a mobile number, a fault or a circular). `mobile` and `cug` are not aliases (still the model's path). New files: `people.ts` (the person half, pure), `route.ts` (the orchestration and the database wiring: the application's own `getDb()` connection, never the model's read-only client). `omnibar.ts`: the 63a wiring is REPLACED by one call to `answerPaxRoute`. This patch is CUMULATIVE over 63a (its install script works from the original 62a files or from a tree where 63a was applied). PROOF (sandbox, NOT live): see the step's tests `pax.selftest.ts`, `contact.selftest.ts`, `paxStore.selftest.ts`. NOT VERIFIED: the real name and ticket searches (they need the live phonetic functions of the database), the card on a real screen. OPEN: what a non-executive's \"contact number\" should answer; whether `mobile` and `cug` should join the aliases. | owner to install and test |";
const PAX_DEP = "  /** A question about the PAX directory (step 63a): the land-line numbers of the departments and places, read from public.pax_directory with the application's OWN connection (never the model's read-only client, never the nlq schema); null when the question is not a PAX question. Optional, so older callers need nothing. */\n  pax?: (q: string) => Promise<AnalyticsPayload | null>;\n";
const PAX_ROUTE = "    // 0-. a question about the PAX directory (step 63a): \"pax number of fire service\", \"who has 42046\", \"pax numbers outside plant\", \"pax not working\": answered from Telecom's list, no model call.\n    //     It comes BEFORE the hospital route because the word \"pax\" is explicit (\"pax number of hospital opd\" is a PAX question, not an OPD one); it takes nothing without a clear PAX signal (src/lib/pax/matcher.ts).\n    //     Tagged \"holiday\" for the feedback record, like the hospital's: the feedback table's list of sources has no PAX entry.\n    const pax = deps.pax ? await deps.pax(q).catch(() => null) : null;\n    if (pax) return { ...pax, source: \"holiday\", attempt };\n\n";
const WIRING_63A = "    pax: async (qq) => {\n      // the application's OWN connection (getDb), never withDefaultClient: that one is the model's read-only role when NL2SQL_DATABASE_URL is set, and the PAX table is closed to it on purpose\n      const { answerPax } = await import(\"@/lib/pax/answer\");\n      const { loadPaxRows } = await import(\"@/lib/pax/store\");\n      const { getDb } = await import(\"@/lib/db\");\n      const r = await answerPax(qq, () => loadPaxRows(async (sql, params) => (await getDb()).query(sql, params)));\n      if (!r) return null;\n      return { kind: \"count\", answer: r.summary, hospital: r.card, interpretation: r.interpretation };\n    },\n";
const NEW_WIRING = "    pax: async (qq) => {\n      // the PAX directory (a department's number) or an executive's CUG number, decided by the subject (step 63b, src/lib/pax/route.ts: it reads with the application's OWN connection, never the model's)\n      const { answerPaxRoute } = await import(\"@/lib/pax/route\");\n      return answerPaxRoute(qq);\n    },\n";
const ORIGINAL_HOSPITAL_WIRING = '    hospital: async (qq) => {\n      const { answerHospital } = await import("@/lib/hospital/engine");';

// Each change: a marker (already there = skipped) and VARIANTS: the first variant whose anchor occurs exactly once is used (an upgrade from the 63a text comes before a fresh insert).
const CHANGES = [
  { file: "src/lib/nl2sql/omnibar.ts", marker: "pax?: (q: string) => Promise<AnalyticsPayload | null>;",
    variants: [{ anchor: "  hospital?: (q: string) => Promise<AnalyticsPayload | null>;\n", make: (a) => a + PAX_DEP }] },
  { file: "src/lib/nl2sql/omnibar.ts", marker: "const pax = deps.pax ? await deps.pax(q)",
    variants: [{ anchor: "    // 0. a question about the hospital OPD: answered from the hospital data, no model call (step 51a).", make: (a) => PAX_ROUTE + a }] },
  { file: "src/lib/nl2sql/omnibar.ts", marker: "answerPaxRoute",
    variants: [
      { anchor: WIRING_63A, make: () => NEW_WIRING },                                   // 63a was applied: replaced
      { anchor: ORIGINAL_HOSPITAL_WIRING, make: (a) => NEW_WIRING + a },                // original files: inserted
    ] },
  { file: "src/lib/search/nameSearchGate.ts", marker: '"checkup", "health", "pax", "extension",',
    variants: [{ anchor: '"checkup", "health",\n]);', make: () => '"checkup", "health", "pax", "extension",\n]);' }] },
  { file: "src/lib/search/nameSearchGate.selftest.ts", marker: "PAX: a question about the directory of land-line numbers",
    variants: [{ anchor: 'ok("a question mark is never a name", looksLikeNameSearch("sanjay debnath?") === false);',
      make: (a) =>
        'ok("PAX: a question about the directory of land-line numbers is a topic, not a name (\\"pax fire service\\", \\"civil pax\\", \\"extension of c&it\\")", ["pax fire service", "civil pax", "extension of c&it", "pax 42046"].every((q) => looksLikeNameSearch(q) === false));\n' +
        'ok("...and a bare department word stays searchable as a name (\\"fire service\\", \\"civil\\"): the PAX route does not take it", looksLikeNameSearch("fire service") === true && looksLikeNameSearch("civil") === true);\n' + a }] },
  { file: "STATUS.md", marker: "| 63e | **Plant Control and Plant Medical are COMPLETE",
    variants: [
      { anchor: "| 63d | **'phone number of departments' and the Location column.", make: (a) => ROW_63E + "\n" + a },                                                                   // 63d row exists
      { anchor: "| 63c | **The PAX table: Department | Location | PAX", make: (a) => ROW_63E + "\n" + ROW_63D + "\n" + a },                                                              // 63c row only
      { anchor: "| 63b | **PAX number, phone number and contact number are ONE keyword", make: (a) => ROW_63E + "\n" + ROW_63D + "\n" + ROW_63C + "\n" + a },                       // 63b row only
      { anchor: "| 63a | **The PAX phone-number search", make: (a) => ROW_63E + "\n" + ROW_63D + "\n" + ROW_63C + "\n" + ROW_63B + "\n" + a },                                      // 63a row only
      { anchor: "| 62a | **The search bar stopped opening after the first closing", make: (a) => ROW_63E + "\n" + ROW_63D + "\n" + ROW_63C + "\n" + ROW_63B + "\n" + ROW_63A + "\n" + a }, // none
    ] },
];

function main() {
  const root = process.cwd();
  if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(path.join(root, "src", "lib", "nl2sql", "omnibar.ts"))) {
    console.error("Run this from the project root (the folder that holds package.json).");
    process.exit(1);
  }
  const text = new Map();
  const report = [];
  const problems = [];
  for (const ch of CHANGES) {
    const full = path.join(root, ch.file);
    if (!fs.existsSync(full)) { problems.push(`${ch.file}: the file is missing`); continue; }
    if (!text.has(ch.file)) text.set(ch.file, { original: fs.readFileSync(full, "utf8") });
    const entry = text.get(ch.file);
    const before = entry.original; // anchors are looked up in the file AS IT STOOD, never in an earlier edit of this script
    const label = `${ch.file}   (${ch.marker.slice(0, 46)}...)`;
    if (before.includes(ch.marker)) { report.push(`already there   ${label}`); continue; }
    const v = ch.variants.find((x) => before.split(x.anchor).length - 1 === 1);
    if (!v) { problems.push(`${ch.file}: the place for "${ch.marker.slice(0, 46)}..." was not found exactly once: this file is not the one the patch was made for`); continue; }
    entry.edits = (entry.edits || []).concat([v]);
    report.push(`will change    ${label}`);
  }
  if (problems.length) { console.error("NOTHING WAS WRITTEN. Problems:\n  " + problems.join("\n  ")); process.exit(1); }
  let written = 0;
  for (const [file, entry] of text) {
    if (!entry.edits) continue;
    let out = entry.original;
    for (const v of entry.edits) out = out.replace(v.anchor, () => v.make(v.anchor));
    fs.writeFileSync(path.join(root, file), out);
    written++;
  }
  console.log(report.join("\n"));
  console.log(written ? `\nDone: ${written} file(s) changed.` : "\nNothing to do: step 63e is already applied.");
}
main();

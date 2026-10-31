// cleanup/apply-step63a.js
//
// Step 63a: the PAX phone-number search. Edits THREE existing files in place; the new files (src/lib/pax/*, the selftest, the check SQL) come with the zip.
//   - src/lib/nl2sql/omnibar.ts          : the PAX route (first in runOmnibar, before the hospital route), its optional dependency, and its wiring to the application's own connection
//   - src/lib/search/nameSearchGate.ts   : "pax" and "extension" are topic words, so "pax fire service" does not also fire the people name search
//   - src/lib/search/nameSearchGate.selftest.ts : two checks for that
//   - STATUS.md                          : the step's row
//
// Run from the project root:  node cleanup/apply-step63a.js
// IN PLACE and ALL-OR-NOTHING: every change is worked out in memory first; if any place is not recognised, NOTHING is written and the script says which.
// ORDER-PROOF and SAFE TO RUN TWICE: a change whose marker is already there is skipped. Every anchor must occur EXACTLY ONCE in the file as it stands.

const fs = require("fs");
const path = require("path");

const STATUS_MARKER = "| 63a | **The PAX phone-number search";
const STATUS_ROW = "| 63a | **The PAX phone-number search (31 Oct 2026; the first feature of the new chat).** PAX = the land-line phone that works only inside DSP work areas (5 digits; the Telecom department keeps the list in `public.pax_directory`, sql/12, live: 65 rows, 54 names). A new deterministic route in `runOmnibar`, FIRST (before the hospital route, because the word \"pax\" is explicit), no model call, reading the table with the application's OWN connection (`getDb()`), never the model's read-only client (a test checks the wiring; the table is not in the `nlq` schema). New files: `src/lib/pax/matcher.ts` (the planner and the matcher, pure), `answer.ts` (the card: the number or name as the big headline, table, folded \"What is PAX?\"; reuses `HospitalAnswerCard` through `payload.hospital`, so the screen needs no change), `store.ts` (the loader; the area comes from `public.pax_area()` and its wording is normalised). WHAT IT ANSWERS: name to number (\"pax number of fire service\", \"pax c&it\", \"pax civil a zone\", spelling slips said on screen), number to name (\"who has 42046\", \"pax 420\" = prefix, several numbers), lists and counts (\"pax\", \"how many pax numbers\", \"pax numbers outside plant\", \"township pax numbers\"), faults (\"pax not working\" goes to the rows named PAX Complain; the MRS Control electrical desk only when asked for). WHEN IT TAKES A QUESTION: the word \"pax\" always; one bare 5-digit number only if it IS in the directory; a weak cue (extension, intercom, landline, telephone, phone) only on an exact full name match and never for a person, a doctor, the hospital or a fault; never a number of six or more digits or a word about circulars (notice, policy, tariff...). A bare name (\"fire service\") is NOT taken. NOT FOUND is an amber \"Not found\" (closest names as a line, never as the answer); a number on two names (42043) and an unclassified number (46298) get a red note. Feedback source is tagged `holiday`, like the hospital's. `nameSearchGate.ts`: \"pax\" and \"extension\" are topic words, so the people name search is not fired for them. PROOF (sandbox, NOT live): `pax.selftest.ts` 146 checks, `paxStore.selftest.ts` 9 checks against a real Postgres, `nameSearchGate.selftest.ts` 55; the new checks fail on the old omnibar.ts and gate; type check, lint, big suite 770, 92 other suites, `next build` OK; the install script run twice from the original files. NOT VERIFIED: sql/12 is not in the repository, so the code assumes the columns the handoff names: run `cleanup/sql/63a_check_pax_directory.sql` once and compare; the card has not been seen on a real screen with PAX content. OPEN: admin upload or form (next); Telecom to say which of the two names on 42043 is current; the owner's reading of plant / outside plant and of 46298. | owner to install and test |";

const PAX_DEP = `  /** A question about the PAX directory (step 63a): the land-line numbers of the departments and places, read from public.pax_directory with the application's OWN connection (never the model's read-only client, never the nlq schema); null when the question is not a PAX question. Optional, so older callers need nothing. */
  pax?: (q: string) => Promise<AnalyticsPayload | null>;
`;

const PAX_ROUTE = `    // 0-. a question about the PAX directory (step 63a): "pax number of fire service", "who has 42046", "pax numbers outside plant", "pax not working": answered from Telecom's list, no model call.
    //     It comes BEFORE the hospital route because the word "pax" is explicit ("pax number of hospital opd" is a PAX question, not an OPD one); it takes nothing without a clear PAX signal (src/lib/pax/matcher.ts).
    //     Tagged "holiday" for the feedback record, like the hospital's: the feedback table's list of sources has no PAX entry.
    const pax = deps.pax ? await deps.pax(q).catch(() => null) : null;
    if (pax) return { ...pax, source: "holiday", attempt };

`;

const PAX_WIRING = `    pax: async (qq) => {
      // the application's OWN connection (getDb), never withDefaultClient: that one is the model's read-only role when NL2SQL_DATABASE_URL is set, and the PAX table is closed to it on purpose
      const { answerPax } = await import("@/lib/pax/answer");
      const { loadPaxRows } = await import("@/lib/pax/store");
      const { getDb } = await import("@/lib/db");
      const r = await answerPax(qq, () => loadPaxRows(async (sql, params) => (await getDb()).query(sql, params)));
      if (!r) return null;
      return { kind: "count", answer: r.summary, hospital: r.card, interpretation: r.interpretation };
    },
`;

const CHANGES = [
  {
    file: "src/lib/nl2sql/omnibar.ts",
    marker: "pax?: (q: string) => Promise<AnalyticsPayload | null>;",
    anchor: "  hospital?: (q: string) => Promise<AnalyticsPayload | null>;\n",
    make: (a) => a + PAX_DEP,
  },
  {
    file: "src/lib/nl2sql/omnibar.ts",
    marker: "const pax = deps.pax ? await deps.pax(q)",
    anchor: "    // 0. a question about the hospital OPD: answered from the hospital data, no model call (step 51a).",
    make: (a) => PAX_ROUTE + a,
  },
  {
    file: "src/lib/nl2sql/omnibar.ts",
    marker: "const { answerPax } = await import(",
    anchor: '    hospital: async (qq) => {\n      const { answerHospital } = await import("@/lib/hospital/engine");',
    make: (a) => PAX_WIRING + a,
  },
  {
    file: "src/lib/search/nameSearchGate.ts",
    marker: '"checkup", "health", "pax", "extension",',
    anchor: '"checkup", "health",\n]);',
    make: () => '"checkup", "health", "pax", "extension",\n]);',
  },
  {
    file: "src/lib/search/nameSearchGate.selftest.ts",
    marker: "PAX: a question about the directory of land-line numbers",
    anchor: 'ok("a question mark is never a name", looksLikeNameSearch("sanjay debnath?") === false);',
    make: (a) =>
      'ok("PAX: a question about the directory of land-line numbers is a topic, not a name (\\"pax fire service\\", \\"civil pax\\", \\"extension of c&it\\")", ["pax fire service", "civil pax", "extension of c&it", "pax 42046"].every((q) => looksLikeNameSearch(q) === false));\n' +
      'ok("...and a bare department word stays searchable as a name (\\"fire service\\", \\"civil\\"): the PAX route does not take it", looksLikeNameSearch("fire service") === true && looksLikeNameSearch("civil") === true);\n' +
      a,
  },
];
if (STATUS_ROW) {
  CHANGES.push({
    file: "STATUS.md",
    marker: STATUS_MARKER,
    anchor: "| 62a | **The search bar stopped opening after the first closing",
    make: (a) => STATUS_ROW + "\n" + a,
  });
}

function main() {
  const root = process.cwd();
  if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(path.join(root, "src", "lib", "nl2sql", "omnibar.ts"))) {
    console.error("Run this from the project root (the folder that holds package.json).");
    process.exit(1);
  }
  const text = new Map(); // file -> current text (worked out in memory)
  const report = [];
  const problems = [];
  for (const ch of CHANGES) {
    const full = path.join(root, ch.file);
    if (!fs.existsSync(full)) { problems.push(`${ch.file}: the file is missing`); continue; }
    if (!text.has(ch.file)) text.set(ch.file, fs.readFileSync(full, "utf8"));
    const cur = text.get(ch.file);
    if (cur.includes(ch.marker)) { report.push(`already there   ${ch.file}   (${ch.marker.slice(0, 48)}...)`); continue; }
    const n = cur.split(ch.anchor).length - 1;
    if (n !== 1) { problems.push(`${ch.file}: the place for "${ch.marker.slice(0, 48)}..." was found ${n} times (it must be exactly once): this file is not the one the patch was made for`); continue; }
    text.set(ch.file, cur.replace(ch.anchor, () => ch.make(ch.anchor)));
    report.push(`will change    ${ch.file}   (${ch.marker.slice(0, 48)}...)`);
  }
  if (problems.length) {
    console.error("NOTHING WAS WRITTEN. Problems:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  let written = 0;
  for (const [file, content] of text) {
    const full = path.join(root, file);
    if (fs.readFileSync(full, "utf8") !== content) { fs.writeFileSync(full, content); written++; }
  }
  console.log(report.join("\n"));
  console.log(written ? `\nDone: ${written} file(s) changed.` : "\nNothing to do: step 63a is already applied.");
}
main();

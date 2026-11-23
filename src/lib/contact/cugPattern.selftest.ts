// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/contact/cugPattern.selftest.ts </dev/null
// I read questions about the first digits of executives' CUG numbers by rules; they are answered only for a signed-in executive, prefix only, with masked people and a limit per hour.
import { readFileSync } from "node:fs";
import { MAX_DIGITS, MAX_SHOWN, PER_HOUR, REFUSALS, answerCugPattern, readCugPattern, resetCugCounter, type CugDeps, type CugSearchResult } from "./cugPattern";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const prefix = (q: string) => { const r = readCugPattern(q); return r && r.kind === "prefix" ? `${r.query.negate ? "!" : ""}${r.query.digits}` : r ? `refused:${r.why}` : "none"; };

// ---- the sentence ----
ok("the owner's sentence, typo and all ('does not starts with')", prefix("find the executives whose CUG mobile number does not starts with 943479.") === "!943479");
const positives: Array<[string, string]> = [
  ["executives whose CUG number starts with 943479", "943479"],
  ["list executives with cug mobile number beginning with 94347", "94347"],
  ["which executives have a CUG number that starts with 9434", "9434"],
  ["executives whose cug mobile does not start with 943479", "!943479"],
  ["executives whose mobile number doesn't start with 943479", "!943479"],
  ["executives with CUG numbers not beginning with 943479", "!943479"],
  ["show cug numbers other than 943479 series", "!943479"],
  ["executives whose phone number is not in the 943479 series", "!943479"],
  ["CUG numbers except those starting with 943479", "!943479"],
  ["executives whose CUG mobile number never starts with 94", "!94"],
  ["who has cug number prefix 943477", "943477"],
];
for (const [q, want] of positives) ok(`read: ${q}`, prefix(q) === want, `${prefix(q)} != ${want}`);
ok("negation is read from the words BEFORE the digits only ('starts with 943479, not 94')", prefix("executives whose cug number starts with 943479") === "943479");
ok("a pattern of more than 6 digits is refused as too long, not read", prefix("executives whose CUG number starts with 9434791234") === "refused:long");
ok("'ends with' and 'last 4 digits' are refused with their own reason", prefix("executives whose CUG mobile number ends with 1234") === "refused:ends" && prefix("executives whose cug number last 4 digits are 4455") === "refused:ends");
ok("'contains' is refused with its own reason", prefix("executives whose CUG number contains 777") === "refused:contains");
ok("a prefix together with a suffix is refused (the two would rebuild a number)", prefix("executives whose cug number starts with 943479 and ends with 1234").startsWith("refused"));
const notOurs = [
  "contact number of ramesh kumar", "cug number of 412345", "pax number of fire service", "who has 42046", "employees whose ticket number starts with 40",
  "executives whose SAIL P.No. starts with 12", "leave rules starts with", "what is the CUG mobile number of the GM", "executives in C&IT", "find the executives whose name starts with R",
  "mobile number", "943479", "phone numbers of the hospital", "holidays starting with 2026",
];
for (const q of notOurs) ok(`not ours: ${q}`, prefix(q) === "none", prefix(q));
ok("an empty or an enormous line is not ours", readCugPattern("") === null && readCugPattern("x".repeat(400)) === null);

// ---- the answer ----
const person = (t: string) => ({ ticketNo: t, name: `P ${t}`, hasEmail: true, emailMasked: "a***@x" }) as never;
let calls = 0;
const mk = (r: Partial<CugSearchResult> = {}): CugDeps => ({
  now: () => 1_000_000,
  search: async () => { calls++; return { withNumber: 1145, matching: 2, withoutNumber: 21, people: [person("400001"), person("400002")], ...r }; },
});
(async () => {
  const Q = "find the executives whose CUG mobile number does not starts with 943479.";
  resetCugCounter(); calls = 0;
  const anon = await answerCugPattern(Q, null, mk());
  ok("nobody signed in: one sentence, and the database is not asked", anon?.answer === REFUSALS.signIn && calls === 0);
  const staff = await answerCugPattern(Q, "512345", mk());
  ok("a signed-in person who is not an executive (ticket not 4xxxxx) is refused the same way, nothing read", staff?.answer === REFUSALS.signIn && calls === 0);
  const ends = await answerCugPattern("executives whose cug number ends with 1234", "400111", mk());
  ok("an executive asking for the END of a number is told why not, nothing read", ends?.answer === REFUSALS.ends && /Reveal/.test(REFUSALS.ends) && calls === 0);
  const nopeA = await answerCugPattern("contact number of ramesh kumar", "400111", mk());
  ok("a line that is not about the digits is left to the other routes (null)", nopeA === null && calls === 0);

  const a: any = await answerCugPattern(Q, "400111", mk());
  ok("an executive gets the list: the count, the people, the numbers masked on the cards (no e-mail carried)", a?.kind === "count" && a.count === 2 && a.people.length === 2 && a.people.every((p: any) => p.hasEmail === false && p.emailMasked === null) && calls === 1);
  ok("the sentence says how many of how many, the rule, the 21 with no number, and that the numbers are masked", /2 of the 1,145 executives with a CUG number: the number does not start with 943479/.test(a.answer) && /21 executives have no CUG number on record and are not counted/.test(a.answer) && /masked/.test(a.answer) && /Reveal/.test(a.answer), a.answer);
  ok("the interpretation names the rule in words, for the 'Understood as' line", /does not start with 943479/.test(a.interpretation));
  const none: any = await answerCugPattern("executives whose cug number starts with 111111", "400111", mk({ matching: 0, people: [] }));
  ok("no match: said plainly, not an empty list", /No executive matches/.test(none.answer) && none.headline.text === "None");
  const many: any = await answerCugPattern("executives whose cug number starts with 94", "400111", mk({ matching: 1143, people: Array.from({ length: MAX_SHOWN }, (_, i) => person(String(400000 + i))) }));
  ok("a long list says it is cut, and shows the first hundred", many.listTruncated === true && /first 100 are shown/.test(many.answer) && many.people.length === MAX_SHOWN);
  const one: any = await answerCugPattern(Q, "400111", mk({ withoutNumber: 1, matching: 1, people: [person("400001")] }));
  ok("singular and plural are right ('1 executive has no CUG number ... is not counted')", /1 executive has no CUG number on record and is not counted/.test(one.answer) && one.headline.text === "1 executive");

  // the hourly allowance of one ticket
  resetCugCounter(); calls = 0;
  let last: any = null;
  for (let i = 0; i < PER_HOUR + 1; i++) last = await answerCugPattern(Q, "400222", mk());
  ok(`the ${PER_HOUR + 1}th question in an hour is refused and does not read the database`, last?.answer === REFUSALS.tooMany && calls === PER_HOUR);
  const other: any = await answerCugPattern(Q, "400333", mk());
  ok("the allowance is per ticket", other?.kind === "count");

  // the wiring: the engine's step, the scope, and nothing in the model's views
  const omni = readFileSync("src/lib/nl2sql/omnibar.ts", "utf8");
  const scope = readFileSync("src/records/scope.ts", "utf8");
  ok("the step runs early in the engine, before the PAX and the model, for Everything and People only", /const cugPattern = may\("cugPattern"\) && deps\.cugPattern \? await deps\.cugPattern\(q, userKey\)/.test(omni) && omni.indexOf('may("cugPattern")') < omni.indexOf('may("pax")') && /auto: new Set<Step>\(\[[^\]]*"cugPattern"/.test(scope) && /people: new Set<Step>\(\[[^\]]*"cugPattern"/.test(scope) && !/(?:pax|hospital|holidays|degrees|documents|eds|admin): new Set<Step>\(\[[^\]]*"cugPattern"/.test(scope));
  ok("the digits are read by the application's own connection (getDb) and tested in code; the model's views are untouched (still booleans only)", /await import\("@\/lib\/db"\)/.test(omni.slice(omni.indexOf("cugPattern: async"), omni.indexOf("cugPattern: async") + 400)) && /has_mobile/.test(readFileSync("src/lib/nl2sql/sql/01_nlq_schema_views_role.sql", "utf8")) && !/startsWith|d LIKE/.test(readFileSync("src/lib/nl2sql/prompt.ts", "utf8")));
  ok("the digits limit and the allowance are the stated ones (6 digits, 30 an hour)", MAX_DIGITS === 6 && PER_HOUR === 30);

  console.log(`cugPattern selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

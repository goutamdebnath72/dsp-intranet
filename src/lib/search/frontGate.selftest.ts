// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/search/frontGate.selftest.ts
// No database, no network. The directory's name words are a STAND-IN list here (the real list is every name word of
// nlq.employees); what is tested is the gate's logic, and the zero-false-skip rule on your own acceptance questions.

import { readFileSync } from "node:fs";
import { decideModelSkip, frontGateEnabled, loadDirectoryNameWords, resetDirectoryWordsCache } from "./frontGate";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

// ---- the stand-in directory: the kind of words an Indian steel-plant directory holds, incl. the names in the questions
const DIRECTORY = new Set(
  ("mohd mohammad anwar ullah rana saha sunil amit sen das kumar roy ray rao rai bhattacharya bhattacharjee homroy koyeli bhupinder singh popli " +
    "sanjay debnath goutam soumit biswajit bhattacharjee prasenjit khan mazumdar majumdar mazumder ashish agrawal samapti prasad ghosh banerjee " +
    "chowdhury dey dutta mukherjee chatterjee sharma gupta yadav mondal biswas pal bose basu dome mohanty bagdi choudhury shibani kundu biplab " +
    "mukesh dipanjan lokanath shankar nitai surender zakir hossain subhasish goswami shibasis tapas amar sankar sinha mishra pandey verma").split(" "),
);
const base = { isNameShaped: false, deptMentioned: false, directoryWords: DIRECTORY };
const skips = (q: string, extra: Partial<typeof base> = {}) => decideModelSkip({ q, ...base, ...extra }).skip;

// ---- the switch
ok("off by default", !frontGateEnabled({}));
ok("off for 'false'", !frontGateEnabled({ FRONT_PATH_SKIP_MODEL: "false" }));
ok("off for '1' (only the word true turns it on)", !frontGateEnabled({ FRONT_PATH_SKIP_MODEL: "1" }));
ok("on for 'true'", frontGateEnabled({ FRONT_PATH_SKIP_MODEL: "true" }));
ok("on for ' TRUE '", frontGateEnabled({ FRONT_PATH_SKIP_MODEL: " TRUE " }));

// ---- the rules, one by one
ok("a plain document question skips the model", skips("what is the leave policy for contract workers"));
ok("an unknown directory never skips", !decideModelSkip({ q: "leave policy", ...base, directoryWords: new Set() }).skip);
ok("a name-shaped question never skips", !skips("goutam debnath", { isNameShaped: true }));
ok("a department mention never skips", !skips("c&it attendance", { deptMentioned: true }));
ok("a people-data word never skips", !skips("how many executives got promoted"));
ok("a ticket number never skips", !skips("circular for ticket 228757") && !skips("what is 98500") && !skips("employee P12345"));
ok("a year is not a ticket", skips("football team selection trial 2024"));
ok("a 4-digit number that is not a year blocks", !skips("gate 4521 closure"));
ok("a surname inside a sentence blocks", !skips("list all mazumdars") && !skips("circular signed by Bhattacharya"));
ok("a plural surname blocks", !skips("every roys in the plant") && !skips("rays"));
ok("a non-Latin question is not judged", !skips("छुट्टियों की सूची 2026") && !skips("দুর্গাপূজার ছুটি ২০২৬"));
ok("an empty question never skips", !skips("   "));
ok("the reason is always given", decideModelSkip({ q: "leave policy", ...base }).reason.length > 5 && decideModelSkip({ q: "mazumdars", ...base }).reason.includes("directory"));

// ---- the acceptance set: ZERO false skips, and how many document questions it saves
type Rec = { id: string; query: string; expectedRoute?: string | string[]; source?: string };
const set: Rec[] = JSON.parse(readFileSync("eval/router-acceptance.json", "utf8")).records;
const routes = (r: Rec) => ([] as string[]).concat(r.expectedRoute ?? []);
const needsModel = set.filter((r) => routes(r).some((x) => x === "EMP-SQL" || x === "HEALTH-SQL") && !routes(r).includes("HOLIDAY"));
const documents = set.filter((r) => routes(r).length > 0 && routes(r).every((x) => x === "CIRCULAR" || x === "POLICY") && r.source !== "G");
const falseSkips = needsModel.filter((r) => skips(r.query));
ok(`no employee / health check-up question in the set is skipped (${needsModel.length} checked)`, falseSkips.length === 0, falseSkips.map((r) => `${r.id}: ${r.query}`).join(" | "));
const saved = documents.filter((r) => skips(r.query));
ok(`the gate saves a real share of the document questions (${saved.length} of ${documents.length})`, saved.length / documents.length >= 0.4, `only ${saved.length}`);

// ---- employee-style questions that are NOT in the set (the generalisation test)
const UNSEEN = [
  "list all mazumdars", "find employees named sunil", "how many people in blast furnace", "show me roy in c&it", "senior most general manager",
  "names ending with kumar", "who is the head of c&it", "employees with mobile number but no email", "count of managers in each department",
  "who works in the plant garage", "list non executives in grade s-9", "is rana saha junior to amit sen", "sanjay debnath designation",
  "executives whose name starts with soumit", "how many deputy managers are there", "give me the list of AGMs", "when is the medical checkup of prasenjit khan",
  "who has medical check up tomorrow", "whose ticket is 228757", "department of ticket 328963", "officers in finance", "show all staff of personnel department",
  "how many women executives", "employees retiring this year", "tell me about goutam debnath", "contact of the HOD of C&IT", "people with surname rao",
  "who are the juniors of mohd anwar ullah", "headcount of electrical", "which section has most employees",
  "sinha", "ashish agrawal grade", "how many biswas are there", "pandey and mishra in accounts", "popli",
];
const unseenFalse = UNSEEN.filter((q) => skips(q, { deptMentioned: /c&it|plant garage|blast furnace|personnel|electrical|finance|accounts/i.test(q) }));
ok(`no unseen employee-style question is skipped (${UNSEEN.length} checked)`, unseenFalse.length === 0, unseenFalse.join(" | "));

// ---- document questions with NO people signal that a person might type, unseen
const UNSEEN_DOCS = [
  "last date for mediclaim renewal", "pf withdrawal rules", "canteen timings circular", "puja advance scheme", "quarter allotment guidelines",
  "ltc rules for contract workers", "safety shoes distribution notice", "tender for scrap disposal", "bonus payment date", "sports day programme",
];
const unseenSaved = UNSEEN_DOCS.filter((q) => skips(q));
ok(`most unseen plain document questions skip the model (${unseenSaved.length} of ${UNSEEN_DOCS.length})`, unseenSaved.length >= 8, UNSEEN_DOCS.filter((q) => !skips(q)).join(" | "));

// ---- the directory word list: cached, fails safe
(async () => {
  resetDirectoryWordsCache();
  let calls = 0;
  const run = async () => { calls++; return [{ w: "roy" }, { w: "das" }, { w: "ab" }, { w: "kumar" }]; };
  const w1 = await loadDirectoryNameWords(run, 1_000);
  const w2 = await loadDirectoryNameWords(run, 2_000);
  ok("words load once and are cached", calls === 1 && w1 === w2);
  ok("two-letter fragments are dropped", !w1.has("ab") && w1.has("roy"));
  await loadDirectoryNameWords(run, 1_000 + 11 * 60 * 1000);
  ok("the cache expires after ten minutes", calls === 2);
  resetDirectoryWordsCache();
  let threw = false;
  try { await loadDirectoryNameWords(async () => [], 5); } catch { threw = true; }
  ok("an empty directory throws (the caller then does not skip)", threw);
  resetDirectoryWordsCache();
  threw = false;
  try { await loadDirectoryNameWords(async () => { throw new Error("relation does not exist"); }, 5); } catch { threw = true; }
  ok("a failed query throws (the caller then does not skip)", threw);

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`(information: the gate would skip the model for ${saved.length} of ${documents.length} document questions in the acceptance set)`);
  process.exit(fail ? 1 : 0);
})();

// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/search/weakMatch.selftest.ts
// Step 61a: a document that shares nothing with the question does not wear a confident percentage (ledger item 57).

import { readFileSync } from "node:fs";
import { contentStems, isWeakMatch, markWeakMatches, WEAK_NOTE } from "./weakMatch";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const r = (headline: string, sim: number | null, extra: Record<string, unknown> = {}) => ({ headline, similarity: sim, chunkText: "", ...extra });

// ---- the owner's own case, 26 Oct 2026
const Q1 = "list the employees of the centre for human resource development";
const health = r("Circular-Health check-up for non-executive employees during the month of December 2024", 0.87, { matchPercentage: 87, chunkText: "Name of the employee ticket no department date of check-up 02.12.2024 ..." });
ok("the content words of the owner's question: centre, human, resource, development (not 'list', 'employees', 'the', 'of', 'for')", JSON.stringify(contentStems(Q1)) === JSON.stringify(["centr", "human", "resou", "devel"]), JSON.stringify(contentStems(Q1)));
ok("the health check-up circular at 87% is WEAK for it (it shares no content word)", isWeakMatch(Q1, health) === true);
{
  const out = markWeakMatches(Q1, [health]) as any[];
  ok("...it keeps its place and its title but loses its percentage and is marked", out.length === 1 && out[0].headline === health.headline && out[0].similarity === null && out[0].matchPercentage === undefined && out[0].weakMatch === true, JSON.stringify(out));
}

// ---- a document that DOES answer is never touched
ok("'mediclaim renewal last date' / 'Extension of SAIL Mediclaim policy (2026-2027)' at 88%: not weak", isWeakMatch("what is the last date to renew SAIL Mediclaim", r("Extension of SAIL Mediclaim policy (2026-2027)", 0.88)) === false);
ok("'contractor wages 2024' finds 'Revision of wages of contract workers' (the stem 'contr')", isWeakMatch("what daily wage rates are notified for contractor workers for 2024", r("Revision of wages of contract workers", 0.8)) === false);
ok("a word in the best PASSAGE counts, not only the title", isWeakMatch("gift card amount", r("Circular on festival gifts", 0.8, { chunkText: "the employee may choose a gift card of Rs 15,000" })) === false);
ok("a perfect (quoted) match is never weak", isWeakMatch("zzzz qqqq", r("Anything", 0.5, { isPerfectMatch: true })) === false);
ok("a VERY confident hit by meaning (90% or more) is never weak even with no shared word", isWeakMatch("eyeglass reimbursement", r("Spectacles allowance for employees", 0.93)) === false);
ok("...the same hit at 85% is labelled (it is only a label)", isWeakMatch("eyeglass reimbursement", r("Spectacles allowance for employees", 0.85)) === true);
ok("matchPercentage (0 to 100) is read like a similarity: 92 is confident", isWeakMatch("eyeglass reimbursement", r("Spectacles allowance", null, { matchPercentage: 92 })) === false);
ok("a question with NO content word ('list the employees') calls nothing weak", isWeakMatch("list the employees", r("Anything at all", 0.6)) === false && contentStems("list the employees").length === 0);
ok("a question in Hindi or Bengali is compared by its own words (unicode letters)", isWeakMatch("छुट्टी नियम", r("छुट्टी के नियम", 0.7)) === false && isWeakMatch("ছুটির নিয়ম", r("Wage revision", 0.7)) === true);

// ---- the list
{
  const good = r("Extension of SAIL Mediclaim policy (2026-2027)", 0.88);
  const list = [good, r("Sports events December 2024", 0.8)];
  const out = markWeakMatches("what is the last date to renew SAIL Mediclaim", list) as any[];
  ok("in a list only the weak one is changed; the good one is the SAME object", out[0] === good && out[1].weakMatch === true && out[1].similarity === null);
  ok("when nothing is weak the SAME array comes back (no new render)", markWeakMatches("mediclaim", [good]) === (undefined as any) || (() => { const a = [good]; return markWeakMatches("mediclaim", a) === a; })());
  ok("an empty list is safe", markWeakMatches("anything", []).length === 0);
}

// ---- the screen: one honest line above the results, only when ALL of them are weak, and the badge needs no change
const hook = readFileSync("src/hooks/useOmniSearch.ts", "utf8");
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("the hook marks the weak results once (useMemo), from the question that was searched", hook.includes("markWeakMatches(submittedQuery, rawResults)") && hook.includes("useMemo"));
ok("the modal says so in one line when every result is weak (and not in Deep Synthesis)", modal.includes("data-weak-note=\"true\"") && modal.includes("WEAK_NOTE") && modal.includes("(r as any).weakMatch"));
ok("the note is the one in the module", WEAK_NOTE === "No document clearly answers this question. These are the closest ones, and they may not.");
console.log(`weakMatch selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

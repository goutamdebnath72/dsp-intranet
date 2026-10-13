// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/search/synthesisIntent.selftest.ts
// No database, no network, no model.

import { readFileSync } from "node:fs";
import { autoEdsEnabled, detectSynthesisIntent } from "./synthesisIntent";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const is = (q: string) => detectSynthesisIntent(q);
const brief = (q: string) => { const r = is(q); return `[${r.level} ${r.score}${r.blockedBy ? ` blocked by ${r.blockedBy}` : ""}] ${q.slice(0, 80)}`; };

// ---- the switch
ok("auto-EDS is off by default", !autoEdsEnabled({}) && !autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: "1" }) && !autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: "false" }));
ok("auto-EDS is on for 'true'", autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: " True " }));
ok("the old server-side variable no longer switches it on", !autoEdsEnabled({ FRONT_PATH_AUTO_EDS: "true" }));

// ---- the REAL questions: the four tests of the old query document
const OLD_TESTS = [
  "Trace the evolution of DSP's attendance and access control policies from 2023 to 2024. Specifically, contrast the Contactless Face Recognition System rollout for executives with the phased RFID biometric implementation for contract workers, and detail the Gate Pass #13 transition from Pink to Blue.",
  "Synthesize the financial and welfare adjustments made for contract workers between 2022 and 2025. Detail the revised GPAIS premium structures, the January 2024 minimum wage calculations for the Works area, and their specific eligibility under DSP's Motivational Award Schemes, specifically the Kaushal Award.",
  "Compare the financial assistance and bond requirements for an executive pursuing a 2-year non-medical higher education course with the cash incentive structures provided under the 2024 and 2025 DSP Hindi Teaching Schemes for the Pragya and Parangat levels.",
  "Provide a briefing on mandatory employee compliance by cross-referencing the Zero Tolerance Safety Rules (ZTSR) revised consequence management steps with the Special Intensive Revision (SIR) Format B declaration requirements.",
];
for (const q of OLD_TESTS) ok(`old EDS test is detected: ${brief(q)}`, is(q).synthesis);

// ---- the REAL questions: the "C" questions of the accuracy test, and the other acceptance questions
type Rec = { id: string; query: string; source?: string; run?: { auth?: string } };
const set: Rec[] = JSON.parse(readFileSync("eval/router-acceptance.json", "utf8")).records;
const EDS_IDS = ["A-C1", "A-C2", "A-C3", "A-C5"];
for (const id of EDS_IDS) {
  const r = set.find((x) => x.id === id);
  ok(`${id} is detected: ${r ? brief(r.query) : "missing from the set"}`, !!r && is(r.query).synthesis);
}
// EDS- and INT- records ARE EDS-type questions (the old query document and the "C" questions), SEC- are probes, G- are probes
const others = set.filter((r) => !EDS_IDS.includes(r.id) && r.source !== "G" && !r.id.startsWith("EDS-") && !r.id.startsWith("INT-") && !r.id.startsWith("SEC-"));
const edsTypeRecords = set.filter((r) => r.id.startsWith("EDS-") || r.id.startsWith("INT-"));
const missed = edsTypeRecords.filter((r) => !is(r.query).synthesis);
ok(`every EDS-/INT- record in the set is detected (${edsTypeRecords.length} checked)`, missed.length === 0, missed.map((r) => r.id).join(", "));
const falseHits = others.filter((r) => is(r.query).synthesis);
ok(`none of the ${others.length} other acceptance questions is taken for EDS`, falseHits.length === 0, falseHits.map((r) => `${r.id}: ${brief(r.query)}`).join(" | "));
const borderline = others.filter((r) => is(r.query).level === "borderline");
console.log(`(information: ${borderline.length} of the ${others.length} other acceptance questions are borderline${borderline.length ? ": " + borderline.map((r) => r.id).join(", ") : ""})`);

// ---- the five Smart Semantic questions of the old document: one question, one circular
const SEMANTIC = [
  "How do I return my provident fund advance before the due date?",
  "Can a retired employee keep their company quarters in Kolkata or Mumbai?",
  "What is the punishment if I am caught using my mobile phone while walking on the shop floor?",
  "Does the company provide money or study leave to do an MBA or engineering degree?",
  "How to get the cash reward for passing Hindi language exams?",
];
for (const q of SEMANTIC) ok(`smart semantic question stays ordinary: ${brief(q)}`, is(q).level === "none");

// ---- generalisation: questions written by me from the pattern (NOT from your data). Misses are reported, not hidden.
const PARAPHRASES_EDS = [
  "Compare the casual and medical leave entitlements for contractor workers in the 2023 and 2025 holiday and leave circulars, and detail what stayed the same.",
  "Summarise how the SAIL Mediclaim renewal deadline changed between the original circular and the extension, and which circular announced each date.",
  "Trace the history of the online gift card scheme from the first announcement to the corrigendum, and detail the amounts at each stage.",
  "Contrast the football and volleyball team selection procedures announced in 2024 and 2025.",
  "What changed in the GPAIS premium for contract workers between 2024 and 2025?",
  "Give me a briefing on all sports events and selection trials announced for December 2024.",
  "How did the Hindi Teaching Scheme incentives differ between 2023 and 2025?",
  "Analyse the changes to contract workers' wages and insurance across 2022 to 2025.",
  "Cross-reference the Hindi Teaching Scheme with the higher education sponsorship scheme and compare the cash amounts in each.",
  "Did the minimum daily wage for contract workers change between the 2023 notice and the 2024 notice?",
  "What was the original last date for Mediclaim renewal and what is the extended date?",
  "List all the tournaments and championships that employees were invited to in January 2026.",
  "Synthesize the health check-up arrangements announced for non-executive employees in December 2024 and January 2025, including rooms and dates.",
  "Contrast the Contactless Attendance System for executives with the Biometric Attendance System for contractor workers, and detail the effective dates of each.",
  "Provide a briefing on the evolution of contract worker holiday and leave policy from 2022 to 2025.",
  "Compare the GPAIS premium amounts before and after the revision for contractor workers.",
  "Trace how the merit award scheme for contract workers was amended in 2026 and how its last date was extended.",
  "Brief me on how the Zero Tolerance Safety Rules and the contractor safety circulars differ in their penalties.",
];
const edsMisses = PARAPHRASES_EDS.filter((q) => !is(q).synthesis);
ok(`at least 80% of my ${PARAPHRASES_EDS.length} EDS-style paraphrases are detected (${PARAPHRASES_EDS.length - edsMisses.length} are)`, (PARAPHRASES_EDS.length - edsMisses.length) / PARAPHRASES_EDS.length >= 0.8, edsMisses.map(brief).join(" | "));
if (edsMisses.length) console.log(`(information: EDS-style paraphrases NOT detected:\n  ${edsMisses.map(brief).join("\n  ")})`);

const PARAPHRASES_ORDINARY = [
  "What is the gift card amount for employees?",
  "When is the football selection trial?",
  "Which circular announced the Hindi teaching scheme?",
  "What is the last date to submit the merit scholarship application for contract workers?",
  "How many days of casual leave do contractor workers get?",
  "Where is the health check-up held in January 2026?",
  "What documents are needed for the pre-mature repayment of a PF loan?",
  "What is the deadline for submitting the SIR declaration in Format B?",
  "What is the revised GPAIS premium amount for contractor workers?",
  "Is the Mediclaim policy extended till August?",
  "show me the circular about zero tolerance safety rules",
  "open the football coach notice",
  "explain the zero tolerance safety rules",
  "How does the contactless attendance system work for executives?",
  "Why was the gate pass colour changed?",
  "What happens if a contractor worker is absent for three days?",
  "Can contract workers claim medical leave in their first year?",
  "Which room is the pathology test for the January 2026 health check-up?",
  "What is the minimum daily wage for contract workers from 1 January 2024?",
  "Who can apply for the LinkedIn membership?",
  "what are the working hours on the 5 km run day",
  "how to apply for the higher education sponsorship scheme",
  "Does the Hindi teaching scheme give a cash prize for Praveen?",
  "How much is the PF loan interest?",
  "gate pass no 13 blue colour",
  "Zero Tolerance Safety Rules",
  "Format B declaration last date",
  "mediclaim renewal 2026-27",
  "volleyball championship at Alloy Steels Plant Durgapur",
  "promotion order executives 31.12.2025",
];
const ordinaryHits = PARAPHRASES_ORDINARY.filter((q) => is(q).synthesis);
ok(`none of my ${PARAPHRASES_ORDINARY.length} ordinary single-document questions is taken for EDS`, ordinaryHits.length === 0, ordinaryHits.map(brief).join(" | "));

// ---- DATA-MINING questions in the style of a policy maker (written by me from your description, BEFORE tuning on them)
const TOP_BRASS = [
  "What hidden patterns emerge from the circulars issued for contract workers between 2022 and 2025?",
  "Correlate the safety compliance rules with the welfare schemes announced for contractor workers and tell me what we are missing.",
  "Are there any inconsistencies or gaps between the leave entitlements and the holiday lists issued for contract workers?",
  "What do the Mediclaim extensions, the gift card corrigendum and the PF loan circulars tell us about how often decisions are revised after they are announced?",
  "Which circulars place obligations on executives that are not obvious from their headlines?",
  "What are the policy implications of introducing biometric attendance for contract workers on wages and insurance?",
  "How many circulars were issued on safety and compliance in each of the last three years, and is the trend rising?",
  "Identify the recurring themes across all circulars issued in December.",
  "What is the relationship between the sports selection circulars and the motivational award schemes?",
  "Show me the overall picture of employee welfare benefits announced since 2022.",
  "What should the leadership know about contract worker benefits that is not visible from individual circulars?",
  "Where do our rules for contractors and for executives diverge?",
  "What does the timeline of attendance, access and safety circulars reveal about the direction of policy?",
  "Find connections between the Hindi teaching scheme and the executive training sponsorship scheme.",
  "Which welfare benefits for contract workers have changed over the last three years and what does that say about cost trends?",
  "Analyse how the 2024 circulars on gate passes, attendance and safety fit together as one access control policy.",
];
const brassMisses = TOP_BRASS.filter((q) => !is(q).synthesis);
ok(`at least 80% of my ${TOP_BRASS.length} policy-maker (data-mining) questions are detected (${TOP_BRASS.length - brassMisses.length} are)`, (TOP_BRASS.length - brassMisses.length) / TOP_BRASS.length >= 0.8, brassMisses.map(brief).join(" | "));
if (brassMisses.length) console.log(`(information: policy-maker questions NOT detected:\n  ${brassMisses.map(brief).join("\n  ")})`);

// ordinary questions that contain tempting words: they may be "borderline" at most, never EDS
const TEMPTING = [
  "What is the effect of the new gate pass colour?",
  "What is the impact of missing the SIR declaration deadline on my salary?",
  "What is the pattern of the 5 km walk route?",
  "How often is the health check-up held?",
  "How many circulars are there about football?",
  "Is there a gap between the check-up dates?",
  "show me circulars about gate pass",
  "What is the trend of the PF interest rate?",
  "Which theme was chosen for SAIL Gaurav Diwas?",
  "Is there a link to the Mediclaim form?",
  "what is the relationship of the nominee to the member for the PF loan",
  "Are the two scheme dates the same?",
];
const temptingHits = TEMPTING.filter((q) => is(q).synthesis);
ok(`none of my ${TEMPTING.length} ordinary questions with tempting words is taken for EDS`, temptingHits.length === 0, temptingHits.map(brief).join(" | "));

// ---- HELD-OUT questions: written BEFORE the final tuning and never used to tune. Positives are reported (not asserted: they are
// the honest measure of recall); the ordinary ones must never be EDS.
const HELD_OUT_EDS = [
  "Are there any circulars whose provisions contradict each other on contract worker benefits?",
  "What common thread runs through the safety, attendance and access control circulars of the last two years?",
  "Compare how the plant treated executives and contractors in the 2024 and 2025 circulars on training and awards.",
  "What do the revisions to the Mediclaim and gift card circulars suggest about decision making in the HR department?",
  "Highlight anything in the circulars that executives may have overlooked about contractor compliance.",
  "Summarise the cumulative effect of the 2023 to 2025 circulars on contract worker welfare and cost.",
  "Which schemes for contract workers overlap with benefits already offered to regular employees?",
  "Give me a briefing on how contractor policy has shifted since 2022.",
  "Trace the sequence of events from the first gift card announcement to the final corrigendum and explain what went wrong.",
  "What risks do the new attendance and gate pass rules create that nobody has talked about?",
  "Does the safety circular undermine or reinforce the contractor insurance scheme?",
  "Reconcile the contractor wage notice with the GPAIS premium circular and flag any mismatch.",
  "Across all circulars since 2022, how many dealt with safety, and how did that change year by year?",
  "Is there a pattern in which circulars get corrected or extended soon after they are issued?",
];
const HELD_OUT_ORDINARY = [
  "What is the revised GPAIS premium for 2025?",
  "Where can I find the list of nodal officers?",
  "Is the football coach notice applicable to volleyball?",
  "What time does the health check-up start?",
  "Which circular mentions the Kaushal Award?",
  "What are the eligibility rules for the merit scholarship award?",
  "Does the contactless attendance system apply to contract workers too?",
  "What is the penalty at the fourth stage under the zero tolerance rules?",
  "How do I apply for LinkedIn membership as an executive?",
  "Tell me about the gift card circular.",
];
const heldMisses = HELD_OUT_EDS.filter((q) => !is(q).synthesis);
console.log(`(HELD-OUT recall, the honest number: ${HELD_OUT_EDS.length - heldMisses.length} of ${HELD_OUT_EDS.length} policy-maker questions detected)`);
if (heldMisses.length) console.log(`  not detected:\n    ${heldMisses.map(brief).join("\n    ")}`);
const heldHits = HELD_OUT_ORDINARY.filter((q) => is(q).synthesis);
ok(`none of ${HELD_OUT_ORDINARY.length} held-out ordinary questions is taken for EDS`, heldHits.length === 0, heldHits.map(brief).join(" | "));

// ---- the people-data guard: never EDS, even with an analytic verb
const PEOPLE = [
  "Compare the seniority of Mohd Anwar Ullah and Rana Saha",
  "Summarise the designations of executives in C&IT",
  "Trace ticket 228757 across the health check-up lists",
  "Contrast who has the health check-up in December 2024 with January 2025",
  "compare roy and ray by grade",
];
for (const q of PEOPLE) { const r = is(q); ok(`people question is blocked: ${brief(q)}`, !r.synthesis && r.blockedBy !== null); }
ok("a bare 'compare roy and ray' is at most borderline, never EDS", !is("compare roy and ray").synthesis);

// ---- the three levels, and explanations
ok("one analytic verb alone is borderline (a written summary may help)", is("Summarise the SAIL Mediclaim extension circular").level === "borderline");
ok("a question with no cue scores 0", is("What is the gift card amount?").score === 0);
ok("supporting shape alone never reaches 5", is("what are the rules for casual leave and which holidays fall in 2024 and 2025 for contract workers in the plant").level !== "synthesis");
ok("an empty question is none", is("   ").level === "none" && is("").score === 0);
ok("the reasons are listed for an EDS question", is(OLD_TESTS[0]).reasons.length >= 4 && is(OLD_TESTS[0]).reasons.every((r) => /^\+\d /.test(r)));
ok("the reasons name the people-data word that blocked", detectSynthesisIntent(PEOPLE[0]).blockedBy?.includes("seniority") === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

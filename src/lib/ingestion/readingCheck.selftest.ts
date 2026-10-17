/** Self-test of the reading check. Run: npx tsx src/lib/ingestion/readingCheck.selftest.ts. The real cases use the readings of the pilot of 17 Oct 2026. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { asciiDigits, checkReadings, handwrittenNumbers, isMajor, numberContext, numbersOf, oddScriptsIn } from "./readingCheck";
import { STOPPED_MARKER, cutAtLoop } from "./pageReader";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = "") => { if (cond) pass++; else { fail++; console.log("FAIL", name, detail); } };
const eq = (name: string, got: unknown, want: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
const has = (xs: string[], ...want: string[]) => want.every((w) => xs.includes(w));

// ---------------------------------------------------------------- numbers
eq("Devanagari and Bengali digits are written as 0-9", asciiDigits("२०२६/५२ ও ১২"), "2026/52 ও 12");
eq("a thousands comma goes", [...numbersOf("Rs. 20,995.30 per month")], ["20995.30"]);
eq("one date written three ways is ONE number", [...new Set([...numbersOf("20-08-2026"), ...numbersOf("20.08.2026"), ...numbersOf("20/08/2026")])], ["20.08.2026"]);
eq("Devanagari digits in a reference number", [...numbersOf("क्र. सं.: २०२६/५२")], ["2026.52"]);
eq("a lone digit is not a number worth comparing", [...numbersOf("(i) 1. 2) 7")], []);
eq("the pipeline's own col11: labels are not numbers", [...numbersOf("col11: Amt. | col12: Status | 3,000")], ["3000"]);
eq("a number inside [handwritten: ...] is left out ...", [...numbersOf("sign [handwritten: Roy 27/12/2025?] 5000")], ["5000"]);
eq("... and found by the handwritten function", handwrittenNumbers("sign [handwritten: Roy 27/12/2025?] 5000"), ["27.12.2025"]);
ok("important: 4 digits, or a separator", isMajor("5000") && isMajor("0.00") && isMajor("20.08.2026") && !isMajor("817") && !isMajor("39") && !isMajor("10"));

// ---------------------------------------------------------------- the words around a number
ok("the words around a number are shown", numberContext("the amount (215,000) is payable in full", "215000") === "the amount (215,000) is payable in full");
ok("a date written another way is found", /deadline 20-08-2026 only/.test(numberContext("the deadline 20-08-2026 only", "20.08.2026") ?? ""));
ok("a number in Devanagari digits is found", /२०२६\/५२|2026\/52/.test(numberContext("क्र. सं.: २०२६/५२ नई दिल्ली", "2026.52") ?? ""));
ok("a number that is not there gives null", numberContext("nothing here", "808") === null);
ok("the context is short and on one line", (numberContext("a ".repeat(100) + "808" + "\n b".repeat(100), "808") ?? "").length < 90 && !/\n/.test(numberContext("x\n808\ny", "808") ?? ""));

// ---------------------------------------------------------------- scripts that do not belong
const cyr = oddScriptsIn("2. SRI WON\u041c\u0418 HORAM, RLC (CENTRAL)", "second");
ok("Cyrillic letters inside a Latin name are found, with where", cyr.length === 1 && cyr[0].chars === "\u041c\u0418" && /WON/.test(cyr[0].context), JSON.stringify(cyr));
eq("Latin, Devanagari and Bengali are fine", oddScriptsIn("Premium प्रीमियम রাশি 150.00", "first"), []);
ok("Greek and Arabic are found too", oddScriptsIn("alpha \u03b1\u03b2 and \u0627\u0644", "first").length === 2);

// ---------------------------------------------------------------- comparing two readings
const A = "Total 20,995.30 | Daily 808 | Dated 16.12.2023 and a note ".repeat(4);
eq("the same numbers: agreed", checkReadings(A, A).status, "agreed");
const r1 = checkReadings(A + " ref 713203", A + " ref 13203");
ok("a number that differs in one digit is flagged both ways", r1.status === "differences" && has(r1.onlyFirst, "713203") && has(r1.onlySecond, "13203"), JSON.stringify(r1));
ok("the numbers both have are confirmed", has(r1.confirmed, "20995.30", "808", "16.12.2023"));
const r2 = checkReadings(A + " 817", A);
ok("a small plain number that only one reading has is counted but does not raise the status", r2.status === "agreed" && has(r2.minorOnlyFirst, "817"), JSON.stringify(r2));
const r3 = checkReadings(A + " 20.08.2026", A + " [handwritten: S Roy 20/08/2026?]");
ok("a handwritten number in the second reading CONFIRMS the same number in the first", r3.status === "agreed" && has(r3.confirmed, "20.08.2026"), JSON.stringify(r3));
const r4 = checkReadings(A, A + " [handwritten: S Roy 27/12/2025?]");
ok("a handwritten number only the second reading has is never flagged", r4.status === "agreed" && r4.onlySecond.length === 0 && has(r4.handwritten, "27.12.2025"), JSON.stringify(r4));
const r5 = checkReadings(A, A.replace("Dated", "Dated \u0410\u0412"));
ok("a letter from a wrong script raises the status even when every number agrees", r5.status === "differences" && r5.oddScripts.length === 1, JSON.stringify(r5));
const r6 = checkReadings(A + " 0315054224 110856231", A + "\n" + STOPPED_MARKER);
ok("a second reading that stopped early: partial; what the first has beyond it is NOT held against it", r6.status === "partial" && has(r6.onlyFirst, "0315054224") && /stopped early/.test(r6.secondProblem ?? ""), JSON.stringify(r6));
const r7 = checkReadings(A, A + " 999888 \n" + STOPPED_MARKER);
ok("a stopped second reading with a new important number is still a difference", r7.status === "differences" && has(r7.onlySecond, "999888"));
eq("an empty second reading is unusable", checkReadings(A, "  ").status, "second_unusable");
eq("a far shorter second reading is unusable", checkReadings(A.repeat(5), "808").status, "second_unusable");

// ---------------------------------------------------------------- the loop cut
const blank = "|  |  |  |\n";
ok("six blank table rows in a row are a loop; the first stays, the rest goes, the marker is written", (() => { const t = cutAtLoop("| Head |\n| 150.00 |\n" + blank.repeat(8) + "after\n"); return t === "| Head |\n| 150.00 |\n|  |  |  |\n" + STOPPED_MARKER; })());
eq("five blank rows are not a loop", cutAtLoop("a\n" + blank.repeat(5) + "b\n"), "a\n" + blank.repeat(5) + "b\n");
ok("six identical text lines are a loop too", cutAtLoop("x\n" + "same line\n".repeat(7)).endsWith("same line\n" + STOPPED_MARKER) || cutAtLoop("x\n" + "same line\n".repeat(7)).endsWith(STOPPED_MARKER));
eq("a text without a loop is unchanged", cutAtLoop("one\ntwo\nthree\n"), "one\ntwo\nthree\n");

// ---------------------------------------------------------------- the REAL readings of the pilot (17 Oct 2026)
const pages: { id: string; pipeline: string; gemini: string; local: string }[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "pilot-readings.json"), "utf8"));
const page = (id: string) => pages.find((p) => p.id === id)!;
const vsGemini = (id: string) => checkReadings(page(id).pipeline, page(id).gemini);
// `local` in the fixture is the reading of a small model that was tried and set aside: a realistic example of a faulty second reading
const vsLocal = (id: string) => checkReadings(page(id).pipeline, cutAtLoop(page(id).local));
for (const id of ["gpais-english", "gpais-hindi", "football-trial", "gift-card-corrigendum", "merit-scholarship"]) eq(`REAL ${id}: the pipeline and Gemini agree`, vsGemini(id).status, "agreed");
const gate = vsGemini("gate-pass-13");
ok("REAL gate pass: the pin code 713203 that the pipeline read as 13203 is caught", gate.status === "differences" && has(gate.onlyFirst, "13203") && has(gate.onlySecond, "713203"), JSON.stringify(gate));
ok("REAL gate pass: a telephone number read differently is caught", has(gate.onlyFirst, "1343.758348") && has(gate.onlySecond, "0343.2583481"));
const med = vsGemini("mediclaim-hindi");
ok("REAL Hindi mediclaim: the deadline the pipeline read as 20-0802 and the circular number it lost are caught", has(med.onlyFirst, "20.0802") && has(med.onlySecond, "20.08.2026", "2026.52"), JSON.stringify(med));
ok("REAL Hindi gift card: the amount the pipeline read as 215,000 is caught", has(vsGemini("gift-card-hindi").onlyFirst, "215000"));
const wage = vsGemini("wage-notice");
ok("REAL wage notice: the three daily wages and the totals are confirmed by both readers", has(wage.confirmed, "808", "740", "809", "20995.30", "19245.30", "21040.40", "16.12.2023"), JSON.stringify(wage.confirmed));
ok("REAL wage notice: only a stray 9022 (next to a stamp) is unconfirmed", JSON.stringify(wage.onlyFirst) === '["9022"]' && wage.onlySecond.length === 0, JSON.stringify(wage));
const locWage = vsLocal("wage-notice");
ok("REAL wage notice, a weaker model's reading: the Cyrillic letters in a name are found", locWage.oddScripts.some((o) => o.reader === "second" && /WON/.test(o.context)), JSON.stringify(locWage.oddScripts));
const locHindi = vsLocal("gpais-hindi");
ok("REAL Hindi GPAIS, a weaker model's reading: it stopped early (154 blank rows), so the check is PARTIAL, not a disagreement", locHindi.status === "partial" && has(locHindi.onlyFirst, "0315054224", "110856231") && has(locHindi.confirmed, "150.00", "131.25", "112.50", "193.00"), JSON.stringify({ s: locHindi.status, f: locHindi.onlyFirst }));
ok("REAL Hindi GPAIS, a weaker model's reading: the table numbers it did read are all confirmed", has(locHindi.confirmed, "27.00", "23.62", "20.25", "169.00", "145.00"));
ok("REAL Hindi GPAIS: the cut text is short, not 176 lines", cutAtLoop(page("gpais-hindi").local).split("\n").length < 30);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/**
 * Self-test of the rupee-sign checks (step 42b). Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/currency.selftest.ts
 * The readings tested are the REAL ones Tesseract's English model wrote for a printed rupee sign (342 degraded renders in 19 font faces, 19 Oct 2026), and the
 * 11 hard pages of the pilot are the false-positive check.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPassages, verifyAnswer } from "../search/circularAnswer";
import { checkRowsFor, pageTextHash } from "../search/pageChecks";
import { RUPEE_SIGN, RUPEE_SLOT_READER, SLOT_DIGITS, SLOT_SYMBOLS, attachedDigitSuspects, rupeeSlotJunk, slotChecks, slotChecksFor } from "./currency";
import { TWIN_READER, combineChecks, twinChecksFor } from "./crossCheck";
import { PAGE_READER_PROMPT } from "./pageReader";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const values = (text: string) => attachedDigitSuspects(text).map((s) => `${s.value}~${s.base}`).join();

ok("the sign is U+20B9", RUPEE_SIGN === "\u20b9" && RUPEE_SIGN.codePointAt(0) === 0x20b9);
ok("the digits seen fused in front of an amount are 2, 3 and 7", SLOT_DIGITS.join() === "2,3,7" && SLOT_SYMBOLS.join("") === "%\u00a5\u20ac\u00ae");

// ---- an amount with a stray leading digit that the same page also states without it
ok("REAL: the gift card (215,000 next to Rs 15,000)", values("Online option for Gift Card Rs. 15000 to employees. The gift card value (215,000) may be chosen online. For the year Rs. 15,000/- may be chosen.") === "215000~15000");
ok("REAL: 2112.50 next to 112.50 (the premium)", values("Premium Rs 112.50 per month. The premium of 2112.50 is deposited by the contractor.") === "2112.50~112.50");
ok("REAL: 715,000 and 315,000 (the digits 7 and 3 were seen too)", values("Amount Rs. 15,000. Option A 715,000. Option B 315,000.").split(",").sort().join() === "315000~15000,715000~15000");
ok("a leading 4, which was never seen for the sign, is not concluded about", values("Amount Rs. 15,000 and also 415,000.") === "");
ok("Devanagari digits are read: (२१५,०००) next to रु. १५,०००", values("शुल्क रु. १५,००० है। उपहार कार्ड (२१५,०००) चुना जा सकता है।") === "215000~15000");
ok("what a second reader wrote in [handwritten: ...] is not part of the page", values("Rs. 15,000 [handwritten: 215,000 ?]") === "");

// ---- what is NOT concluded about
ok("an amount with no shorter twin on the page is left alone (nothing says it is wrong)", values("The gift card value (215,000) may be chosen online.") === "");
ok("a short base is too common to conclude from (Rs 500 and 2500)", values("Fee Rs. 500 and limit 2500 and 3500") === "");
ok("a reference number is not an amount with a stray digit (2026/50)", values("Serial 2026/50 dated 03-08-2026 and Rs. 15,000") === "");
ok("a number that ends with a year is not (931/2025 next to 2025)", values("Circular 931/2025 dated 2025 for the year 2025") === "");
ok("a date is not (20-08-2026 next to 0-08-2026 cannot be)", values("Up to 20-08-2026 and dated 11-08-2026") === "");
ok("the shorter amount must stand at least as often as the longer", values("Rs. 15,000 once, but (215,000) twice and 215,000 again") === "");
ok("two amounts that both stand, the longer once and the shorter twice: concluded about the longer", values("Rs. 15,000 in the subject, Rs. 15,000 in the table and (215,000) in the text") === "215000~15000");

// ---- the symbol read as a symbol, right before an amount
const junk = (text: string) => rupeeSlotJunk(text).map((j) => `${j.glyph}${j.amount}`).join();
ok("REAL: (% 15,000), the sign read as a percent sign", junk("The amount (% 15,000) is payable") === "%15000");
ok("REAL: ¥ 1,50,000/-, € and ® before an amount", junk("limit \u00a5 1,50,000/- and \u20ac112.50 and \u00ae15,000").split(",").sort().join() === "%15000".replace("%15000", "") + [ "\u00a5150000", "\u20ac112.50", "\u00ae15000" ].sort().join());
ok("REAL: up to % 20,000 only", junk("up to % 20,000 only") === "%20000");
ok("a percent sign AFTER its number is a percent sign (50% 15,000 employees; 5% of 15,000)", junk("50% 15,000 employees and 5% of 15,000 only") === "");
ok("an equals sign is not reported (Total = 15,000 is legitimate)", junk("Total = 15,000 and A = 150.00") === "");
ok("a written mark is not reported (Rs. 15,000)", junk("Rs. 15,000/- and INR 15,000") === "");

// ---- both readers are told what the sign is
{
  ok("the second reader is told: the sign is a currency mark, never a digit; copy it as printed; never write it as 2, 3, 7, %, Z or T; keep the printed digits", /\u20b9/.test(PAGE_READER_PROMPT) && /CURRENCY MARK, never a digit or a letter/.test(PAGE_READER_PROMPT) && /NEVER write it as 2, 3, 7, %, Z, T/.test(PAGE_READER_PROMPT) && /exactly the digits printed after the mark/.test(PAGE_READER_PROMPT));
  ok("...and its other rules are still there (the prompt was extended, not replaced)", /NEVER guess a digit/.test(PAGE_READER_PROMPT) && /\[handwritten:/.test(PAGE_READER_PROMPT) && /Output only the transcription\./.test(PAGE_READER_PROMPT));
  const eds = readFileSync(join(__dirname, "..", "search", "executiveSynthesis.ts"), "utf8");
  ok("the synthesis prompt says the sign is never a digit, names the stray-digit case and what to report", /it is never a digit\. OCR sometimes reads it as a digit stuck to the front of an amount/.test(eds) && /report the shorter, printed amount and say the other reading is unclear/.test(eds));
}

// ---- the checks
{
  const text = "Gift Card Rs. 15000. The gift card value (215,000) may be chosen online. Rs. 15,000.";
  const c = slotChecks([{ page: 2, text }, { page: 1, text: "Nothing here: Rs. 15,000." }]);
  ok("a page with a suspect gets a check: unconfirmed, nothing confirmed, the reader named; a clean page gets none", c.length === 1 && c[0].page === 2 && c[0].status === "slot" && c[0].unconfirmed.join() === "215000" && c[0].confirmed.length === 0 && c[0].reader === RUPEE_SLOT_READER, JSON.stringify(c));
  // combined with the twin's: what two pages agree on is confirmed and lifts the suspicion
  const twin = [{ page: 2, status: "twin", confirmed: ["215000", "15000"], unconfirmed: [], secondOnly: [], reader: TWIN_READER }];
  const both = combineChecks(twin, c);
  ok("a number two pages agree on (215,000 on both) is confirmed, and the single-page suspicion is lifted", both[0].unconfirmed.length === 0 && both[0].confirmed.includes("215000") && both[0].reader === `${TWIN_READER}+${RUPEE_SLOT_READER}`, JSON.stringify(both));
  const none = combineChecks([{ page: 2, status: "twin", confirmed: ["15000"], unconfirmed: [], secondOnly: [], reader: TWIN_READER }], c);
  ok("when no other page confirms it, the suspicion stands and both readers are named", none[0].unconfirmed.join() === "215000" && none[0].reader === `${TWIN_READER}+${RUPEE_SLOT_READER}`);
  ok("combining again changes nothing", JSON.stringify(combineChecks(none, c)) === JSON.stringify(none));
}

// ---- THE ANSWER CARD'S GATE, for a single-page circular (no twin page at all)
{
  const page = "Circular on the online option for the gift card. The gift card value (215,000) may be chosen online by every employee. For the year the gift card of Rs. 15,000 may be chosen online up to 20-08-2026.";
  const chunks = [{ page: 1, index: 0, text: page }];
  const checks = Object.fromEntries(slotChecksFor(chunks).map((c) => [c.page, { confirmed: c.confirmed, unconfirmed: c.unconfirmed }]));
  const passages = buildPassages("gift card value", [{ type: "circular", id: 51, title: "Circular - Online option for Gift Card Rs. 15000 to employees", date: null, chunks, checks }]);
  const ask = (value: string, quote: string) => verifyAnswer({ answerable: true, title: "Gift card value", note: "", rows: [{ label: "gift card", column: "", value, source: 1, quote }] }, passages);
  const wrong = ask("215,000", "The gift card value (215,000) may be chosen online by every employee");
  ok("GATE: on a single-page circular, 215,000 is refused: the page itself also says Rs. 15,000", !wrong.ok && /not confirmed by the second reading of page 1/.test(wrong.reason), wrong.ok ? "ACCEPTED" : wrong.reason);
  const right = ask("Rs. 15,000", "the gift card of Rs. 15,000 may be chosen online");
  ok("GATE: Rs. 15,000 from the same page passes", right.ok, right.ok ? "" : right.reason);
  ok("the checks of a circular from its chunks carry the fingerprint of the text that is stored", checkRowsFor(slotChecksFor(chunks), chunks)[0].textHash === pageTextHash(page));
  ok("a one-chunk circular with no suspect gets no rows", slotChecksFor([{ page: 1, index: 0, text: "Rs. 15,000 only" }]).length === 0 && slotChecksFor([{ page: null, index: 0, text: page }]).length === 0);
}

// ---- no false alarms on the real pages of the pilot (11 hard pages: wage notice, GPAIS, gift cards, mediclaim, ...)
{
  const pilot: { id: string; pipeline: string; gemini: string }[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "pilot-readings.json"), "utf8"));
  const flagged = pilot.flatMap((p) => [...attachedDigitSuspects(p.pipeline).map((s) => `${p.id}:pipeline:${s.value}`), ...attachedDigitSuspects(p.gemini).map((s) => `${p.id}:gemini:${s.value}`)]);
  ok(`REAL: on the ${pilot.length} hard pages of the pilot, in both readings, the ONLY amount flagged is the real misread of the gift-card Hindi page's Tesseract reading (215,000 where the circular says Rs 15,000): no false alarm anywhere else, and Gemini's reading of that page is not flagged`, flagged.join(" | ") === "gift-card-hindi:pipeline:215000", flagged.join(" | "));
  const truth = (JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "eval", "ocr-pilot-truth.json"), "utf8")).pages as { id: string; numbers: string[] }[]).find((x) => x.id === "gift-card-hindi");
  ok("...and the hand-made truth of that page says the amount is 15,000", !!truth && truth.numbers.includes("15,000") && !truth.numbers.includes("215,000"));
  const twin = pilot.filter((p) => /gpais/.test(p.id)).length;
  ok("the GPAIS pair still gets only its twin confirmation from the twin check, and no suspect", twin === 2 && twinChecksFor(pilot.filter((p) => /gpais/.test(p.id)).map((p, i) => ({ page: i + 1, index: i, text: p.pipeline }))).every((c) => c.unconfirmed.length === 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

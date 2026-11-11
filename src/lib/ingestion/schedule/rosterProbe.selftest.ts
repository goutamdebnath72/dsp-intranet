// src/lib/ingestion/schedule/rosterProbe.selftest.ts
// Run:  npx tsx src/lib/ingestion/schedule/rosterProbe.selftest.ts      (pictures are drawn in memory; the page text, which Gemini reads in the real upload, is a stand-in)
import { analyzeRosterStructure, createRosterProbe, headerLooksLikeRosterText, ROSTER_DISCOVERY_PAGES } from "./rosterProbe";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

// ------------------------------------------------------------------ pictures
const W = 1200;
const H = 1600;
const blank = () => new Uint8Array(W * H).fill(255);
function rect(px: Uint8Array, x0: number, y0: number, x1: number, y1: number, v = 0) {
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) px[y * W + x] = v;
}
async function toPng(px: Uint8Array): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
}
const RULES = [100, 200, 400, 800, 900, 1050, 1150]; // 6 columns, the last is DATE
const TOP = 250;
/** a roster page: a ruled table of 6 columns with merged date cells (3 groups of 5 rows) and a printed date in each */
async function rosterPage(): Promise<Buffer> {
  const px = blank();
  const bottom = 300 + 15 * 40;
  for (const x of RULES) rect(px, x - 1, TOP, x + 2, bottom);
  for (let y = 300; y <= 900; y += 40) rect(px, 100, y - 1, 1050, y + 2); // a rule on every row, in every column but the date column
  for (const y of [300, 500, 700, 900]) rect(px, 1050, y - 1, 1150, y + 2); // the date column: one rule per group of 5 rows
  for (const cy of [400, 600, 800]) for (let i = 0; i < 8; i++) rect(px, 1100 - 44 + i * 11, cy - 14, 1100 - 44 + i * 11 + 7, cy + 14);
  return toPng(px);
}
/** the same ruled table with NO merged date cells (an ordinary table of something else) */
async function plainTablePage(): Promise<Buffer> {
  const px = blank();
  for (const x of RULES) rect(px, x - 1, TOP, x + 2, 900);
  for (let y = 300; y <= 900; y += 40) rect(px, 100, y - 1, 1150, y + 1); // every row the same height, spanning all columns
  return toPng(px);
}
/** a page of a letter: blocks of "text", no table at all */
async function letterPage(): Promise<Buffer> {
  const px = blank();
  for (let y = 200; y < 1400; y += 34) rect(px, 120, y, 120 + 600 + ((y * 7) % 300), y + 14);
  return toPng(px);
}

// ------------------------------------------------------------------ the page-text stand-in (what Gemini reads off the page)
const ROSTER_HEADINGS = "HEALTH CHECK UP OF NON-EXECUTIVE EMPLOYEES FOR THE MONTH OF JANUARY 2025\n| SL.NO | T.NO | NAME | DEPTT. CODE | DEPARTMENT | DATE |\n| 1 | 228757 | SOMEBODY | 44000 | C&IT | 02.01.2025 |";
const OTHER_TABLE = "ITEMS ISSUED\n| Item | Qty | Price | Total |\n| Pen | 4 | 10 | 40 |";
let ocrCalls = 0;
const ocr = (text: string) => async () => {
  ocrCalls++;
  return text;
};

(async () => {
  // ================================================================== the pictures
  const roster = await rosterPage();
  const plain = await plainTablePage();
  const letter = await letterPage();
  const sr = await analyzeRosterStructure(roster);
  check("a ruled table with merged date cells has the structure of a roster", sr.rosterLike === true, sr.why);
  const sl = await analyzeRosterStructure(letter);
  check("a page of a letter does not (no ruled table)", sl.rosterLike === false && /no ruled table/.test(sl.why), sl.why);
  const sp = await analyzeRosterStructure(plain);
  check("an ordinary ruled table (a rule on every row in EVERY column, the last included) does not: its last column is not merged", sp.rosterLike === false && /not cut into merged cells/.test(sp.why), sp.why);

  // ================================================================== the headings (read from Gemini's text of the page)
  check("a roster's heading row (T.NO, NAME, DEPTT. CODE, DEPARTMENT, DATE) reads like a roster's", headerLooksLikeRosterText(ROSTER_HEADINGS));
  check("the spellings count: 'T.No', 'Ticket No', 'Deptt.Code'", headerLooksLikeRosterText("SL T.No Name Date") && headerLooksLikeRosterText("Sl Ticket No Name Deptt.Code") && headerLooksLikeRosterText("| T. No | Name | Department |"));
  check("no ticket column: 'Name', 'Department', 'Date' alone is NOT a roster (a stray 'name' or 'date' in another table cannot pass)", !headerLooksLikeRosterText("| Name | Department | Date | Remarks |"));
  check("a ticket column and only one other heading is not enough", !headerLooksLikeRosterText("| T.No | Name |"));
  check("an ordinary table's headings are not a roster's", !headerLooksLikeRosterText(OTHER_TABLE));
  check("an empty reading is not a roster", !headerLooksLikeRosterText(""));
  check("headings far down the page text (past the first lines) are ignored", !headerLooksLikeRosterText("x ".repeat(1500) + "T.NO NAME DEPARTMENT DATE"));

  // ================================================================== the probe, page by page
  {
    ocrCalls = 0;
    const probe = createRosterProbe();
    const seq = [letter, letter, roster, roster, roster];
    const verdicts: boolean[] = [];
    for (let i = 0; i < seq.length; i++) verdicts.push((await probe.classify(seq[i], i + 1, ocr(ROSTER_HEADINGS))).roster);
    check("a schedule circular: two letter pages, then the roster pages -> other, other, ROSTER, ROSTER, ROSTER", JSON.stringify(verdicts) === JSON.stringify([false, false, true, true, true]), JSON.stringify(verdicts));
    check("...it is a roster circular, and the heading OCR was used exactly ONCE for the whole document", probe.isRoster === true && ocrCalls === 1, `calls ${ocrCalls}`);
    check("after the roster, a letter page is an ordinary page again (the last page of a schedule may be a letter)", (await probe.classify(letter, 6, ocr(ROSTER_HEADINGS))).roster === false && probe.isRoster === true);
  }
  {
    ocrCalls = 0;
    const probe = createRosterProbe();
    const verdicts: boolean[] = [];
    for (let i = 0; i < 5; i++) verdicts.push((await probe.classify(letter, i + 1, ocr(ROSTER_HEADINGS))).roster);
    check("an ordinary circular (letters): every page is ordinary, and the OCR is never used", verdicts.every((v) => !v) && ocrCalls === 0 && probe.isRoster === null);
  }
  {
    ocrCalls = 0;
    const probe = createRosterProbe();
    const out: boolean[] = [];
    for (let i = 0; i < 4; i++) out.push((await probe.classify(roster, i + 1, ocr(OTHER_TABLE))).roster);
    check("a table with merged date cells whose headings are NOT a roster's: ordinary pages, not a roster circular", out.every((v) => !v) && probe.isRoster === false);
    check("...the headings were read only twice (two pages tried), never again", ocrCalls === 2, `calls ${ocrCalls}`);
  }
  {
    ocrCalls = 0;
    const probe = createRosterProbe();
    const out: boolean[] = [];
    for (let i = 0; i < 4; i++) out.push((await probe.classify(plain, i + 1, ocr(ROSTER_HEADINGS))).roster);
    check("an ordinary ruled table (not merged) never reaches the OCR at all, even if its headings would read like a roster's", out.every((v) => !v) && ocrCalls === 0);
  }
  {
    ocrCalls = 0;
    const probe = createRosterProbe();
    const tsvs = ["a continuation page with only rows", ROSTER_HEADINGS];
    let call = 0;
    const first = (await probe.classify(roster, 3, async () => tsvs[call++])).roster;
    const second = (await probe.classify(roster, 4, async () => tsvs[call++])).roster;
    const third = (await probe.classify(roster, 5, async () => tsvs[Math.min(call++, 1)])).roster;
    check("a first roster-like page without headings (a continuation page) does not end the search: the next page with headings confirms it", first === false && second === true && third === true && probe.isRoster === true);
  }
  {
    ocrCalls = 0;
    const probe = createRosterProbe();
    for (let i = 1; i <= ROSTER_DISCOVERY_PAGES; i++) await probe.classify(letter, i, ocr(ROSTER_HEADINGS));
    const late = await probe.classify(roster, ROSTER_DISCOVERY_PAGES + 1, ocr(ROSTER_HEADINGS));
    check(`a roster table that first appears after page ${ROSTER_DISCOVERY_PAGES} is not looked for (a long circular does not pay for a search): ordinary, no OCR, not a roster`, late.roster === false && ocrCalls === 0 && probe.isRoster === false && /first \d+ pages/.test(late.why), late.why);
  }
  {
    const probe = createRosterProbe({ discoveryPages: 2 });
    await probe.classify(letter, 1, ocr(ROSTER_HEADINGS));
    await probe.classify(letter, 2, ocr(ROSTER_HEADINGS));
    check("the discovery window can be set (2 pages)", (await probe.classify(roster, 3, ocr(ROSTER_HEADINGS))).roster === false);
  }
  {
    const probe = createRosterProbe();
    let threw = false;
    try {
      await probe.classify(roster, 3, async () => {
        throw new Error("OCR engine down");
      });
    } catch {
      threw = true;
    }
    check("if the heading OCR fails the probe throws (the upload route catches it and treats the page as ordinary)", threw);
  }

  console.log(`\nrosterProbe selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

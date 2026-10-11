// src/lib/ingestion/schedule/schedule.selftest.ts
// Run:  npx tsx src/lib/ingestion/schedule/schedule.selftest.ts      (no OCR engine, no network, no database)
//
// The roster reading is tested on pages DRAWN here (a table with ruled lines, merged date cells, a group split by a page break, a stray mark,
// a typo in a date) with a scripted stand-in for the OCR. Nothing real (no employee) is in the repository.
import { clusterLines, findHorizontalLines, findVerticalLines, loadGray, type Gray } from "./lines";
import { deskewPng, estimateTilt } from "./deskew";
import { findDateCells, findFrame } from "./dateCells";
import { overlayColumn, splitAtRules, wordsFromTsv, rowsFromWords, type Word } from "./rosterRows";
import { judgeDate, parsePrintedDate, parseScheduleMonth, repairPrintedDate } from "./dates";
import { cleanTicket, cropCellText, extractSchedule, maskRules } from "./extractSchedule";
import { nameFit, verifyAgainstHr, type HrEmployee } from "./importSchedule";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

// ------------------------------------------------------------------ drawing
const W = 1200;
const H = 1600;
function blank(): Uint8Array { return new Uint8Array(W * H).fill(255); }
function rect(px: Uint8Array, x0: number, y0: number, x1: number, y1: number, v = 0) {
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) px[y * W + x] = v;
}
async function toPng(px: Uint8Array): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
}
const RULES = [100, 200, 400, 800, 900, 1050, 1150]; // the table's vertical rules: 6 columns, the last is DATE
/** "digits" for the date cell: a row of 8 solid blocks the way a printed date would look to the blob finder */
function ink(px: Uint8Array, cx: number, cy: number) {
  for (let i = 0; i < 8; i++) rect(px, cx - 44 + i * 11, cy - 14, cx - 44 + i * 11 + 7, cy + 14);
}

interface PageSpec {
  top: number;
  rows: number; // data rows, 40 px each, starting at 300
  /** y of the horizontal rules across the DATE band */
  dateRules: number[];
  /** [y centre] of the printed dates */
  inks: number[];
}
async function drawPage(spec: PageSpec): Promise<Buffer> {
  const px = blank();
  const bottom = 300 + spec.rows * 40;
  for (const x of RULES) rect(px, x - 1, spec.top, x + 2, bottom);
  for (const y of spec.dateRules) rect(px, 1050, y - 1, 1150, y + 2);
  for (const cy of spec.inks) ink(px, 1100, cy);
  return toPng(px);
}

let seqNo = 0;
/** a name made of letters only (a real name has no digits: the reader strips them): 1 -> ALPHA, 2 -> BRAVO ... */
const WORDS = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIET", "KILO", "LIMA", "MIKE", "NOVEMBER", "OSCAR", "PAPA", "QUEBEC", "ROMEO", "SIERRA", "TANGO", "UNIFORM", "VICTOR", "WHISKEY", "XRAY", "YANKEE"];
const letters = (n: number) => WORDS[(n - 1) % WORDS.length];
const tsvWord = (text: string, left: number, top: number, width: number) => `5\t1\t1\t1\t1\t${++seqNo}\t${left}\t${top}\t${width}\t24\t90\t${text}`;
/** the OCR's TSV for rows firstSerial .. firstSerial+n-1, laid out where the drawn rows are */
function tsvFor(firstSerial: number, n: number, title?: string, withCode = true): string {
  const out = ["1\t1\t0\t0\t0\t0\t0\t0\t1200\t1600\t-1\t"];
  if (title) title.split(" ").forEach((w, i) => out.push(tsvWord(w, 120 + i * 60, 120, 50)));
  for (let i = 0; i < n; i++) {
    const s = firstSerial + i;
    const top = 300 + i * 40 + 8;
    out.push(tsvWord(String(s), 130, top, 40));
    out.push(tsvWord(String(100000 + s), 260, top, 80));
    out.push(tsvWord("PERSON", 500, top, 90));
    out.push(tsvWord(letters(s), 600, top, 120));
    if (withCode) out.push(tsvWord(String(30000 + s), 840, top, 50));
    out.push(tsvWord("SMS", 920, top, 40));
    out.push(tsvWord("(OPRN)", 965, top, 70));
  }
  return out.join("\n");
}

(async () => {
  // ================================================================== dates
  check("a printed date: 01-01-25, 13.01.2025, 13/01/2025, 010125", ["01-01-25", "13.01.2025", "13/01/2025", "010125"].every((t) => parsePrintedDate(t) !== null) && parsePrintedDate("01-01-25")!.year === 2025 && parsePrintedDate("13.01.2025")!.day === 13);
  check("not a date: 43-01-25, 31-02-25, 11/012/25, 00-01-25, text, empty", ["43-01-25", "31-02-25", "11/012/25", "00-01-25", "DATE", ""].every((t) => parsePrintedDate(t) === null));
  const jan25 = { month: 1, year: 2025 };
  check("the schedule month is read from a title (even with a typo): JANNUARY 2025, DECEMBER 2024, JAN-2026, 'for the month of December2024'", JSON.stringify(parseScheduleMonth("HEALTH CHECK UP SCHEDULE OF NON EXECUTIVE EOR THE MONTH OF JANNUARY 2025")) === '{"month":1,"year":2025}' && parseScheduleMonth("NON EXECUTIVE HEALTH CHECK UP SCHEDULE FOR DECEMBER 2024")?.month === 12 && parseScheduleMonth("FOR THE MONTH OF JAN-2026")?.year === 2026 && parseScheduleMonth("for the month of December2024")?.month === 12 && parseScheduleMonth("no month here") === null);
  check("a date in the schedule's month is stored as printed", judgeDate("13-01-25", jan25).date === "2025-01-13" && judgeDate("13-01-25", jan25).note === null);
  const wrongYear = judgeDate("13.01.2025", { month: 1, year: 2026 });
  check("the circular's own year typo (13.01.2025 in a January 2026 schedule) is corrected AND said", wrongYear.ok && wrongYear.date === "2026-01-13" && /year was corrected/.test(String(wrongYear.note)), JSON.stringify(wrongYear));
  check("a date of another month is NOT stored as if it were fine", judgeDate("13-02-25", jan25).ok === false && judgeDate("13-02-25", jan25).date === null);
  const rep = repairPrintedDate("11/012/25", jan25);
  check("'11/012/25' (a stray digit in the circular) is read as 11 Jan 2025: the only reading that fits, and it is said", rep?.date === "2025-01-11" && /only reading that fits/.test(String(rep?.note)), JSON.stringify(rep));
  check("a repair is REFUSED when two readings fit ('0110125' could be 1 Jan or 11 Jan): it never picks one", repairPrintedDate("01/10125", jan25) === null);
  check("...and when none fits, when the schedule is unknown, and for a 6-digit non-date such as 43-01-25", repairPrintedDate("11/032/25", jan25) === null && repairPrintedDate("11/012/25", null) === null && repairPrintedDate("43-01-25", jan25) === null);

  // ================================================================== tickets and words
  check("a ticket: 6 digits; a rule read as a 7th character is dropped ('[333787', '1318839'); anything else is refused", cleanTicket("241391") === "241391" && cleanTicket("[333787") === "333787" && cleanTicket("1318839") === "318839" && cleanTicket("62|329551") === null && cleanTicket("24139") === null && cleanTicket("") === null);
  const glued: Word[] = [{ text: "343275|NIRANJAN", left: 300, top: 100, width: 200, height: 24, conf: 90 }, { text: "ABC", left: 450, top: 100, width: 40, height: 24, conf: 90 }]; // the first crosses the rule at x = 400
  const cut = splitAtRules(glued, RULES);
  check("a word that crosses a column rule is cut at the '|' the OCR read there", cut.length === 3 && cut[0].text === "343275" && cut[1].text === "NIRANJAN" && cut[2].text === "ABC", JSON.stringify(cut.map((w) => w.text)));
  const noPipe: Word[] = [{ text: "1234567890", left: 310, top: 100, width: 200, height: 24, conf: 90 }]; // crosses the rule at x = 400
  const cut2 = splitAtRules(noPipe, RULES);
  check("...and, with no '|', at the character nearest the rule", cut2.length === 2 && cut2[0].text.length >= 4 && cut2[0].text + cut2[1].text === "1234567890", JSON.stringify(cut2.map((w) => w.text)));
  const rowsA = rowsFromWords(wordsFromTsv(tsvFor(1, 3)), RULES, 260, 700);
  check("three rows come out with serial | ticket | name | code | department in their own columns", rowsA.length === 3 && rowsA[0].cells.join("|") === "1|100001|PERSON ALPHA|30001|SMS (OPRN)|", rowsA[0]?.cells.join("|"));

  // ================================================================== a column read on its own
  const ovRows = () => rowsFromWords(wordsFromTsv(tsvFor(1, 3)), RULES, 260, 700);
  const stripWords = [{ text: "30001", cy: 320 }, { text: "30002", cy: 360 }, { text: "30003", cy: 400 }];
  const dropped = ovRows();
  dropped.forEach((r) => (r.cells[3] = "")); // the page-wide OCR dropped the code column
  const nFilled = overlayColumn(dropped, 3, stripWords, (t) => /^\d{3,5}$/.test(t));
  check("a column the page-wide OCR dropped is filled from the digit strip, each number on its own row", nFilled === 3 && dropped.map((r) => r.cells[3]).join(",") === "30001,30002,30003", dropped.map((r) => r.cells[3]).join(","));
  const shifted = ovRows();
  overlayColumn(shifted, 3, [{ text: "30001", cy: 320 + 14 }, { text: "30002", cy: 360 - 12 }], (t) => /^\d{3,5}$/.test(t));
  check("a number goes to the row whose height it shares, even a few pixels off", shifted[0].cells[3] === "30001" && shifted[1].cells[3] === "30002");
  const far = ovRows();
  far[1].cells[3] = "";
  overlayColumn(far, 3, [{ text: "30002", cy: 2000 }], (t) => /^\d{3,5}$/.test(t));
  check("a number far from every row is ignored (never attached to the nearest row)", far[1].cells[3] === "");
  const wrongShape = ovRows();
  overlayColumn(wrongShape, 1, [{ text: "12", cy: 320 }], (t) => /^\d{6}$/.test(t));
  check("a reading with the wrong shape (2 digits for a ticket) is not used: the page-wide reading stays", wrongShape[0].cells[1] === "100001");
  const fill = ovRows();
  fill[0].cells[0] = "77"; fill[1].cells[0] = "";
  overlayColumn(fill, 0, [{ text: "5", cy: 320 }, { text: "2", cy: 360 }], (t) => /^\d{1,4}$/.test(t), true);
  check("onlyFill: a valid page-wide serial is kept, a missing one is filled", fill[0].cells[0] === "77" && fill[1].cells[0] === "2");
  const split = ovRows();
  overlayColumn(split, 1, [{ text: "1000", cy: 320 }, { text: "01", cy: 322 }], (t) => /^\d{6}$/.test(t));
  check("a number the strip read in two pieces on one row is joined", split[0].cells[1] === "100001");

  // ================================================================== lines, tilt, frame
  const px0 = blank();
  for (const x of RULES) rect(px0, x - 1, 260, x + 2, 900);
  rect(px0, 1050, 500 - 1, 1150, 500 + 2);
  const g0: Gray = { data: px0, width: W, height: H };
  const vl = clusterLines(findVerticalLines(g0, { minLen: 100 }), 8);
  check("the 7 vertical rules are found, at the right places", vl.length === 7 && vl.every((l, i) => Math.abs(l.pos - (RULES[i] + 0.5)) < 2), JSON.stringify(vl.map((l) => l.pos)));
  const hl = findHorizontalLines(g0, { minLen: 80, windowFrom: 1056, windowTo: 1144 });
  check("a horizontal rule across the DATE column is found", hl.length === 1 && Math.abs(hl[0].pos - 500.5) < 2);
  const fr0 = findFrame(g0)!;
  check("the table frame: the rules and its height", fr0.rules.length === 7 && Math.abs(fr0.top - 260) < 3 && Math.abs(fr0.bottom - 900) < 3, JSON.stringify(fr0));
  const sharp = (await import("sharp")).default;
  const tiltedPng = await sharp(await toPng(px0)).rotate(0.4, { background: { r: 255, g: 255, b: 255 } }).png().toBuffer();
  const tg = await loadGray(tiltedPng);
  const tilt = estimateTilt(tg);
  check("a page tilted by 0.4 degrees: the tilt is measured (0.007 px per px) and the page straightened (7 rules again)", Math.abs(Math.abs(tilt.k) - 0.007) < 0.0015, String(tilt.k));
  const straight = await loadGray((await deskewPng(tiltedPng, tilt.k)).png);
  check("...after straightening the rules are found again", findFrame(straight)?.rules.length === 7);

  // ================================================================== masking and cropping
  const masked = await loadGray(await maskRules(await toPng(px0), g0, fr0));
  check("the table's rules are painted out for reading words", masked.data[400 * W + 400] === 255 && masked.data[400 * W + 800] === 255 && g0.data[400 * W + 400] === 0 /* untouched original */);
  const dc0 = findDateCells(g0, fr0)!;
  check("the DATE box and its two cells (cut by one rule)", Math.round(dc0.band.xL) === 1050 && dc0.cells.length === 2 && Math.abs(dc0.cells[0].y1 - 500.5) < 3, JSON.stringify(dc0.cells));

  // a date cell with: the date, a speck of dust far from it, and a stroke of a rule that wandered into the cell
  const px1 = blank();
  ink(px1, 1100, 400);
  rect(px1, 1060, 320, 1063, 323); // dust
  rect(px1, 1055, 300, 1059, 700); // a long stroke (a rule that is not where it should be)
  const g1: Gray = { data: px1, width: W, height: H };
  const cropped = await cropCellText(g1, { xL: 1050, xR: 1150 }, { y0: 290, y1: 710, openTop: false, openBottom: false });
  const cmeta = cropped ? await sharp(cropped.png).metadata() : null;
  check("the printed date is cut out on its own: the dust and the stray stroke do not stretch the crop; its centre is where the digits are", !!cropped && Math.abs(cropped.cy - 400) < 4 && (cmeta?.width ?? 9999) < 400, JSON.stringify({ cy: cropped?.cy, w: cmeta?.width }));
  check("a blank cell gives nothing (the date is printed on the other side of a page break)", (await cropCellText({ data: blank(), width: W, height: H }, { xL: 1050, xR: 1150 }, { y0: 290, y1: 710, openTop: false, openBottom: false })) === null);

  // ================================================================== the whole roster, two pages
  // page 1: rows 1-12.  groups of 5: rows 1-5 | 6-10 | 11-15, the last cut by the page break (rows 11-12 here, 13-15 on page 2)
  // page 2: rows 13-25. group C continues (13-15, open top; its date is printed HERE), D = 16-20, E = 21-25 with a stray rule at y=700 cutting its cell
  const page1 = await drawPage({ top: 260, rows: 12, dateRules: [260 + 40 /*placeholder removed below*/], inks: [] });
  void page1;
  const p1 = await drawPage({ top: 300, rows: 12, dateRules: [300, 500, 700], inks: [400, 600] });
  const p2 = await drawPage({ top: 300, rows: 13, dateRules: [420, 620, 700], inks: [360, 520, 760] });
  const asked: string[] = [];
  const dateQueue = ["01-01-25", "02-01-25", "11/012/25", "13-01-25", "14-01-25"];
  const deps = {
    ocrPageTsv: async (png: Buffer) => { void png; asked.push("page"); return asked.filter((a) => a === "page").length === 1 ? tsvFor(1, 12, "HEALTH CHECK UP SCHEDULE FOR THE MONTH OF JANUARY 2025") : tsvFor(13, 13); },
    ocrDateText: async () => dateQueue.shift() ?? "",
  };
  const res = await extractSchedule([p1, p2], deps);
  check("25 employees are read, in order, with their tickets and names", res.rows.length === 25 && res.rows.every((r, i) => r.serial === i + 1 && r.ticket === String(100001 + i) && r.name === `PERSON ${letters(i + 1)}`), JSON.stringify(res.rows.slice(0, 2)));
  check("the schedule month is read from the title: January 2025", JSON.stringify(res.scheduleMonth) === '{"month":1,"year":2025}');
  const dates = res.rows.map((r) => r.checkupDate);
  const want = [...Array(5).fill("2025-01-01"), ...Array(5).fill("2025-01-02"), ...Array(5).fill("2025-01-11"), ...Array(5).fill("2025-01-13"), ...Array(5).fill("2025-01-14")];
  check("EVERY row gets the date of the merged cell it sits in (5 + 5 + 5 + 5 + 5)", JSON.stringify(dates) === JSON.stringify(want), JSON.stringify(dates));
  check("the group cut by the page break: rows 11-12 (page 1) and 13-15 (page 2) get ONE date; the date was printed on page 2, so rows 11-12 say so", res.rows[10].checkupDate === "2025-01-11" && res.rows[11].checkupDate === "2025-01-11" && res.rows[10].dateFromOtherPage === true && res.rows[12].dateFromOtherPage === false);
  check("the typo date '11/012/25' is read as 11 Jan 2025 and the correction is recorded on its rows", res.rows[12].dateNote !== null && /only reading that fits/.test(String(res.rows[12].dateNote)) && res.rows[10].dateNote === res.rows[12].dateNote);
  check("the stray rule inside the last merged cell does not split it: rows 21-25 all have 2025-01-14", res.rows.slice(20).every((r) => r.checkupDate === "2025-01-14"));
  check("five groups of five, and nothing to warn about", res.groups.length === 5 && res.groups.every((g) => g.rows === 5) && res.warnings.length === 0, JSON.stringify([res.groups, res.warnings]));

  // -- the page-wide OCR drops the department-code column; the digit strips bring it back
  asked.length = 0;
  const q3 = ["01-01-25", "02-01-25", "11/012/25", "13-01-25", "14-01-25"];
  let stripCalls = 0;
  const stripFor = (cols: Array<{ first: number; n: number }>) => (png: Buffer) => {
    void png;
    const page = Math.floor(stripCalls / 3);
    const col = [0, 1, 3][stripCalls % 3];
    stripCalls++;
    const { first, n } = cols[page];
    const lines = ["1\t1\t0\t0\t0\t0\t0\t0\t90\t1200\t-1\t"];
    for (let i = 0; i < n; i++) {
      const sno = first + i;
      const text = col === 0 ? String(sno) : col === 1 ? String(100000 + sno) : String(30000 + sno);
      lines.push(`5\t1\t1\t1\t1\t${i + 1}\t5\t${4 + 40 * i}\t60\t24\t90\t${text}`);
    }
    return Promise.resolve(lines.join("\n"));
  };
  const viaStrips = await extractSchedule([p1, p2], {
    ocrPageTsv: async () => (asked.push("page"), asked.length === 1 ? tsvFor(1, 12, "HEALTH CHECK UP SCHEDULE FOR THE MONTH OF JANUARY 2025", false) : tsvFor(13, 13, undefined, false)),
    ocrDateText: async () => q3.shift() ?? "",
    ocrDigitsTsv: stripFor([{ first: 1, n: 12 }, { first: 13, n: 13 }]),
  });
  check("with the code column dropped by the page-wide OCR, every row still gets its department code (from the digit strips)", viaStrips.rows.length === 25 && viaStrips.rows.every((r, i) => r.departmentCode === String(30001 + i)), JSON.stringify(viaStrips.rows.slice(0, 2).map((r) => r.departmentCode)));
  check("...and the dates and groups are unaffected", viaStrips.groups.length === 5 && viaStrips.warnings.length === 0);

  // -- a date that does not fit the schedule is never stored as if it were fine
  const q2 = ["01-01-25", "02-02-25", "02-02-25" /* the second try of the same cell */, "11/012/25", "13-01-25", "14-01-25"];
  asked.length = 0;
  const bad = await extractSchedule([p1, p2], { ...deps, ocrDateText: async () => q2.shift() ?? "" });
  check("a date of another month (02-02-25 in a January schedule) leaves its rows WITHOUT a date, and the run says so", bad.rows.slice(5, 10).every((r) => r.checkupDate === null) && bad.warnings.some((w) => /no check-up date/.test(w)), JSON.stringify(bad.warnings));

  // ================================================================== HR verification
  const hr: HrEmployee[] = [
    { ticket: "100001", name: "SANJAY ROY", codes: ["sanjai", "roi"], departmentCode: "32100" },
    { ticket: "100002", name: "AMIT KUMAR DAS", codes: ["amit", "kumar", "das"], departmentCode: "32000" },
    { ticket: "100003", name: "P O ROY", codes: ["roi"], departmentCode: "32000" },
    { ticket: "100004", name: "RITA SEN", codes: ["rita", "sen"], departmentCode: "85110" },
    { ticket: "100005", name: "RITA SEN", codes: ["rita", "sen"], departmentCode: "85110" }, // a namesake in the same department
    { ticket: "100006", name: "MANOJ KUMAR ROY", codes: ["manoj", "kumar", "roi"], departmentCode: "46000" },
    { ticket: "100007", name: "SUBHAS KUMAR ROY", codes: ["subhas", "kumar", "roi"], departmentCode: "46000" },
  ];
  const mk = (ticket: string | null, name: string, code: string, seq: number) => ({ page: 1, seq, serial: seq, ticket, name, departmentCode: code, department: "X", datePrinted: null, checkupDate: "2025-01-13", dateNote: null, dateFromOtherPage: false });
  check("name fit: same words = exact; one shared word of a one-word name = partial; unrelated = none", nameFit(["sanjai", "roi"], ["sanjai", "roi"]) === "exact" && nameFit(["pere", "paden", "ouseph", "roi"], ["roi"]) === "partial" && nameFit(["rita", "sen"], ["amit", "kumar", "das"]) === "none" && nameFit([], ["roi"]) === "none");
  check("...and two of three words is only partial (SUBIR KUMAR ROY is not SUBHAS KUMAR ROY)", nameFit(["subir", "kumar", "roi"], ["subhas", "kumar", "roi"]) === "partial");
  const rowsH = [
    mk("100001", "SANJAY ROY", "32100", 1), // verified
    mk("100002", "AMIT KR DAS", "32000", 2), // KR is not a code word: still all of the shorter name matches? -> see below
    mk("100003", "PERE PADEN OUSEPH ROY", "32000", 3), // partial name, department agrees -> verified
    mk("999999", "SANJAY ROY", "32100", 4), // ticket unknown, but ONE person has this name and department -> corrected (and 100001 is then duplicated)
    mk("100004", "RITA SEN", "85110", 5), // ticket fine -> verified
    mk(null, "RITA SEN", "85110", 6), // no ticket, TWO namesakes in the department -> unverified
    mk("100006", "SUBIR KUMAR ROY", "46000", 7), // ticket exists, name only partly fits (someone else's ticket?) and department agrees -> verified partial
    mk("100007", "MIHIR KUMAR ROY", "99999", 8), // partial name and a different department -> unverified
  ];
  const codes: string[][] = [["sanjai", "roi"], ["amit", "das"], ["pere", "paden", "ouseph", "roi"], ["sanjai", "roi"], ["rita", "sen"], ["rita", "sen"], ["subir", "kumar", "roi"], ["mihir", "kumar", "roi"]];
  const v = verifyAgainstHr(rowsH, codes, hr);
  const st = v.map((r) => r.status);
  check("a ticket whose person's name fits is VERIFIED", v[0].status === "verified" && v[0].ticketNo === "100001" && v[4].status === "verified");
  check("a partial name fit is accepted only when the department agrees (P O ROY / PERE PADEN OUSEPH ROY in 32000)", v[2].status === "verified" && v[2].ticketNo === "100003");
  check("a partial fit with a DIFFERENT department is NOT verified", v[7].status === "unverified" && v[7].ticketNo === null && /does not fit/.test(String(v[7].statusNote)), String(v[7].statusNote));
  check("a person with two namesakes in the same department can not be identified: unverified, and it says why", v[5].status === "unverified" && /2 HR employees share this name and department/.test(String(v[5].statusNote)), String(v[5].statusNote));
  check("an abbreviation in the printed name (AMIT KR DAS for AMIT KUMAR DAS) still verifies", v[1].status === "verified" && v[1].ticketNo === "100002");
  const solo = verifyAgainstHr([mk("999998", "AMIT KUMAR DAS", "32000", 1)], [["amit", "kumar", "das"]], hr)[0];
  check("a misread ticket (999998, not an employee) is CORRECTED to the ONE HR employee with that name and department, and the correction is recorded", solo.status === "corrected" && solo.ticketNo === "100002" && /only HR employee with this name and department/.test(String(solo.statusNote)) && solo.ticket === "999998", JSON.stringify(solo));
  const stranger = verifyAgainstHr([mk("999997", "ZELDA UNKNOWN", "11111", 1)], [["zelda", "unknown"]], hr)[0];
  check("a person who matches nobody stays unverified, with the ticket as read kept and the reason given", stranger.status === "unverified" && stranger.ticketNo === null && stranger.ticket === "999997" && /not in the HR directory/.test(String(stranger.statusNote)), JSON.stringify(stranger));
  const noTicket = verifyAgainstHr([mk(null, "AMIT KUMAR DAS", "32000", 1)], [["amit", "kumar", "das"]], hr)[0];
  check("no readable ticket at all, but a unique name+department: corrected from the name", noTicket.status === "corrected" && noTicket.ticketNo === "100002");
  const dup = v.filter((r) => r.ticketNo === "100001");
  check("one person is never called twice in a schedule: the stronger row keeps the ticket, the other is flagged as a duplicate", dup.length === 1 && v[0].ticketNo === "100001" && v[3].status === "unverified" && /appears twice/.test(String(v[3].statusNote)), JSON.stringify(st));
  check("every row keeps what was read from the page (ticket as printed, name as printed)", v.every((r, i) => r.ticket === rowsH[i].ticket && r.name === rowsH[i].name));

  console.log(`\nschedule selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

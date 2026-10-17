// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/ingestion/ruledTable.selftest.ts
// The grid logic is tested on pages drawn here with a scripted cell reader (no engine). The last block reads the REAL wage-notice page with
// the REAL engine when its language data can be found (set OCR_LANG_PATH to a folder holding eng.traineddata, or have internet).

import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import {
  UNCLEAR, cleanCell, cluster, deskew, detectTables, estimateSkew, isNumericLike, isNumericText, keepWellRead, loadPage, lookAlike, parseTsvWords, readRuledTables, rowsAreNotRuled,
  textLines, textOfWords, tsvWithout, vote, wordRetention, withoutTableWords, boxBackToInput,
  type CellOcr, type TableReading, type TsvWord,
} from "./ruledTable";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const eq = (name: string, got: unknown, want: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

// ---------------------------------------------------------------- pages drawn here
const W = 1200, H = 1000;
const rect = (x: number, y: number, w: number, h: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black"/>`;
const hline = (y: number, x0: number, x1: number) => rect(x0, y - 2, x1 - x0, 4);
const vline = (x: number, y0: number, y1: number) => rect(x - 2, y0, 4, y1 - y0);
const blob = (cx: number, cy: number) => rect(cx - 30, cy - 8, 60, 16); // "ink" in a cell
const png = async (parts: string[]) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="white"/>${parts.join("")}</svg>`)).png().toBuffer();

// A wage-like table: first column "Area" merged over both heading rows; a group heading over columns 1-3; "Daily" merged over both heading rows;
// then three data rows. Columns at x = 100, 300, 500, 700, 900, 1100; rows at y = 100, 150, 200, 300, 400, 500.
const XS = [100, 300, 500, 700, 900, 1100];
function wageTable(): string[] {
  const p: string[] = [];
  p.push(hline(100, 100, 1100), hline(150, 300, 900), hline(200, 100, 1100), hline(300, 100, 1100), hline(400, 100, 1100), hline(500, 100, 1100));
  for (const x of [100, 300, 900, 1100]) p.push(vline(x, 100, 500));
  for (const x of [500, 700]) p.push(vline(x, 150, 500));
  // ink in every cell that has text
  const cell = (c: number, r: number, ys: number[]) => blob((XS[c] + XS[c + 1]) / 2, (ys[r] + ys[r + 1]) / 2);
  const rowY = [100, 150, 200, 300, 400, 500];
  p.push(blob(200, 150), blob(600, 125), blob(1000, 150)); // Area, the group heading, Daily
  for (const c of [1, 2, 3]) p.push(cell(c, 1, rowY));       // Basic, VDA, Total
  for (let r = 2; r < 5; r++) for (let c = 0; c < 5; c++) p.push(cell(c, r, rowY));
  return p;
}

// What the scripted reader returns for a cell, by the cell's first row and column in the grid (rows 0-4, columns 0-4)
const TEXT: Record<string, string> = {
  "0,0": "Area", "0,1": "CONSTITUENT OF MONTHLY WAGES", "0,4": "Daily Wages (Rs. Per Day)",
  "1,1": "BASIC", "1,2": "VDA", "1,3": "TOTAL",
  "2,0": "WORKS", "2,1": "3350.00", "2,2": "13478.00", "2,3": "20995.30", "2,4": "808",
  "3,0": "PROJECTS", "3,1": "3350.00", "3,2": "13478.00", "3,3": "19245.30", "3,4": "740",
  "4,0": "TOWN SERV", "4,1": "3250.00", "4,2": "13450.00", "4,3": "21040.40", "4,4": "809",
};
const scripted = (over: Record<string, string[]> = {}): CellOcr => async (_png, m) => {
  const key = `${m.row},${m.col}`;
  const o = over[key];
  if (o) return o[Math.min(m.pass, o.length - 1)];
  return TEXT[key] ?? "";
};

(async () => {
  // ---------------------------------------------------------------- the small helpers
  eq("cluster merges positions within the tolerance", cluster([100, 103, 200, 201, 202, 305], 5), [102, 201, 305]);
  eq("cleanCell strips grid-line characters at the ends", cleanCell("  | 3350.00] "), "3350.00");
  eq("cleanCell keeps brackets inside a word", cleanCell("TOWN SERV(ELECT)"), "TOWN SERV(ELECT)");
  ok("a number is numeric", isNumericText("13478.00") && isNumericText("10:00") && isNumericText("1,000/-".replace("/-", "")));
  ok("a word is not numeric", !isNumericText("WORKS") && !isNumericText(""));
  eq("look-alike letters become digits", lookAlike("8O8"), "808");
  ok("'8O8' is a number (it must be voted on, not stored as a word)", isNumericLike("8O8") && isNumericLike("l5") && !isNumericLike("Oxygen Plant") && !isNumericLike("TOWN"));
  eq("vote: two agree", vote(["808", "808"]), "808");
  eq("vote: a majority of three", vote(["808", "8O8", "808"]), "808");
  eq("vote: no majority", vote(["808", "809", "800"]), null);

  // ---------------------------------------------------------------- finding the grid
  const img = await png(wageTable());
  const page = await loadPage(img);
  const tables = detectTables(page);
  eq("one table is found", tables.length, 1);
  const t = tables[0];
  eq("its columns", t.xs, XS);
  eq("its rows", t.ys, [100, 150, 200, 300, 400, 500]);
  ok("its box is the outer frame", Math.abs(t.bbox.x0 - 100) <= 3 && Math.abs(t.bbox.x1 - 1100) <= 3 && Math.abs(t.bbox.y0 - 100) <= 3 && Math.abs(t.bbox.y1 - 500) <= 3, JSON.stringify(t.bbox));
  const has = (r0: number, r1: number, c0: number, c1: number) => t.regions.some((g) => g.r0 === r0 && g.r1 === r1 && g.c0 === c0 && g.c1 === c1);
  ok("the first column's heading is ONE cell over both heading rows (merged)", has(0, 1, 0, 0));
  ok("the group heading is ONE cell over three columns (merged)", has(0, 0, 1, 3));
  ok("'Daily' is ONE cell over both heading rows (merged)", has(0, 1, 4, 4));
  ok("the sub-headings are separate cells", has(1, 1, 1, 1) && has(1, 1, 2, 2) && has(1, 1, 3, 3));
  ok("the data cells are separate cells", has(2, 2, 0, 0) && has(4, 4, 4, 4));
  eq("the number of cells", t.regions.length, 3 + 3 + 15);

  // a stray letter stroke that touches a row line must not become a column boundary (it cut "Doljatra" into "Dol | atra")
  const stray = await png([...wageTable(), vline(400, 202, 244), hline(160, 320, 460)]);
  const st = detectTables(await loadPage(stray));
  eq("a short stroke inside a cell is not a column boundary", st.length === 1 ? st[0].xs : "no table", XS);
  eq("...and a short dash inside a cell is not a row boundary", st.length === 1 ? st[0].ys : "no table", [100, 150, 200, 300, 400, 500]);
  eq("...so the number of cells is unchanged", st.length === 1 ? st[0].regions.length : -1, 3 + 3 + 15);

  // the REAL case: a column of left-aligned words (their first letters stand at one x and add up to a long vertical edge) plus one tall stroke
  const manyRows: string[] = [];
  const ysMany = Array.from({ length: 11 }, (_, k) => 100 + 60 * k);
  for (const y of ysMany) manyRows.push(hline(y, 100, 1000));
  for (const x of [100, 400, 700, 1000]) manyRows.push(vline(x, 100, 700));
  for (let k = 0; k < 10; k++) manyRows.push(rect(420, ysMany[k] + 17, 70, 26), blob(250, ysMany[k] + 30), blob(850, ysMany[k] + 30));
  manyRows.push(vline(421, 302, 342)); // a letter stroke that touches a row line
  const mt = detectTables(await loadPage(await png(manyRows)));
  eq("left-aligned words plus a tall stroke do not make a column boundary", mt.length === 1 ? mt[0].xs : "no table", [100, 400, 700, 1000]);
  eq("...and the table keeps its 10 x 3 cells plus the heading row", mt.length === 1 ? mt[0].regions.length : -1, 10 * 3);

  // ---------------------------------------------------------------- reading it
  const res = await readRuledTables(img, scripted());
  eq("one table is read and used", res.tables.length, 1);
  const lines = res.text.split("\n");
  eq("the heading line is the group heading", lines[1], "Heading: CONSTITUENT OF MONTHLY WAGES");
  eq("a data row has every column labelled", lines[2], "Area: WORKS | BASIC: 3350.00 | VDA: 13478.00 | TOTAL: 20995.30 | Daily Wages (Rs. Per Day): 808");
  eq("the other rows", [lines[3], lines[4]], [
    "Area: PROJECTS | BASIC: 3350.00 | VDA: 13478.00 | TOTAL: 19245.30 | Daily Wages (Rs. Per Day): 740",
    "Area: TOWN SERV | BASIC: 3250.00 | VDA: 13450.00 | TOTAL: 21040.40 | Daily Wages (Rs. Per Day): 809",
  ]);
  ok("the text is wrapped as a table", lines[0] === "[TABLE]" && lines[lines.length - 1] === "[/TABLE]");
  eq("the counts", [res.tables[0].dataRows, res.tables[0].unclear, res.tables[0].numericCells], [3, 0, 12]);

  // the numbers are VOTED on
  const noisy = await readRuledTables(img, scripted({ "2,4": ["8O8", "808", "808"], "3,3": ["19245.30", "19245.30"], "4,2": ["13450.00", "13450.00"] }));
  ok("a misread (8O8) is outvoted by the other readings", noisy.text.includes("Daily Wages (Rs. Per Day): 808"), noisy.text);
  const unsure = await readRuledTables(img, scripted({ "3,3": ["19245.30", "19246.30", "19245.80"] }));
  ok("a number the readings cannot agree on is written [unclear]", unsure.text.includes(`TOTAL: ${UNCLEAR}`) && unsure.tables[0].unclear === 1, unsure.text);
  ok("...and the other numbers of that row are still there", unsure.text.includes("Daily Wages (Rs. Per Day): 740"));
  const messy = await readRuledTables(img, scripted(Object.fromEntries(["2,1", "2,2", "2,3", "2,4", "3,1", "3,2", "3,3", "3,4", "4,1", "4,2"].map((k) => [k, ["111", "222", "333"]]))));
  ok("a table with too many unclear numbers is NOT used (the page is left to the page reading)", messy.tables.length === 0 && messy.maskedPng === null && messy.skipped.some((x) => /unclear/.test(x)), JSON.stringify(messy.skipped));
  const textual = await readRuledTables(img, async (_p, m) => (m.row === 2 && m.col === 0 ? "WORKS" : ""));
  ok("a table that is mostly empty cells is NOT used", textual.tables.length === 0, JSON.stringify(textual.skipped));

  // a doubtful text cell is read again with the other reader, and the more confident reading wins
  const first: CellOcr = async (_p, m) => (m.row === 2 && m.col === 0 ? { text: "Wet = mp ATAat", conf: 31 } : TEXT[`${m.row},${m.col}`] ?? "");
  const alt: CellOcr = async () => ({ text: "\u0915\u093E\u092E\u0917\u093E\u0930", conf: 88 });
  const bil = await readRuledTables(img, first, { alt });
  ok("a doubtful text cell takes the other reader's reading when it is more confident", bil.text.includes("Area: \u0915\u093E\u092E\u0917\u093E\u0930 |"), bil.text);
  const keep = await readRuledTables(img, first, { alt: async () => ({ text: "worse", conf: 10 }) });
  ok("...and keeps its own when the other reader is less confident", keep.text.includes("Area: Wet = mp ATAat |"), keep.text);

  // ---------------------------------------------------------------- the picture the page reading will see
  ok("the table is whited out of the picture for the page reading", res.maskedPng !== null);
  const masked = await loadPage(res.maskedPng as Buffer);
  const inside = [200, 600, 1000].every((x) => [125, 250, 350, 450].every((y) => masked.gray[y * masked.W + x] > 200));
  ok("...everywhere inside the table, lines and text", inside);
  const outside = await png([...wageTable(), blob(600, 800)]);
  const res2 = await readRuledTables(outside, scripted());
  const m2 = await loadPage(res2.maskedPng as Buffer);
  ok("...and the text outside the table is kept", m2.gray[800 * m2.W + 600] < 100 && m2.gray[125 * m2.W + 600] > 200);

  // ---------------------------------------------------------------- pages that are NOT ruled tables are left alone
  const plain = await png([hline(200, 300, 900), blob(600, 150), blob(600, 300), blob(500, 600)]);
  const r3 = await readRuledTables(plain, scripted());
  ok("an underlined title is not a table: nothing is changed", r3.tables.length === 0 && r3.maskedPng === null && r3.text === "");
  const blank = await png([]);
  const r4 = await readRuledTables(blank, scripted());
  ok("a blank page is left alone", r4.tables.length === 0 && r4.maskedPng === null);
  const frame = await png([hline(100, 100, 1100), hline(500, 100, 1100), vline(100, 100, 500), vline(1100, 100, 500), blob(600, 300)]);
  eq("a plain frame around a paragraph (one cell) is not a table", detectTables(await loadPage(frame)).length, 0);
  const r5 = await readRuledTables(Buffer.from("not an image"), scripted());
  ok("a damaged picture does not crash: the page is left to the page reading", r5.tables.length === 0 && r5.maskedPng === null);

  // ---------------------------------------------------------------- rows that are not ruled
  // header ruled; below it ONE band holding five lines of text in each of two columns: the rows are visible but not separated by lines
  const loose: string[] = [hline(100, 100, 900), hline(180, 100, 900), hline(600, 100, 900), vline(100, 100, 600), vline(400, 100, 600), vline(900, 100, 600), blob(250, 140), blob(650, 140)];
  for (let i = 0; i < 6; i++) loose.push(blob(250, 230 + i * 60), blob(650, 230 + i * 60));
  const looseImg = await png(loose);
  const lp = await loadPage(looseImg);
  const lt = detectTables(lp);
  ok("such a table is found as a grid", lt.length === 1);
  ok("...recognised as having rows that are not ruled", lt.length === 1 && rowsAreNotRuled(lp, lt[0]));
  ok("...and has six lines in each of its cells", lt.length === 1 && textLines(lp, { x0: 110, y0: 190, x1: 390, y1: 590 }) === 6);
  const r6 = await readRuledTables(looseImg, async () => "x");
  ok("...so it is left to the page reading (which keeps each row on its line)", r6.tables.length === 0 && r6.skipped.some((x) => /not separated by lines/.test(x)), JSON.stringify(r6.skipped));
  ok("a properly ruled table is NOT mistaken for one", !rowsAreNotRuled(page, t));

  // ---------------------------------------------------------------- a tilted page
  for (const deg of [0.8, -1.2]) {
    const tilted = await sharp(img).rotate(deg, { background: "#ffffff" }).png().toBuffer();
    const tp = await loadPage(tilted);
    const est = estimateSkew(tp);
    ok(`a page tilted by ${deg} degrees is measured within 0.15 degrees`, Math.abs(est - deg) <= 0.15, `estimated ${est}`);
    const before = detectTables(tp);
    const rt = await readRuledTables(tilted, scripted());
    ok(`...and its table is read once the page is straightened (found without it: ${before.length})`, rt.tables.length === 1 && rt.text.includes("Daily Wages (Rs. Per Day): 808") && rt.text.includes("Area: TOWN SERV"), JSON.stringify(rt.skipped));
    const back = await loadPage(await deskew(tilted, -est));
    ok("...deskew turns it back to level", Math.abs(estimateSkew(back)) <= 0.15);
    // the box of the table is returned in the picture that was GIVEN (the tilted one), where the page reading's words stand
    const tw = (await sharp(tilted).metadata()), cw = (await sharp(img).metadata());
    const t0 = (deg * Math.PI) / 180, cs = Math.cos(t0), sn = Math.sin(t0);
    const fwd = (x: number, y: number) => ({ x: (tw.width as number) / 2 + (x - (cw.width as number) / 2) * cs - (y - (cw.height as number) / 2) * sn, y: (tw.height as number) / 2 + (x - (cw.width as number) / 2) * sn + (y - (cw.height as number) / 2) * cs });
    const cornersT = [fwd(100, 100), fwd(1100, 100), fwd(100, 500), fwd(1100, 500)];
    const want = { x0: Math.min(...cornersT.map((c) => c.x)), y0: Math.min(...cornersT.map((c) => c.y)), x1: Math.max(...cornersT.map((c) => c.x)), y1: Math.max(...cornersT.map((c) => c.y)) };
    const got = rt.tables[0]?.bbox;
    ok(`...and its box comes back within 10 pixels in the tilted picture (${deg} degrees)`, !!got && Math.abs(got.x0 - want.x0) <= 10 && Math.abs(got.y0 - want.y0) <= 10 && Math.abs(got.x1 - want.x1) <= 10 && Math.abs(got.y1 - want.y1) <= 10, JSON.stringify({ got, want }));
  }
  eq("a level page is measured as level", estimateSkew(page), 0);
  eq("a page with almost no ink is not 'measured'", estimateSkew(await loadPage(blank)), 0);

  // ---------------------------------------------------------------- the page reading's words, and checking a table against them
  const tsv = [
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
    "5\t1\t1\t1\t1\t1\t100\t100\t80\t20\t96\tSchedule",
    "5\t1\t1\t1\t1\t2\t200\t100\t60\t20\t95\tof",
    "5\t1\t1\t1\t2\t1\t100\t140\t90\t20\t91\tEnrolment",
    "5\t1\t2\t1\t1\t1\t100\t300\t80\t20\t90\tTraffic",
    "5\t1\t2\t1\t1\t2\t200\t300\t80\t20\t88\tPower",
    "5\t1\t2\t1\t2\t1\t100\t340\t80\t20\t30\tgarbage",
    "5\t1\t3\t1\t1\t1\t900\t900\t80\t20\t95\tFooter",
    "4\t1\t3\t1\t1\t0\t900\t900\t80\t20\t-1\t",
  ].join("\n");
  const words = parseTsvWords(tsv);
  eq("the words of a TSV are read (word lines only)", words.map((w) => w.text), ["Schedule", "of", "Enrolment", "Traffic", "Power", "garbage", "Footer"]);
  eq("a page text is rebuilt line by line, with a blank line between blocks", textOfWords(words), "Schedule of\nEnrolment\n\nTraffic Power\ngarbage\n\nFooter\n");
  const box = { x0: 90, y0: 290, x1: 400, y1: 370 };
  const mkT = (text: string, bbox = box): TableReading => ({ bbox, rows: 3, cols: 2, text, cells: 6, numericCells: 0, unclear: 0, emptyCells: 0, dataRows: 2 });
  // cutting a table out of the page text: inside its box the table reading is the only source of NUMBERS; words without a digit all STAY
  const cut = withoutTableWords(words, [mkT("[TABLE]\nTraffic: x\n[/TABLE]")]);
  eq("words inside a table's box STAY, even those the table reading also has (the page reading often reads a name better than a cell)", cut.words.map((w) => w.text), ["Schedule", "of", "Enrolment", "Traffic", "Power", "garbage", "Footer"]);
  const mk = (i: number, text: string, left = 100): TsvWord => ({ lineNo: i, block: 1, par: 1, line: 1, left, top: 300, width: 80, height: 20, conf: 90, text });
  const numbers = [mk(0, "3350.00]"), mk(1, "27000]", 200), mk(2, "1924530", 300), mk(3, "808", 400), mk(4, "Remark", 500), mk(5, "5th", 600)];
  const dc = withoutTableWords(numbers, [mkT("[TABLE]\nBASIC: 3350.00 | Wages: 808\n[/TABLE]", { x0: 50, y0: 250, x1: 800, y1: 400 })]);
  eq("every page word with a digit inside the box is cut (the table reading is the only source of numbers: debris, a misread number, a right one)", dc.words.map((w) => w.text), ["Remark"]);
    const rest = withoutTableWords(words, [mkT("x")]);
  ok("a TSV with no digits inside the box loses no line", tsvWithout(tsv, rest.removed) === tsv && rest.removed.size === 0);
  eq("words outside every box are never cut", withoutTableWords(words, [mkT("[TABLE]\nSchedule\n[/TABLE]", { x0: 5000, y0: 5000, x1: 5100, y1: 5100 })]).words.length, words.length);
  eq("with no turn a box is unchanged", boxBackToInput({ x0: 100, y0: 100, x1: 1100, y1: 500 }, { deg: 0, W0: 1200, H0: 1000 }, 1200, 1000), { x0: 100, y0: 100, x1: 1100, y1: 500 });
  const many: TsvWord[] = Array.from({ length: 10 }, (_, i) => ({ lineNo: i, block: 1, par: 1, line: i, left: 100, top: 300 + i, width: 50, height: 10, conf: 92, text: ["Schedule", "enrolment", "traffic", "power", "location", "ground", "project", "building", "adjacent", "phase"][i] }));
  const full = mkT("[TABLE]\nschedule enrolment traffic power location ground project building adjacent phase\n[/TABLE]");
  const poor = mkT("[TABLE]\nSc. Phase\nRMHP: Sinter Plant | 298: 153\n[/TABLE]");
  ok("a table that keeps the words is kept", wordRetention(many, full).share === 1 && keepWellRead([full], many).kept.length === 1);
  const lost = keepWellRead([poor], many);
  ok("a table that keeps few of the words the page reading saw in it is NOT used", lost.kept.length === 0 && /kept only/.test(lost.skipped[0]), JSON.stringify(wordRetention(many, poor)));
  ok("unsure words (gibberish read from Hindi) do not count as words that cannot be lost", wordRetention([...many.slice(0, 6), ...Array.from({ length: 8 }, (_, i) => ({ lineNo: 20 + i, block: 1, par: 1, line: 20 + i, left: 100, top: 305, width: 50, height: 10, conf: 25, text: "sfear" + "abcdefgh"[i] }))], full).sure === 6);
  ok("with too few words to judge, a table is kept", keepWellRead([poor], many.slice(0, 3)).kept.length === 1);
  ok("words outside the table's box are not held against it", keepWellRead([mkT("[TABLE]\nx\n[/TABLE]", { x0: 5000, y0: 5000, x1: 5100, y1: 5100 })], many).kept.length === 1);

  // ---------------------------------------------------------------- the REAL page with the REAL engine (when it can run)
  const fixture = new URL("./__fixtures__/wage_notice_page.png", `file://${__filename}`).pathname;
  const langPath = process.env.OCR_LANG_PATH || (existsSync("/usr/share/tesseract-ocr/5/tessdata/eng.traineddata") ? "/usr/share/tesseract-ocr/5/tessdata" : "");
  if (existsSync(fixture) && (langPath || process.env.OCR_ONLINE === "1")) {
    try {
      const Tesseract = (await import("tesseract.js")).default;
      const worker = await Tesseract.createWorker("eng", 1, langPath ? ({ langPath, gzip: false, cachePath: "/tmp/ocr-selftest-cache" } as any) : undefined);
      await worker.setParameters({ tessedit_pageseg_mode: "6" as any, user_defined_dpi: "300" as any });
      const real: CellOcr = async (p) => { const { data } = await worker.recognize(p, {}, { text: true }); return { text: data.text || "", conf: Number(data.confidence ?? 0) }; };
      const rr = await readRuledTables(readFileSync(fixture), real);
      await worker.terminate();
      ok("REAL PAGE: the wage notice's table is found and used", rr.tables.length === 1, JSON.stringify(rr.skipped));
      const rows = rr.text.split("\n").filter((l) => /^SL\.: \d/.test(l));
      eq("REAL PAGE: three data rows", rows.length, 3);
      const want = [["WORKS", "3350.00", "20995.30", "808"], ["PROJECTS", "3350.00", "19245.30", "740"], ["TOWN", "3250.00", "21040.40", "809"]];
      want.forEach((w, i) => ok(`REAL PAGE: row ${i + 1} (${w[0]}) has every figure right`, w.every((x) => (rows[i] ?? "").includes(x)), rows[i] ?? "(missing)"));
      ok("REAL PAGE: the daily wage is under a column labelled as daily wages", rows.every((r) => /Daily Wages[^|]*: \d{3}$/.test(r)), rows.join(" // "));
      ok("REAL PAGE: no grid-line characters in the numbers", !/\d\]|\[\d|\d_/.test(rr.text), rr.text);
      ok("REAL PAGE: the picture for the page reading has the table removed", rr.maskedPng !== null);

      // the WHOLE OCR step: page reading, table check, table cut out of the page text, tables added
      const { ocrPageDual } = await import("./ocr");
      const w3 = await Tesseract.createWorker("eng", 1, langPath ? ({ langPath, gzip: false, cachePath: "/tmp/ocr-selftest-cache" } as any) : undefined);
      await w3.setParameters({ tessedit_pageseg_mode: "3" as any });
      const page3 = await ocrPageDual(readFileSync(fixture), "wage fixture", { eng: w3, "hin+eng+ben": w3 } as any);
      await w3.terminate();
      ok("WHOLE STEP: the table was read cell by cell and used", page3.ruledTables === 1, `ruledTables=${page3.ruledTables}`);
      ok("WHOLE STEP: the stored text has the three rows with the daily wage under its own column", /Daily Wages[^|\n]*: 808\b/.test(page3.text) && /Daily Wages[^|\n]*: 740\b/.test(page3.text) && /Daily Wages[^|\n]*: 809\b/.test(page3.text), page3.text.slice(-900));
      ok("WHOLE STEP: no damaged copy of the table is stored (no \"3350.00]\", no \"27000]\")", !/\d\]|\[\d/.test(page3.text), page3.text.split("\n").filter((l) => /\d\]/.test(l)).join(" // "));
      ok("WHOLE STEP: the rest of the page is still there", /Minimum Rate of Wages/i.test(page3.text) && /weekly days of rest/i.test(page3.text) && /Non-works area/i.test(page3.text));
      ok("WHOLE STEP: each daily wage appears once (the table is not stored twice)", (page3.text.match(/: 808\b/g) ?? []).length === 1, String((page3.text.match(/: 808\b/g) ?? []).length));
    } catch (e) {
      console.log(`(the real-engine check was skipped: ${String((e as Error)?.message ?? e).slice(0, 100)})`);
    }
  } else {
    console.log("(the real-engine check was skipped: no OCR_LANG_PATH and no local language data)");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

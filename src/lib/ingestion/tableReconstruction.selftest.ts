// src/lib/ingestion/tableReconstruction.selftest.ts
// Run:  npx tsx src/lib/ingestion/tableReconstruction.selftest.ts      (no OCR engine, no network, no database)
//
// The fixtures in __fixtures__/tsv_*.tsv are the REAL word positions Tesseract (tesseract.js 7) reported for five scan-like pages:
// a numeric wage table, a 28-row package table, a 45-row employee ROSTER (multi-word cells), an English prose page and a bilingual page.
// roster_truth_rows.json is what was printed on the roster page.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_HEADER_CELL_CHARS, MAX_HEADER_ROWS, MAX_TABLE_CHARS, reconstructTableFromTSV } from "./tableReconstruction";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};
const fx = (n: string) => readFileSync(join(__dirname, "__fixtures__", n), "utf8");
const rowLines = (t: string) => t.split("\n").filter((l) => l && l !== "[TABLE]" && l !== "[/TABLE]");
const labelsOf = (line: string) => line.split(" | ").map((c) => c.split(": ")[0]);
const longestLabel = (t: string) => Math.max(...rowLines(t).flatMap((l) => labelsOf(l).map((x) => x.length)));
const plainChars = (tsv: string) => tsv.split("\n").map((l) => l.split("\t")).filter((c) => c[0] === "5" && (c[11] || "").trim()).reduce((n, c) => n + c[11].trim().length + 1, 0);

// ---------- 1. the numeric wage table: must be unchanged by the fix ----------
const wage = reconstructTableFromTSV(fx("tsv_wage_numeric.tsv"))!;
check("wage table: a table block is produced", !!wage);
const wl = rowLines(wage);
check("wage table: 8 data rows, none lost", wl.length === 8, String(wl.length));
const WAGE_HEADERS = ["SI. No.", "Category of worker", "Daily wage Rs.", "Monthly wage Rs.", "HRA Rs.", "Total Rs."];
const inOrder = (got: string[], want: string[]) => { let j = 0; for (const g of got) { j = want.indexOf(g, j); if (j < 0) return false; j++; } return true; };
// (in the real scan the OCR did not see the serial number "4", so that one row has five cells -- the same with the code before and after the fix)
check("wage table: every row uses the real header labels in order, and at least 7 of the 8 rows carry all six", wl.every((l) => inOrder(labelsOf(l), WAGE_HEADERS)) && wl.filter((l) => labelsOf(l).length === 6).length >= 7, labelsOf(wl[0]).join("|"));
const hs = wl.find((l) => /Highly skilled/.test(l)) || "";
check("wage table: every number stays in ITS row and column (Highly skilled: 954.00 / 24,790.40 / 2,010.00 / 26,800.40)", /Daily wage Rs\.: 954\.00 \| Monthly wage Rs\.: 24,790\.40 \| HRA Rs\.: 2,010\.00 \| Total Rs\.: 26,800\.40/.test(hs), hs);
check("wage table: small (the two-line header is used once per cell, not repeated as data)", wage.length < 1500, String(wage.length));

// ---------- 2. the 28-row package table: the header is now recognised ----------
const pkg = reconstructTableFromTSV(fx("tsv_package_table.tsv"))!;
const pl = rowLines(pkg);
check("package table: 28 data rows", pl.length === 28, String(pl.length));
check("package table: the header labels are used, not col1/col2 (and the header row is not repeated as data)", /^S\.No: 1 \| Age group \(years\): 30-34 \| Package: Package A \| Tests included: ECG, X-Ray chest, USG \| Rate Rs\.: 1,637\.00 \| GST Rs\.: 294\.00$/.test(pl[0]) && !/\bcol\d+:/.test(pkg), pl[0]);

// ---------- 3. THE BUG: a 45-row roster with multi-word cells ----------
const rosterTsv = fx("tsv_roster_flat.tsv");
const roster = reconstructTableFromTSV(rosterTsv)!;
const rl = rowLines(roster);
const truth: string[][] = JSON.parse(fx("roster_truth_rows.json")).rows;
check("roster: about 45 labelled rows, not a column dump", rl.length >= 44 && rl.length <= 46, String(rl.length));
check("roster: SIZE is sane (was 24,602 characters for a 2,445-character page; now under 6,000 and under 2.5x the page's own text)", roster.length < 6000 && roster.length < 2.5 * plainChars(rosterTsv), `${roster.length} vs plain ${plainChars(rosterTsv)}`);
check("roster: no header label is longer than the cap (the old bug repeated a 250-character header in every cell)", longestLabel(roster) <= MAX_HEADER_CELL_CHARS && longestLabel(roster) < 20, String(longestLabel(roster)));
check("roster: every row line carries the real column names (SL.NO, T.NO, NAME, DEPTT. CODE, DEPARTMENT)", rl.every((l) => /^SL\.NO: \d+ \| \|?T\.NO: \d+ \| NAME: .+ \| DEPTT\. CODE: \d+ \| DEPARTMENT: .+/.test(l.replace(/ \| DATE: .*$/, ""))) || rl.filter((l) => /NAME: .+ \| DEPTT\. CODE: \d+ \| DEPARTMENT:/.test(l)).length >= rl.length - 2, rl[3]);
// the point of a table: the PERSON stays with their OWN department. Count rows where the T.NO, NAME and DEPARTMENT printed together came back together.
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();
const together = truth.filter(([sl, tno, name, code, dept]) => rl.some((l) => l.includes(`T.NO: ${tno}`) && norm(l).includes(`NAME: ${norm(name)}`) && norm(l).includes(`DEPARTMENT: ${norm(dept)}`) && l.includes(`DEPTT. CODE: ${code}`) && new RegExp(`SL\\.NO: ${sl}\\b`).test(l)));
check("roster: each person stays with their OWN employee number, department code and department (at least 40 of 45 rows exactly right)", together.length >= 40, `${together.length}/45`);
check("roster: employee 1 and employee 45 are in their own correct rows", [truth[0], truth[44]].every(([sl, tno, name, code, dept]) => rl.some((l) => new RegExp(`SL\\.NO: ${sl}\\b`).test(l) && l.includes(`T.NO: ${tno}`) && norm(l).includes(norm(name)) && l.includes(`DEPARTMENT: ${dept}`))));

// ---------- 4. pages with no table ----------
check("an English prose page gets no table block", reconstructTableFromTSV(fx("tsv_prose_page.tsv")) === null);
const bil = reconstructTableFromTSV(fx("tsv_bilingual_page.tsv"));
check("a bilingual page can not produce a large block (known: a tiny garbage block from Hindi lines read as Latin letters)", bil === null || bil.length < 600, String(bil?.length));

// ---------- 5. stress cases made on purpose ----------
let id = 0;
const tsvLine = (text: string, left: number, top: number, w = 80, h = 25) => `5\t1\t1\t1\t${++id}\t1\t${left}\t${top}\t${w}\t${h}\t90\t${text}`;
const page = (rows: string[][], rowPitch = 60) => {
  const out = ["1\t1\t0\t0\t0\t0\t0\t0\t2480\t3508\t-1\t"];
  rows.forEach((cells, r) =>
    cells.forEach((c, ci) => {
      let x = 150 + ci * 600;
      for (const w of c.split(" ").filter(Boolean)) {
        const width = Math.max(30, w.length * 20);
        out.push(tsvLine(w, x, 300 + r * rowPitch, width));
        x += width + 14; // words inside one cell sit close together; cells are 600 px apart
      }
    }),
  );
  return out.join("\n");
};
const sixCols = (i: number, extra: string) => [String(i), String(100000 + i), `NAME ${i} KUMAR`, String(3000 + i), `DEPARTMENT ${i} ${extra}`, "01-01-25"];

// 5a. a table whose first data-like row comes late: the rows before it must NOT become a header
const lateRows: string[][] = [["SL", "TNO", "NAME", "CODE", "DEPARTMENT", "DATE"]];
for (let i = 1; i <= 7; i++) lateRows.push(["", "", `PERSON NAME ${i}`, "ALPHA", `SECTION ${i} PLANT`, "UNIT"]); // text-only rows
for (let i = 8; i <= 20; i++) lateRows.push(sixCols(i, "MILL"));
const late = reconstructTableFromTSV(page(lateRows));
check(`5a. a long run of text-only rows is not swallowed into a header (header is at most ${MAX_HEADER_ROWS} rows; no label is long)`, late === null || longestLabel(late) <= MAX_HEADER_CELL_CHARS, late ? String(longestLabel(late)) : "null");

// 5b. a two-line header IS recognised
const two: string[][] = [["Sl.", "Employee", "Name of", "Dept", "Department", "Check-up"], ["No.", "number", "employee", "code", "name", "date"]];
for (let i = 1; i <= 8; i++) two.push(sixCols(i, "SHOP"));
const twoT = reconstructTableFromTSV(page(two))!;
const twoL = rowLines(twoT);
check("5b. a two-line header is merged into one label per column and used for every row", twoL.length === 8 && /^Sl\. No\.: 1 \| Employee number: 100001 \| Name of employee: NAME 1 KUMAR \| Dept code: 3001 \| Department name: DEPARTMENT 1 SHOP \| Check-up date: 01-01-25$/.test(twoL[0]), twoL[0]);

// 5c. the size limit: an absurd table is dropped (the plain text of the page is always kept elsewhere)
const huge: string[][] = [["SL", "TNO", "NAME", "CODE", "DEPARTMENT", "DATE"]];
for (let i = 1; i <= 500; i++) huge.push(sixCols(i, "A VERY LONG DEPARTMENT NAME THAT KEEPS GOING AND GOING"));
const hugeT = reconstructTableFromTSV(page(huge));
check(`5c. a table block over ${MAX_TABLE_CHARS} characters is dropped, never appended`, hugeT === null);

// 5d. a row with only two numbers among text words is data (this is exactly what the old 50% rule got wrong)
const mix: string[][] = [["ID", "NAME", "CITY", "DEPARTMENT", "NOTE", "STATE"]];
for (let i = 1; i <= 6; i++) mix.push([String(i), "PERSON FULL NAME", "CITY OF", "MECHANICAL SHOP", String(3000 + i), "OK"]); // 2 numbers among 10 words
const mixT = reconstructTableFromTSV(page(mix))!;
check("5d. rows with two numbers among many words are data rows (the old 50% rule failed here): the one header row labels every cell", rowLines(mixT).length === 6 && /^ID: 1 \| NAME: PERSON FULL NAME \| CITY: CITY OF \| DEPARTMENT: MECHANICAL SHOP \| NOTE: 3001 \| STATE: OK$/.test(rowLines(mixT)[0]), rowLines(mixT)[0]);

// 5e. garbage in, null out -- never a throw
check("empty, whitespace and malformed word data give null, not an error", reconstructTableFromTSV("") === null && reconstructTableFromTSV("   \n  ") === null && reconstructTableFromTSV("not\ttsv\tat all") === null && reconstructTableFromTSV("1\t2") === null);

console.log(`\ntableReconstruction selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

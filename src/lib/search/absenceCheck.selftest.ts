// src/lib/search/absenceCheck.selftest.ts  (run: npx tsx --tsconfig tsconfig.selftest.json src/lib/search/absenceCheck.selftest.ts)
// The fixture lines are copied from the stored text of the real holiday circulars (71 = 2025, 72 = 2024, 81 = 2026), including the real G01 failure:
// the briefing wrote "Not stated in circular" for Bhatridwitiya under 2025, and circular 71 lists it.
import { checkAbsences, describeDifferences, distinctiveWords, dropContradictedClaims, readable, sourcesOfColumn, type AbsenceFix, type AbsenceSource } from "./absenceCheck";

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") { if (ok) passed++; else { failed++; console.log(`  FAIL  ${name}${detail ? " -- " + detail : ""}`); } }
/** A numbered list of restricted holidays as the circulars print it: every serial from 1 to `max`, the named ones filled in, the others plain fillers (a list with gaps is not a list a kind can be read from). */
function rhEntries(named: Record<number, [string, string, string]>, max: number, form = "SL. No.: "): string {
  const out: string[] = [];
  for (let n = 1; n <= max; n++) { const [h, d, day] = named[n] ?? [`Filler holiday ${n}`, "1st January", "Monday"]; out.push(`${form}${n} | HOLIDAYS: ${h} | DATE: ${d} | Day: ${day}`); }
  return out.join(" ");
}


const c71: AbsenceSource = { id: 71, headline: "CIRCULAR HOLIDAY LIST FOR THE YEAR 2025", text: "Category B employees: One Closed / Public Holiday namely Republic Day falls on Sunday. So, one restricted holiday namely Bhatridwitiya (23rd October, 2024) will be treated as additional Festival Holiday for maintaining total number of Public/ Closed holidays. SL. No.: 27 | HOLIDAYS: Kali Puja / Diwali / Dipawali | DATE: 20th October | Day: Monday SL. No.: 28 | HOLIDAYS: Bhatridwitiya | DATE: 23rd October | Day: Thursday SL. No.: 29 | HOLIDAYS: Chhat Puja | DATE: 27th October | Day: Monday" };
const c72: AbsenceSource = { id: 72, headline: "CIRCULAR HOLIDAY LIST FOR THE YEAR 2024", text: "SL. No.: 20 | HOLIDAYS: Kali Puja / Diwali | DATE: 31st October | Day: Thursday SL. No.: 21 | HOLIDAYS: Chhat Puja | DATE: 7th November | Day: Thursday SL. No.: 22 | HOLIDAYS: Birth Day of Guru Nanak | DATE: 15th November | Day: Friday" };
const c81: AbsenceSource = { id: 81, headline: "CIRCULAR - HOLIDAY LIST FOR THE YEAR 2026", text: "SL.: 11 | HOLIDAYS: Bhatridwitiya | DATE: 11th November | DAY OF WEEK: Wednesday | CATEGORY: Category B SL.: 12 | HOLIDAYS: Birth Day of Guru Nanak | DATE: 24th November" };
const other: AbsenceSource = { id: 21, headline: "Notice for Contractor Workers - Revised GPAIS Premium Amount w.e.f 01.01.2025", text: "Premium amount revised from 01.01.2025" };
const NS = "Not stated in circular";

const table = { columns: ["Festival", "2024", "2025", "2026"], rows: [
  ["Bhatridwitiya", NS, NS, "11th November [Category B]"],
  ["Chhat Puja", "7th November", "27th October", NS],
  ["Rath Yatra", NS, NS, NS],
] };

{ // the real G01 failure is corrected, from the circular's own words
  const r = checkAbsences(table, [c81, c71, c72, other]);
  check("Bhatridwitiya under 2025 (named in circular 71) is no longer 'Not stated'", /Listed in the circular: ".*Bhatridwitiya/.test(r.table.rows[0][2]), r.table.rows[0][2]);
  check("the quotation carries the date printed in the circular", /23rd October/.test(r.table.rows[0][2]), r.table.rows[0][2]);
  check("the fix names the circular", r.fixes.length >= 1 && r.fixes[0].sourceId === 71 && r.fixes[0].column === "2025");
  check("Bhatridwitiya under 2024 stays 'Not stated' (circular 72 does not name it)", r.table.rows[0][1] === NS);
  check("a cell that already has a value is not touched", r.table.rows[0][3] === "11th November [Category B]" && r.table.rows[1][1] === "7th November");
  check("Chhat Puja under 2026 stays 'Not stated' for the right reason: 'chhat' is in no 2026 text here", r.table.rows[1][3] === NS);
  check("an item named in no circular stays 'Not stated'", r.table.rows[2].slice(1).every((c) => c === NS));
  check("the input table is not changed", table.rows[0][2] === NS);
}
{ // a heading that matches no circular, or several, is never checked
  const r = checkAbsences({ columns: ["Item", "Old", "New"], rows: [["Bhatridwitiya", NS, NS]] }, [c71, c81]);
  check("headings that are not in a headline are left alone", r.fixes.length === 0 && r.table.rows[0][1] === NS);
  const r2 = checkAbsences({ columns: ["Festival", "2025"], rows: [["Bhatridwitiya", NS]] }, [other, c71]);
  check("with several circulars carrying the year, the one that names the item is found", r2.fixes.length === 1 && r2.fixes[0].sourceId === 71);
  const r3 = checkAbsences({ columns: ["Festival", "2025"], rows: [["Bhatridwitiya", NS]] }, [other]);
  check("a circular that does not name the item leaves 'Not stated' alone", r3.fixes.length === 0);
}
{ // words that only name a kind of day never decide anything
  check("distinctive words drop generic ones and short ones", JSON.stringify(distinctiveWords("Durgapuja - Maha Navami")) === JSON.stringify(["durgapuja", "navami"]), JSON.stringify(distinctiveWords("Durgapuja - Maha Navami")));
  const r = checkAbsences({ columns: ["Item", "2025"], rows: [["Festival holiday", NS], ["Puja", NS]] }, [c71]);
  check("a row whose words are all generic is never corrected", r.fixes.length === 0);
  check("sourcesOfColumn matches whole headings only", sourcesOfColumn("2025", [c71, c72, other]).map((s) => s.id).join() === "71,21" && sourcesOfColumn("20", [c71]).length === 0);
}
{ // other spellings of an empty cell
  for (const cell of ["Not stated", "Not specified in the circular", "N/A", "-", "Not applicable"]) {
    const r = checkAbsences({ columns: ["Festival", "2025"], rows: [["Bhatridwitiya", cell]] }, [c71]);
    check(`"${cell}" is recognised as an empty cell`, r.fixes.length === 1, cell);
  }
  const r = checkAbsences({ columns: ["Festival", "2025"], rows: [["Bhatridwitiya", "Not a holiday but a restricted day"]] }, [c71]);
  check("a real statement that merely starts with 'Not' is not touched", r.fixes.length === 0);
}
{ // the table row is quoted on its own, not its neighbours; a heading like "2025 Date" still finds the 2025 circular (the real shapes of the G01 answer)
  const r = checkAbsences({ columns: ["Holiday", "2024 Date", "2025 Date", "2026 Date"], rows: [["Bhatridwitiya", NS, NS, "11th November"]] }, [c81, c71, c72]);
  check('heading "2025 Date" is matched to the 2025 circular', r.fixes.some((f) => f.column === "2025 Date" && f.sourceId === 71), JSON.stringify(r.fixes));
  const q = r.fixes.find((f) => f.sourceId === 71)?.quote ?? "";
  check("the quotation is the one table row that names the item, as values without the column names", q === "Bhatridwitiya · 23rd October · Thursday", q);
  check("a table row is preferred to the prose sentence that also names it", !/restricted holiday namely/.test(q));
  check('the 2024 column is still left alone (circular 72 does not name the item)', r.table.rows[0][1] === NS);
  check("the quotation does not run into the next row", !/Chhat/.test(q) && !/SL\./.test(q), q);
  check("a row with no column names is left as it is", readable("Bhatridwitiya | 23rd October") === "Bhatridwitiya · 23rd October" && readable("Just a sentence without bars") === "Just a sentence without bars");
}
{ // the false positives of the first version, taken from the engine selftest's retention table
  const retention: AbsenceSource = { id: 6, headline: "Circular - Rules for Retention of Company Accomodation by Ex-employees at City Locations", text: "Period of retention: Upto two (2) months | Advance Rent (per month): Standard HRR. From 7th month to 12th month* | Advance Rent: 1.2 times the Monthly Rent." };
  const r = checkAbsences({ columns: ["Retention Period", "Type A City Locations", "Type B City Locations"], rows: [["7th to 12th month", "Not applicable", "1.2x Monthly Rent"]] }, [retention]);
  check("a heading without a year (\"Type A City Locations\") never maps to a circular", r.fixes.length === 0 && r.table.rows[0][1] === "Not applicable");
  const r2 = checkAbsences({ columns: ["Item", "2022"], rows: [["7th to 12th month", "Not applicable"], ["Period (months)", "Not stated"]] }, [{ ...retention, headline: "Retention rules 2022" }]);
  check("a row label with a figure, or made only of generic words, is never an item name", r2.fixes.length === 0, JSON.stringify(r2.fixes));
}
{
  // real lines of the 2025 circular (71): a festival list, then a restricted list. The cell must say WHICH kind of list names the item.
  const text2025 = "2. FESTIVAL HOLIDAYS: Following Festival Holidays are admissible to Category A & Category B employees: SL NO.: 1 | HOLIDAYS: Maha Shivaratri | DATE: 26th February | DAY: Wednesday | CATEGORY: Category B SL NO.: 8 | HOLIDAYS: Durgapuja - Maha Ashtami | DATE: 30th September | DAY: Tuesday | CATEGORY: Category A & B "
    + "3. RESTRICTED HOLIDAYS (RH): Employees can avail restricted holidays from the list below LIST OF RESTRICTED HOLIDAYS (RH) " + rhEntries({ 4: ["Netaji's Birth Day", "23rd January", "Thursday"], 5: ["Basanta Panchami / Sri Panchami", "2nd February", "Sunday"], 28: ["Bhatridwitiya", "23rd October", "Thursday"], 33: ["Christmas Day", "25th December", "Thursday"] }, 33);
  const src: AbsenceSource[] = [{ id: 71, headline: "CIRCULAR HOLIDAY LIST FOR THE YEAR 2025", text: text2025 }];
  const r = checkAbsences({ columns: ["Holiday", "2025"], rows: [
    ["Saraswati Puja / Basant Panchami / Netaji's Birth Day", "Not stated in circular"],
    ["Bhatridwitiya", "Not stated in circular"],
    ["Durgapuja - Vijaya Dashami / Maha Dasami", "Not stated in circular"],
    ["Maha Shivaratri", "Not stated in circular"],
  ] }, src);
  check("a name that differs in spelling is found through the other names of the row, and the cell says it is a RESTRICTED holiday", r.table.rows[0][1] === 'Listed in the circular as a restricted holiday: "Basanta Panchami / Sri Panchami · 2nd February · Sunday"', r.table.rows[0][1]);
  check("an item named in the restricted list says so", r.table.rows[1][1] === 'Listed in the circular as a restricted holiday: "Bhatridwitiya · 23rd October · Thursday"', r.table.rows[1][1]);
  check("a true absence stays 'Not stated' (Vijaya Dashami is in no list of 2025; 'Durgapuja' alone is not enough)", r.table.rows[2][1] === "Not stated in circular", r.table.rows[2][1]);
  check("an item in the festival list says festival holiday", r.table.rows[3][1] === 'Listed in the circular as a festival holiday: "Maha Shivaratri · 26th February · Wednesday · Category B"', r.table.rows[3][1]);
}
{
  // "what differs", from the checked cells
  const t2024 = "RESTRICTED HOLIDAYS (RH): LIST OF RH " + rhEntries({ 7: ["Maha Shivaratri", "08th March", "Friday"], 20: ["Rath Yatra", "07th July", "Sunday"] }, 22);
  const t2025 = "2. FESTIVAL HOLIDAYS: SL NO.: 1 | HOLIDAYS: Maha Shivaratri | DATE: 26th February | DAY: Wednesday | CATEGORY: Category B 3. RESTRICTED HOLIDAYS (RH): LIST OF RESTRICTED HOLIDAYS (RH) " + rhEntries({ 17: ["Rath Yatra", "27th June", "Friday"] }, 19);
  const t2026 = "2. FESTIVAL HOLIDAYS: SL.: 6 | HOLIDAYS: Rath Yatra | DATE: 16th July | DAY OF WEEK: Thursday | CATEGORY: Category B 3. RESTRICTED HOLIDAYS (RH): LIST OF RESTRICTED HOLIDAYS (RH) " + rhEntries({ 6: ["Maha Shivaratri", "15th February", "Sunday"] }, 8, "Sl.: ");
  const src: AbsenceSource[] = [{ id: 72, headline: "HOLIDAYS 2024", text: t2024 }, { id: 71, headline: "HOLIDAYS 2025", text: t2025 }, { id: 81, headline: "HOLIDAYS 2026", text: t2026 }];
  const table = { columns: ["Holiday", "2024 Date", "2025 Date", "2026 Date"], rows: [
    ["Maha Shivaratri", "Not stated in circular", "26th February [Wednesday]", "Not stated in circular"],
    ["Rath Yatra", "Not stated in circular", "Not stated in circular", "16th July [Thursday]"],
    ["Buddha Purnima", "23rd May [Thursday]", "12th May [Monday]", "Not stated in circular"],
  ] };
  const r = checkAbsences(table, src);
  const d = describeDifferences(r.table, r.fixes, r.confirmed);
  check("a checked absence is recorded (Buddha Purnima is in none of the 2026 text)", r.confirmed.length === 1 && r.confirmed[0].row === "Buddha Purnima" && r.confirmed[0].column === "2026 Date", JSON.stringify(r.confirmed));
  check("the differences finding names what is only a restricted holiday, by year, with the shared heading word removed", !!d && d.text.includes("Found in the circular's list of restricted holidays, not as a dated entry of the table") && d.text.includes("Maha Shivaratri (2024, 2026)") && d.text.includes("Rath Yatra (2024, 2025)") && !d.text.includes("Date)"), d?.text);
  check("and what is not named at all", !!d && /Not named at all in that column's circular: Buddha Purnima \(2026\)\./.test(d.text), d?.text);
  check("its sources are the circulars involved", !!d && [72, 71, 81].every((x) => d.sources.includes(x)), JSON.stringify(d?.sources));
  check("the finding is not removed by the contradiction filter's own logic when added after it (it only exists as a separate finding)", !!d && d.text.length < 700);
  check("no checked cells -> no finding", describeDifferences({ columns: ["A", "B", "C"], rows: [["x", "1", "2"]] }, [], []) === null);
  check("a two-column table gets no differences finding", describeDifferences({ columns: ["A", "B"], rows: [["x", "1"]] }, r.fixes, r.confirmed) === null);
}
{
  // the kind of list is said only when it is certain
  const prose = "2. FESTIVAL HOLIDAYS: SL NO.: 12 | HOLIDAYS: Birth Day of Guru Nanak | DATE: 5th November | DAY: Wednesday SL NO.: 13 | HOLIDAYS: Christmas Day | DATE: 25th December | DAY: Thursday | CATEGORY: Category A & B For Category B employees one restricted holiday namely Bhatridwitiya will be treated as additional Festival Holiday for maintaining total number of Festival holidays to 18. ";
  const noHeading = prose + "SL. No.: 28 | HOLIDAYS: Bhatridwitiya | DATE: 23rd October | Day: Thursday";
  const rNo = checkAbsences({ columns: ["Holiday", "2025"], rows: [["Bhatridwitiya", "Not stated in circular"]] }, [{ id: 71, headline: "HOLIDAYS 2025", text: noHeading }]);
  check("a list that restarted its numbering after the last heading (heading not in the text) gets no kind; prose with 'Festival Holiday' is not a heading", rNo.table.rows[0][1] === 'Listed in the circular: "Bhatridwitiya · 23rd October · Thursday"', rNo.table.rows[0][1]);
  const withHeading = prose + "3. RESTRICTED HOLIDAYS (RH): LIST OF RESTRICTED HOLIDAYS (RH) " + rhEntries({ 28: ["Bhatridwitiya", "23rd October", "Thursday"] }, 28);
  const rYes = checkAbsences({ columns: ["Holiday", "2025"], rows: [["Bhatridwitiya", "Not stated in circular"]] }, [{ id: 71, headline: "HOLIDAYS 2025", text: withHeading }]);
  check("with its heading in the text the kind is said", rYes.table.rows[0][1] === 'Listed in the circular as a restricted holiday: "Bhatridwitiya · 23rd October · Thursday"', rYes.table.rows[0][1]);
}
{
  // the TEXT of the reply must not contradict the corrected table
  const fix: AbsenceFix = { row: "Bhatridwitiya", column: "2025", sourceId: 71, quote: "Bhatridwitiya · 23rd October · Thursday" };
  const wrong = "Bhatridwitiya is not stated in the 2025 list. Saraswati Puja falls on 23 January 2026.";
  const a = dropContradictedClaims(wrong, [fix]);
  check("a sentence that says the item is not stated for the corrected period is removed", !/Bhatridwitiya/.test(a.text) && a.removed.length === 1 && /Saraswati Puja falls on 23 January 2026\./.test(a.text), JSON.stringify(a));
  const b = dropContradictedClaims("Bhatridwitiya is listed on 23 October 2025; it is not listed for 2026.", [fix]);
  check("a true sentence about another period is kept (2026 is not the corrected column)", b.removed.length === 0 && b.text.includes("not listed for 2026"), JSON.stringify(b));
  const c = dropContradictedClaims("Bhatridwitiya appears only in 2024 and is absent from the 2025 list.", [fix]);
  check("'appears only in 2024 ... absent from 2025' is removed", c.removed.length === 1 && c.text === "", JSON.stringify(c));
  const d = dropContradictedClaims("Bhatridwitiya falls on 23 October 2025.", [fix]);
  check("a sentence with no negation is never touched", d.removed.length === 0 && d.text === "Bhatridwitiya falls on 23 October 2025.");
  const e = dropContradictedClaims("Diwali is not stated in 2025.", [fix]);
  check("a negation about a different item is never touched", e.removed.length === 0);
  const f = dropContradictedClaims("Bhatridwitiya is not stated in 2025", []);
  check("with no corrected cell nothing is removed", f.removed.length === 0 && f.text === "Bhatridwitiya is not stated in 2025");
  const g = dropContradictedClaims("Rs. 500 is paid. Bhatridwitiya is not mentioned for 2025; Diwali is on 1 November.", [fix]);
  check("only the offending clause goes; the others stay (an abbreviation like 'Rs.' does not split a sentence)", g.removed.length === 1 && g.text.includes("Rs. 500 is paid.") && g.text.includes("Diwali is on 1 November."), JSON.stringify(g));
}
console.log(`absence check selftest: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/designationFilter.selftest.ts
// The filter box of a people list understands designations (gm, dgm, agm, Sr. Mgr ...), in any case, with or without dots.

import { filterRows, type DisplayColumn } from "./display";
import { canonicalTitle, isDesignationColumn, isTicketColumn, originOfTicket, splitAlternatives, tidyDesignation } from "./designationFilter";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const eq = (name: string, got: unknown, want: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const columns: DisplayColumn[] = [
  { key: "name", label: "Name", kind: "text" },
  { key: "designation", label: "Designation", kind: "text" },
  { key: "department", label: "Department", kind: "text" },
  { key: "ticket_no", label: "Ticket", kind: "code" },
];
// the titles as the HR tool stores them: note "Asst.General Manager" has no space
const rows = [
  { name: "A ROY", designation: "General Manager", department: "C&IT", ticket_no: "490001" },
  { name: "B SEN", designation: "General Manager", department: "BF", ticket_no: "420133" },
  { name: "C DAS", designation: "Dy. General Manager", department: "SMS", ticket_no: "431000" },
  { name: "D ROY", designation: "Dy. General Manager", department: "C&IT", ticket_no: "495555" },
  { name: "E BOSE", designation: "Asst.General Manager", department: "MM", ticket_no: "407777" },
  { name: "F RAO", designation: "Chief General Manager", department: "PPC", ticket_no: "490002" },
  { name: "G NATH", designation: "Executive Director", department: "Works", ticket_no: "490003" },
  { name: "H GHOSH", designation: "Director In-charge", department: "Corporate", ticket_no: "490004" },
  { name: "I PAL", designation: "Sr. Manager", department: "BF", ticket_no: "412345" },
  { name: "J ROY", designation: "Dy. Manager", department: "C&IT", ticket_no: "430022" },
  { name: "K DEY", designation: "Asst. Manager", department: "C&IT", ticket_no: "450001" },
  { name: "L MITRA", designation: "Junior Manager", department: "SMS", ticket_no: "409999" },
  { name: "M REDDY", designation: "Manager", department: "BF", ticket_no: "490005" },
  { name: "N SAHA", designation: "Medical Officer", department: "M&HS", ticket_no: "480001" },
  { name: "O NONEX", designation: "S-9", department: "SMS", ticket_no: "228757" },
];
const names = (q: string) => filterRows(rows, columns, q).map((r) => r.name).join(",");

// ---- the initials: each one means one designation
eq("gm shows the General Managers only", names("gm"), "A ROY,B SEN");
eq("GM in capitals, Gm mixed: the same", [names("GM"), names("Gm")], ["A ROY,B SEN", "A ROY,B SEN"]);
eq("dgm shows the Dy. General Managers only", names("dgm"), "C DAS,D ROY");
eq("agm shows the Asst. General Managers only (stored without a space)", names("agm"), "E BOSE");
eq("cgm, ed, dic, mo", [names("cgm"), names("ed"), names("dic"), names("mo")], ["F RAO", "G NATH", "H GHOSH", "N SAHA"]);
// ---- JO is a DESIGNATION (the first 18 months of a promotee), found by its title; the list may have none
const rowsWithJo = [...rows, { name: "P JUNIOR", designation: "Junior Officer", department: "BF", ticket_no: "470001" }, { name: "Q TRAINEE", designation: "Jr. Officer", department: "SMS", ticket_no: "480002" }];
const namesJo = (q: string) => filterRows(rowsWithJo, columns, q).map((r) => r.name).join(",");
eq("jo is the designation Junior Officer (in any case; Jr. Officer is the same title), and no other", [namesJo("jo"), namesJo("JO"), namesJo("junior officer"), namesJo("jr officer")], Array(4).fill("P JUNIOR,Q TRAINEE"));
eq("jo in a list that has no Junior Officer shows no row (it is not read as promotees or direct recruits)", [names("jo"), names("JO")], ["", ""]);
eq("a JO is not found by the words promotee or direct, unless they are asked together", [namesJo("promotee jo"), namesJo("jo promotee"), namesJo("direct jo")], ["P JUNIOR,Q TRAINEE", "P JUNIOR,Q TRAINEE", ""]);
eq("jo with a department: the Junior Officers of BF", namesJo("jo bf"), "P JUNIOR");
eq("initials are not found inside names (ed does not show REDDY)", names("ed"), "G NATH");

// ---- several designations in one box
eq("gm, dgm, agm shows the three kinds, in the list's own order", names("gm, dgm, agm"), "A ROY,B SEN,C DAS,D ROY,E BOSE");
eq("the separator may be ; | or the word or", [names("gm; agm"), names("gm | agm"), names("gm or agm"), names("GM OR AGM")], ["A ROY,B SEN,E BOSE", "A ROY,B SEN,E BOSE", "A ROY,B SEN,E BOSE", "A ROY,B SEN,E BOSE"]);
eq("splitAlternatives", splitAlternatives(" gm ,dgm;; agm | sr mgr or ed "), ["gm", "dgm", "agm", "sr mgr", "ed"]);

// ---- whole titles: the same, with or without dots, glued or spaced
eq("general manager is the General Manager only (not the Dy., Asst. or Chief ones)", names("general manager"), "A ROY,B SEN");
eq("Dy. general manager, dy general manager, DY.GENERAL MANAGER", [names("Dy. general manager"), names("dy general manager"), names("DY.GENERAL MANAGER")], ["C DAS,D ROY", "C DAS,D ROY", "C DAS,D ROY"]);
eq("asst. general manager (the stored title has no space) and asst general manager, asst.general manager", [names("asst. general manager"), names("asst general manager"), names("asst.general manager")], ["E BOSE", "E BOSE", "E BOSE"]);
eq("asst.general (glued, only part of the title) still finds it", names("asst.general"), "E BOSE");
eq("dy gm, asst gm, dy. gm", [names("dy gm"), names("asst gm"), names("dy. gm")], ["C DAS,D ROY", "E BOSE", "C DAS,D ROY"]);

// ---- the manager grades
eq("sr mgr, Sr. Mngr, senior manager", [names("sr mgr"), names("Sr. Mngr"), names("senior manager")], ["I PAL", "I PAL", "I PAL"]);
eq("dy mngr, Dy. Mgr, deputy manager", [names("dy mngr"), names("Dy. Mgr"), names("deputy manager")], ["J ROY", "J ROY", "J ROY"]);
eq("asst mngr, Asst. Mgr", [names("asst mngr"), names("Asst. Mgr")], ["K DEY", "K DEY"]);
eq("jr mngr, Jr. Mgr, junior manager", [names("jr mngr"), names("Jr. Mgr"), names("junior manager")], ["L MITRA", "L MITRA", "L MITRA"]);
eq("mgr alone is the Manager", names("mgr"), "M REDDY");
eq("the plain word manager still finds every kind of manager", names("manager"), "A ROY,B SEN,C DAS,D ROY,E BOSE,F RAO,I PAL,J ROY,K DEY,L MITRA,M REDDY");

// ---- a designation together with a word, and the plain text search as before
eq("roy gm: the General Managers named Roy", names("roy gm"), "A ROY");
eq("gm roy (the other order)", names("gm roy"), "A ROY");
eq("roy alone: every Roy, any designation", names("roy"), "A ROY,D ROY,J ROY");
eq("a department code with a symbol: c&it", names("c&it"), "A ROY,D ROY,J ROY,K DEY");
eq("c&it gm: the General Managers of C&IT", names("c&it gm"), "A ROY");
eq("a department word, any case", names("sms"), "C DAS,L MITRA,O NONEX");
eq("an empty or blank box shows every row", [names("").split(",").length, names("   ").split(",").length, names(" , ; ").split(",").length], [15, 15, 15]);
eq("nothing found shows no row", names("zzz"), "");

// ---- the ORIGIN of an executive, read from the ticket (second digit 9 = direct recruit, any other = promotee), whatever the designation is today
const PROMOTEES = "B SEN,C DAS,E BOSE,I PAL,J ROY,K DEY,L MITRA,N SAHA";
const DIRECT = "A ROY,D ROY,F RAO,G NATH,H GHOSH,M REDDY";
eq("promotee shows the promotee officers, any designation (a promotee DGM, AGM, GM ... is among them)", names("promotee"), PROMOTEES);
eq("the other ways of asking: Promotees, promoty, promoted, promoted officers, promotee executives, Promotee Officers", ["Promotees", "promoty", "promoted", "promoted officers", "promotee executives", "Promotee Officers", "PROMOTEE"].map(names), Array(7).fill(PROMOTEES));
eq("direct, direct recruits, MT, mt, MTs, management trainee(s), mt executives, management trainee officers", ["direct", "direct recruits", "MT", "mt", "MTs", "management trainee", "Management Trainees", "mt executives", "management trainee officers", "Direct Executives"].map(names), Array(10).fill(DIRECT));
eq("two initials 'M T' or 'M.T.' stay a NAME search (they are not the MT origin: a person can be M T Das)", [names("m t") === DIRECT, names("M.T.") === DIRECT], [false, false]);
eq("the retired wording is NOT an origin word any more (owner, 30 Oct 2026): it shows no direct recruits", [names("day 1"), names("Day-1"), names("day one"), names("d1"), names("day1")].map((x) => x === DIRECT), Array(5).fill(false));
eq("a non-executive is neither (O NONEX, ticket 228757, is in neither list)", [names("promotee").includes("O NONEX"), names("direct").includes("O NONEX")], [false, false]);
eq("promotee with a designation: the promotee AGMs, DGMs, GMs", [names("promotee agm"), names("promotee dgm"), names("promotee gm"), names("agm promotee")], ["E BOSE", "C DAS", "B SEN", "E BOSE"]);
eq("direct with a designation (direct and MT mean the same)", [names("direct gm"), names("mt dgm"), names("direct agm"), names("MT GM"), names("management trainee dgm")], ["A ROY", "D ROY", "", "A ROY", "D ROY"]);
eq("promotee with a word: the promotee Roys; direct Roys", [names("promotee roy"), names("direct roy")], ["J ROY", "A ROY,D ROY"]);
eq("promotee with a department: the promotees of C&IT", names("promotee c&it"), "J ROY,K DEY");
eq("two origins, or an origin and a designation, separated by a comma", [names("promotee, direct").split(",").length, names("promotee, cgm"), names("direct, agm")], [14, "B SEN,C DAS,E BOSE,F RAO,I PAL,J ROY,K DEY,L MITRA,N SAHA", "A ROY,D ROY,E BOSE,F RAO,G NATH,H GHOSH,M REDDY"]);
eq("a list WITHOUT a ticket column: promotee and direct are plain text, as before", [filterRows([{ name: "PROMOTEE SHIPPING" }, { name: "RAJ" }, { name: "DIRECT LINE" }], [{ key: "name", label: "Name", kind: "text" }], "promotee").length, filterRows([{ name: "PROMOTEE SHIPPING" }, { name: "DIRECT LINE" }], [{ key: "name", label: "Name", kind: "text" }], "direct").length], [1, 1]);

// ---- a title the list does not have shows no row
eq("a designation that is not in the list shows no row (Dy. Mngr in a list without a Dy. Manager); mgr alone still means the Manager", [filterRows(rows.filter((r) => r.designation !== "Dy. Manager"), columns, "dy mngr").length, names("mgr"), names("jo mgr")], [0, "M REDDY", ""]);
eq("a list with no designation column: initials are plain text, as before", filterRows([{ name: "GM TRADERS" }, { name: "RAJ" }], [{ key: "name", label: "Name", kind: "text" }], "gm").length, 1);

// ---- the helpers
eq("canonicalTitle: the four spellings of one title", [canonicalTitle("Asst.General Manager"), canonicalTitle("Asst. General Manager"), canonicalTitle("ASST GENERAL MANAGER"), canonicalTitle("Assistant General Manager")], ["assistant general manager", "assistant general manager", "assistant general manager", "assistant general manager"]);
eq("canonicalTitle: Dy. Mngr and Director In-charge", [canonicalTitle("Dy. Mngr"), canonicalTitle("Director In-charge"), canonicalTitle("Director Incharge")], ["deputy manager", "director in charge", "director in charge"]);
eq("isDesignationColumn: the title column yes, the code, grade and rank no", [
  isDesignationColumn({ key: "designation", label: "Designation", kind: "text" }),
  isDesignationColumn({ key: "designation_code", label: "Designation code", kind: "code" }),
  isDesignationColumn({ key: "designation_track", label: "Track", kind: "text" }),
  isDesignationColumn({ key: "name", label: "Name", kind: "text" }),
], [true, false, false, false]);
eq("originOfTicket: 49xxxx direct, 40xxxx to 48xxxx promotee, anything else none", [originOfTicket("490268"), originOfTicket("420133"), originOfTicket("480000"), originOfTicket(" 490268 "), originOfTicket("228757"), originOfTicket("4902680"), originOfTicket("49026"), originOfTicket(""), originOfTicket("B001022")], ["direct", "promotee", "promotee", "direct", "", "", "", "", ""]);
eq("isTicketColumn", [isTicketColumn({ key: "ticket_no", label: "Ticket", kind: "code" }), isTicketColumn({ key: "ticketNo", label: "Ticket", kind: "text" }), isTicketColumn({ key: "name", label: "Name", kind: "text" }), isTicketColumn({ key: "ticket_mail", label: "x", kind: "text" })], [true, true, false, false]);
eq("tidyDesignation puts the space after the dot, and only there", [tidyDesignation("Asst.General Manager"), tidyDesignation("Asst. General Manager"), tidyDesignation("Dy.General Manager"), tidyDesignation("Sr.Medical Officer (M&HS)"), tidyDesignation("Director In-charge")], ["Asst. General Manager", "Asst. General Manager", "Dy. General Manager", "Sr. Medical Officer (M&HS)", "Director In-charge"]);

console.log(`designationFilter selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

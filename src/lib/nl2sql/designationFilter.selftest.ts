// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/designationFilter.selftest.ts
// The filter box of a people list understands designations (gm, dgm, agm, Sr. Mgr ...), in any case, with or without dots.

import { filterRows, type DisplayColumn } from "./display";
import { canonicalTitle, isDesignationColumn, splitAlternatives, tidyDesignation } from "./designationFilter";

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
];
// the titles as the HR tool stores them: note "Asst.General Manager" has no space
const rows = [
  { name: "A ROY", designation: "General Manager", department: "C&IT" },
  { name: "B SEN", designation: "General Manager", department: "BF" },
  { name: "C DAS", designation: "Dy. General Manager", department: "SMS" },
  { name: "D ROY", designation: "Dy. General Manager", department: "C&IT" },
  { name: "E BOSE", designation: "Asst.General Manager", department: "MM" },
  { name: "F RAO", designation: "Chief General Manager", department: "PPC" },
  { name: "G NATH", designation: "Executive Director", department: "Works" },
  { name: "H GHOSH", designation: "Director In-charge", department: "Corporate" },
  { name: "I PAL", designation: "Sr. Manager", department: "BF" },
  { name: "J ROY", designation: "Dy. Manager", department: "C&IT" },
  { name: "K DEY", designation: "Asst. Manager", department: "C&IT" },
  { name: "L MITRA", designation: "Junior Manager", department: "SMS" },
  { name: "M REDDY", designation: "Manager", department: "BF" },
  { name: "N SAHA", designation: "Medical Officer", department: "M&HS" },
];
const names = (q: string) => filterRows(rows, columns, q).map((r) => r.name).join(",");

// ---- the initials: each one means one designation
eq("gm shows the General Managers only", names("gm"), "A ROY,B SEN");
eq("GM in capitals, Gm mixed: the same", [names("GM"), names("Gm")], ["A ROY,B SEN", "A ROY,B SEN"]);
eq("dgm shows the Dy. General Managers only", names("dgm"), "C DAS,D ROY");
eq("agm shows the Asst. General Managers only (stored without a space)", names("agm"), "E BOSE");
eq("cgm, ed, dic, mo", [names("cgm"), names("ed"), names("dic"), names("mo")], ["F RAO", "G NATH", "H GHOSH", "N SAHA"]);
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
eq("a department word, any case", names("sms"), "C DAS,L MITRA");
eq("an empty or blank box shows every row", [names("").split(",").length, names("   ").split(",").length, names(" , ; ").split(",").length], [14, 14, 14]);
eq("nothing found shows no row", names("zzz"), "");

// ---- a title the list does not have shows no row
eq("jo: there is no Junior Officer in this list", names("jo"), "");
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
eq("tidyDesignation puts the space after the dot, and only there", [tidyDesignation("Asst.General Manager"), tidyDesignation("Asst. General Manager"), tidyDesignation("Dy.General Manager"), tidyDesignation("Sr.Medical Officer (M&HS)"), tidyDesignation("Director In-charge")], ["Asst. General Manager", "Asst. General Manager", "Dy. General Manager", "Sr. Medical Officer (M&HS)", "Director In-charge"]);

console.log(`designationFilter selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

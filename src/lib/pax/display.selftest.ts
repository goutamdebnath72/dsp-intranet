// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/pax/display.selftest.ts
// Step 63c: how a printed name is split into Department | Location for the PAX table (owner, 31 Oct 2026). The labels below are the REAL printed names the owner showed on screen (screenshot of "pax numbers")
// and in the handoff; only the order and the splitting are tested here.

import { compareParts, splitLabels } from "./display";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

const LABELS = [
  "C & IT (Console)", "C & IT (DR)", "CISF (PCR)", "CISF Admin Gate", "CISF Bhiringi main control room", "CISF Gate No. 2A", "CISF Gate No. 5",
  "CISF Main Gate (IN)", "CISF Main Gate (OUT)", "CISF Pass section(Opp Admin. Bldg.)", "CISF Tumla Gate", "CISF Main Hospital",
  "Civil (A - Zone)", "Civil (B - Zone)", "Network Team (C & IT)", "Network Team (CMMS)", "PAX Complain (In Plant)", "PAX Complain (Township)",
  "Plant Medical (PMU)", "Plant Control", "Fire Service", "Weigh Bridge - Tumla Gate", "MRS Control (Electrical Complain)",
];
// the numbers where the owner told them: 42043 is on CISF Tumla Gate AND on Weigh Bridge - Tumla Gate; the others are only here to give every name a number
const NUMBER: Record<string, string> = { "CISF Tumla Gate": "42043", "Weigh Bridge - Tumla Gate": "42043" };
const entries = LABELS.map((label, i) => ({ label, number: NUMBER[label] ?? String(40000 + i) }));
const m = splitLabels(entries);
const at = (l: string) => { const p = m.get(l); return p ? `${p.department}|${p.location}` : "MISSING"; };

// the owner's own examples
ok("CISF Admin Gate -> CISF | Admin Gate", at("CISF Admin Gate") === "CISF|Admin Gate", at("CISF Admin Gate"));
ok("CISF Main Gate (IN) -> CISF | Main Gate (IN): the bracket that follows other words stays as printed", at("CISF Main Gate (IN)") === "CISF|Main Gate (IN)", at("CISF Main Gate (IN)"));
ok("CISF Pass section(Opp Admin. Bldg.) -> CISF | Pass section(Opp Admin. Bldg.) (no space before the bracket)", at("CISF Pass section(Opp Admin. Bldg.)") === "CISF|Pass section(Opp Admin. Bldg.)", at("CISF Pass section(Opp Admin. Bldg.)"));
// the same department, other forms
ok("CISF (PCR) -> CISF | PCR: a location that is only a bracket loses its brackets", at("CISF (PCR)") === "CISF|PCR");
ok("CISF Bhiringi main control room, CISF Gate No. 2A, CISF Tumla Gate, CISF Main Hospital", at("CISF Bhiringi main control room") === "CISF|Bhiringi main control room" && at("CISF Gate No. 2A") === "CISF|Gate No. 2A" && at("CISF Tumla Gate") === "CISF|Tumla Gate" && at("CISF Main Hospital") === "CISF|Main Hospital");
ok("C & IT (Console) -> C & IT | Console; C & IT (DR) -> C & IT | DR", at("C & IT (Console)") === "C & IT|Console" && at("C & IT (DR)") === "C & IT|DR");
ok("Network Team (C & IT) and (CMMS) share TWO words: Network Team | C & IT, CMMS", at("Network Team (C & IT)") === "Network Team|C & IT" && at("Network Team (CMMS)") === "Network Team|CMMS");
ok("Civil (A - Zone) -> Civil | A - Zone", at("Civil (A - Zone)") === "Civil|A - Zone" && at("Civil (B - Zone)") === "Civil|B - Zone");
ok("PAX Complain (In Plant) -> PAX Complain | In Plant (a place name, kept as printed)", at("PAX Complain (In Plant)") === "PAX Complain|In Plant" && at("PAX Complain (Township)") === "PAX Complain|Township");
// a name that stands alone: cut at its bracket
ok("Plant Medical (PMU) -> Plant Medical | PMU (alone: cut at the bracket)", at("Plant Medical (PMU)") === "Plant Medical|PMU");
// the owner's rule of 31 Oct: complete department names are never cut, although both begin with "Plant"
// the REAL list prints "Weigh Bridge – 60T" with an en dash: the dash is a separator, not a word of the department (owner's screen, 31 Oct 2026)
const wb = splitLabels(["Weigh Bridge – 60T", "Weigh Bridge – 80T", "Weigh Bridge – Gate 5(Oxy)", "Weigh Bridge – North End", "Weigh Bridge – Tumla Gate"].map((label, i) => ({ label, number: String(40100 + i) })));
ok("Weigh Bridge – 60T -> Weigh Bridge | 60T (no dash left on the department, none at the start of the location)", wb.get("Weigh Bridge – 60T")?.department === "Weigh Bridge" && wb.get("Weigh Bridge – 60T")?.location === "60T", JSON.stringify([...wb]));
ok("...Gate 5(Oxy), North End, Tumla Gate likewise", wb.get("Weigh Bridge – Gate 5(Oxy)")?.location === "Gate 5(Oxy)" && wb.get("Weigh Bridge – North End")?.location === "North End" && wb.get("Weigh Bridge – Tumla Gate")?.location === "Tumla Gate");
const dashes = splitLabels(["Weigh Bridge - A", "Weigh Bridge - B", "Store — X", "Store — Y", "Yard : P", "Yard : Q"].map((label) => ({ label })));
ok("...a hyphen, an em dash and a colon are separators too", dashes.get("Weigh Bridge - A")?.department === "Weigh Bridge" && dashes.get("Store — X")?.department === "Store" && dashes.get("Store — X")?.location === "X" && dashes.get("Yard : P")?.department === "Yard" && dashes.get("Yard : P")?.location === "P", JSON.stringify([...dashes]));
ok("...a dash INSIDE a name is kept (Gate 5 - Oxy stays as printed in a location)", splitLabels([{ label: "Weigh Bridge – Gate 5 - Oxy" }, { label: "Weigh Bridge – North End" }]).get("Weigh Bridge – Gate 5 - Oxy")?.location === "Gate 5 - Oxy");
ok("Plant Control is a COMPLETE department name: Plant Control | (empty), not Plant | Control", at("Plant Control") === "Plant Control|", at("Plant Control"));
ok("Plant Medical (PMU) is a complete name too: Plant Medical | PMU, not Plant | Medical (PMU)", at("Plant Medical (PMU)") === "Plant Medical|PMU", at("Plant Medical (PMU)"));
const plants = splitLabels(["Plant Control", "Plant Medical (PMU)", "Plant Garage", "Plant Water"].map((label, i) => ({ label, number: String(40000 + i) })));
ok("...also next to other names that begin with 'Plant': the two protected names stay whole, and the other two (which only share the word) are grouped like CISF is: Plant | Garage, Plant | Water", plants.get("Plant Control")?.department === "Plant Control" && plants.get("Plant Medical (PMU)")?.department === "Plant Medical" && plants.get("Plant Garage")?.department === "Plant" && plants.get("Plant Garage")?.location === "Garage" && plants.get("Plant Water")?.location === "Water", JSON.stringify([...plants]));
ok("...a word that only LOOKS like a protected name is not protected (Plant Controller, Plant Medicals)", splitLabels([{ label: "Plant Controller" }, { label: "Plant Medicals (X)" }]).get("Plant Controller")?.department !== "Plant Control");
ok("...whatever follows a protected name is its location (Plant Control (Telecom) -> Telecom; Plant Control Room -> Room)", splitLabels([{ label: "Plant Control (Telecom)" }]).get("Plant Control (Telecom)")?.location === "Telecom" && splitLabels([{ label: "Plant Control Room" }]).get("Plant Control Room")?.location === "Room");
ok("MRS Control (Electrical Complain) -> MRS Control | Electrical Complain", at("MRS Control (Electrical Complain)") === "MRS Control|Electrical Complain");
ok("Fire Service -> Fire Service | (empty)", at("Fire Service") === "Fire Service|");
// the owner's rule of 31 Oct: a name that uses the number of a department's name belongs to that department, its whole printed name is the location
ok("Weigh Bridge - Tumla Gate uses 42043 like CISF Tumla Gate -> CISF | Weigh Bridge - Tumla Gate", at("Weigh Bridge - Tumla Gate") === "CISF|Weigh Bridge - Tumla Gate", at("Weigh Bridge - Tumla Gate"));
const alone = splitLabels([{ label: "Weigh Bridge - Tumla Gate", number: "42043" }, { label: "Fire Service", number: "42046" }]);
ok("...without that shared number it stands alone (no guessing from the words)", alone.get("Weigh Bridge - Tumla Gate")?.department === "Weigh Bridge - Tumla Gate");
const two = splitLabels([{ label: "Store Yard", number: "40001" }, { label: "Weigh Bridge", number: "40001" }]);
ok("...two names that stand alone and share a number stay apart (neither is a department of the other)", two.get("Store Yard")?.department === "Store Yard" && two.get("Weigh Bridge")?.department === "Weigh Bridge");
// robustness
const m2 = splitLabels([{ label: "cisf  Admin   Gate" }, { label: "CISF Tumla Gate" }]);
ok("case and double spaces do not matter", m2.get("cisf  Admin   Gate")?.department === "cisf" && m2.get("cisf  Admin   Gate")?.location === "Admin Gate", JSON.stringify([...m2]));
ok("the same name twice is one entry; an empty name is dropped", splitLabels([{ label: "Fire Service" }, { label: "Fire Service" }, { label: "  " }]).size === 1);
// the order: the first column A to Z, then the location, then the number
const rows = [
  { department: "Civil", location: "B - Zone", number: "40102" }, { department: "CISF", location: "Tumla Gate", number: "42043" }, { department: "C & IT", location: "DR", number: "40512" },
  { department: "CISF", location: "Tumla Gate", number: "40926" }, { department: "CISF", location: "Admin Gate", number: "40384" }, { department: "Civil", location: "A - Zone", number: "40101" },
];
const sorted = [...rows].sort(compareParts).map((r) => `${r.department}|${r.location}|${r.number}`);
ok("A to Z by department, then location, then number (two lines of one place keep a stable order)", JSON.stringify(sorted) === JSON.stringify(["C & IT|DR|40512", "CISF|Admin Gate|40384", "CISF|Tumla Gate|40926", "CISF|Tumla Gate|42043", "Civil|A - Zone|40101", "Civil|B - Zone|40102"]), JSON.stringify(sorted));

console.log(`display selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

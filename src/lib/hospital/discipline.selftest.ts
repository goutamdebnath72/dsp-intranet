// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/hospital/discipline.selftest.ts
// Step 53a: a doctor's discipline: from the printed qualification, found by ticket, never guessed.

import { disciplineFromQualification, disciplineOfTicket } from "./discipline";
import { STAFF } from "./opdData";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

const cases: [string | null | undefined, string | null][] = [
  ["MD(MEDICINE)", "Medicine"], ["DNB(MEDICINE)", "Medicine"], ["MS(SURGERY)", "Surgery"], ["MS(ORTHO)", "Orthopaedics"], ["D.ORTHO", "Orthopaedics"], ["MS(OPHTHALMOLOGY)", "Ophthalmology"],
  ["MS(ENT)", "ENT"], ["MD(DERMATOLOGY)", "Dermatology"], ["MD(PSYCHIATRY)", "Psychiatry"], ["MD(PAEDIATRICS)", "Paediatrics"], ["MD(CHEST)", "Chest medicine"],
  ["MD(ANAESTHESIOLOGY)", "Anaesthesiology"], ["MD (PATHOLOGY)", "Pathology"], ["MD (BIOCHEMISTRY)", "Biochemistry"], ["MD(RADIOLOGY)", "Radiology"], ["MS(O&G)", "Obstetrics and Gynaecology"],
  ["MD (COMMUNITY MEDICINE)", "Community medicine"], ["MD (TRANSFUSION-MEDICINE)", "Transfusion medicine"], ["MDS", "Dental surgery"], ["MBBS,DGO", "Obstetrics and Gynaecology (DGO)"],
  ["MS,MRCOG", "Obstetrics and Gynaecology (MRCOG)"], ["MBBS, DPM", "Psychiatry (DPM)"], ["MBBS,DIH", "Industrial health (DIH)"], ["MCH & DRNB PLASTIC SURGERY", "Plastic surgery"],
  ["MBBS", null], ["MS", null], ["", null], [null, null], [undefined, null], ["D.PHARMA", null], ["BPT", null],
];
for (const [q, want] of cases) ok(`"${q}" -> ${want}`, disciplineFromQualification(q) === want, String(disciplineFromQualification(q)));

ok("Dr. Ajit Karmakar (499116, MD Medicine): Medicine", disciplineOfTicket("499116") === "Medicine");
ok("Dr. Rupak Goswami (498840, MS ENT): ENT", disciplineOfTicket("498840") === "ENT");
ok("Dr. Hirak Choudhuri (498985, MD Dermatology): Dermatology", disciplineOfTicket("498985") === "Dermatology");
ok("Dr. Priyank Sahoo (490178, MS Ortho): Orthopaedics", disciplineOfTicket("490178") === "Orthopaedics");
ok("Dr. Manish Kumar (490196, MBBS): no discipline, never a guess", disciplineOfTicket("490196") === null);
ok("a ticket nobody has, an empty one, null and a number are all null", disciplineOfTicket("999999") === null && disciplineOfTicket("") === null && disciplineOfTicket(null) === null && disciplineOfTicket(undefined) === null);
ok("a ticket is matched trimmed", disciplineOfTicket(" 499116 ") === "Medicine");
ok("only doctors carry a discipline in the data", STAFF.people.filter((p) => p.role !== "doctor").every((p) => !p.discipline));
ok("what the data says is what the rule gives for the printed qualification", STAFF.people.filter((p) => p.role === "doctor").every((p) => (p.discipline ?? null) === disciplineFromQualification(p.qualification)));
ok("31 permanent doctors with a ticket have a discipline so far", STAFF.people.filter((p) => p.role === "doctor" && p.ticket && p.discipline).length === 31);
ok("no two doctors share a ticket", new Set(STAFF.people.filter((p) => p.ticket).map((p) => p.ticket)).size === STAFF.people.filter((p) => p.ticket).length);
console.log(`discipline selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

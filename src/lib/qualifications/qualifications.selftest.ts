// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/qualifications/qualifications.selftest.ts
// Step 58a: the TABLE OF DEGREES and the parser. Owner, 26 Oct 2026: "the system does not understand what post graduate means": it listed MBBS doctors for "post graduate degree on medicine". A degree now has a
// level, and "post graduate" is every level above graduate.

import { existsSync, readFileSync } from "node:fs";
import { DEGREES, LEVELS, LEVEL_RANK, SEGMENTS } from "./degrees";
import { KEY_CONFLICTS, degreeByKey, highestLevel, isPostgraduateOrHigher, keyOf, levelRank, parseQualification } from "./parse";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const level = (q: string) => parseQualification(q).highest;

// ---- the table itself
ok("the table is not small: more than 100 degrees", DEGREES.length > 100, String(DEGREES.length));
ok("no spelling is claimed by two different degrees", KEY_CONFLICTS.length === 0, KEY_CONFLICTS.join(" ; "));
ok("every degree has an abbreviation, a full name, a valid level and a valid segment", DEGREES.every((d) => d.code.trim() && d.name.trim() && LEVELS.includes(d.level) && SEGMENTS.includes(d.segment)));
ok("every full name is different (they are matched too)", new Set(DEGREES.map((d) => keyOf(d.name))).size === DEGREES.length);
ok("every level and every segment is used at least once", LEVELS.every((l) => DEGREES.some((d) => d.level === l)) && SEGMENTS.every((s) => DEGREES.some((d) => d.segment === s)), SEGMENTS.filter((s) => !DEGREES.some((d) => d.segment === s)).join(","));
ok("the levels are in order: certificate < diploma < graduate < postgraduate < superspecialty < doctorate", LEVELS.every((l, i) => i === 0 || LEVEL_RANK[l] > LEVEL_RANK[LEVELS[i - 1]]));
ok("a degree that has a doubt says what to confirm; a plain note is not a doubt (a line has one or the other)", DEGREES.every((d) => !(d.confirm && d.note)) && DEGREES.filter((d) => d.confirm).length >= 10);

// ---- the reference document lists every line
const docPath = "docs/QUALIFICATION_LEVELS.md";
ok("the reference document exists", existsSync(docPath));
const doc = existsSync(docPath) ? readFileSync(docPath, "utf8") : "";
ok("it lists every degree of the table (regenerate it after an edit: npx tsx scripts/make-qualification-reference.ts > docs/QUALIFICATION_LEVELS.md)", DEGREES.every((d) => doc.includes(`| ${d.code} |`)), DEGREES.filter((d) => !doc.includes(`| ${d.code} |`)).map((d) => d.code).join(","));
ok("it states the total and the number of doubts", doc.includes(`Total: ${DEGREES.length} degrees`) && doc.includes(`${DEGREES.filter((d) => d.confirm).length} lines are the author's best understanding`));

// ---- the real printed forms of the hospital's doctors (24 of them on 26 Oct 2026)
const real: [string, string, string | null][] = [
  ["MBBS", "graduate", null], ["MD(ANAESTHESIOLOGY)", "postgraduate", "ANAESTHESIOLOGY"], ["MS(SURGERY)", "postgraduate", "SURGERY"], ["MD(MEDICINE)", "postgraduate", "MEDICINE"], ["MS(ENT)", "postgraduate", "ENT"],
  ["MDS", "postgraduate", null], ["MS(ORTHO)", "postgraduate", "ORTHO"], ["MBBS,DGO", "postgraduate", null], ["MS(OPHTHALMOLOGY)", "postgraduate", "OPHTHALMOLOGY"], ["MD(DERMATOLOGY)", "postgraduate", "DERMATOLOGY"],
  ["MD (PATHOLOGY)", "postgraduate", "PATHOLOGY"], ["MD (BIOCHEMISTRY)", "postgraduate", "BIOCHEMISTRY"], ["MCH & DRNB PLASTIC SURGERY", "superspecialty", "PLASTIC SURGERY"], ["DNB(MEDICINE)", "postgraduate", "MEDICINE"],
  ["D.ORTHO", "postgraduate", null], ["MS(O&G)", "postgraduate", "O&G"], ["MS,MRCOG", "postgraduate", null], ["MS", "postgraduate", null], ["MD (COMMUNITY MEDICINE)", "postgraduate", "COMMUNITY MEDICINE"],
  ["MBBS, DPM", "postgraduate", null], ["MD(PSYCHIATRY)", "postgraduate", "PSYCHIATRY"], ["MD(CHEST)", "postgraduate", "CHEST"], ["MBBS,DIH", "postgraduate", null], ["MD (TRANSFUSION-MEDICINE)", "postgraduate", "TRANSFUSION-MEDICINE"],
];
for (const [q, lv, subject] of real) {
  const p = parseQualification(q);
  ok(`"${q}": ${lv}${subject ? `, subject ${subject}` : ""}, nothing unrecognised`, p.highest === lv && p.unrecognised.length === 0 && (subject === null || p.subject === subject), JSON.stringify(p));
}
ok("MBBS plus a postgraduate diploma is POSTGRADUATE (the highest wins): MBBS,DGO / MBBS, DPM / MBBS,DIH", level("MBBS,DGO") === "postgraduate" && level("MBBS, DPM") === "postgraduate" && level("MBBS,DIH") === "postgraduate");
ok("MCh & DrNB is SUPER-specialty, above postgraduate", level("MCH & DRNB PLASTIC SURGERY") === "superspecialty" && levelRank("superspecialty") > levelRank("postgraduate"));
ok("an MD is POSTGRADUATE although it is called a doctor's degree, and a PhD is the doctorate", level("MD") === "postgraduate" && level("PhD") === "doctorate");

// ---- the other fields the owner named: engineering, arts, science, commerce, computer
const fields: [string, string][] = [
  ["B.E.", "graduate"], ["B.Tech", "graduate"], ["B.Tech (Mechanical)", "graduate"], ["AMIE", "graduate"], ["M.E.", "postgraduate"], ["M.Tech", "postgraduate"], ["M.Tech CSE", "postgraduate"],
  ["BA", "graduate"], ["B.A. (Hons)", "graduate"], ["MA", "postgraduate"], ["M.A. (English)", "postgraduate"],
  ["B.Sc", "graduate"], ["B.Sc. (Hons) Physics", "graduate"], ["M.Sc", "postgraduate"], ["M.Sc. (Computer Science)", "postgraduate"],
  ["B.Com", "graduate"], ["M.Com", "postgraduate"], ["BBA", "graduate"], ["MBA", "postgraduate"], ["MBA (Finance)", "postgraduate"], ["PGDM", "postgraduate"],
  ["BCA", "graduate"], ["MCA", "postgraduate"], ["PGDCA", "postgraduate"], ["DCA", "diploma"],
  ["LLB", "graduate"], ["LLM", "postgraduate"], ["B.Ed", "graduate"], ["M.Ed", "postgraduate"],
  ["B.Pharm", "graduate"], ["M.Pharm", "postgraduate"], ["B.Sc (Nursing)", "graduate"], ["M.Sc (Nursing)", "postgraduate"], ["BDS", "graduate"], ["MDS", "postgraduate"], ["BAMS", "graduate"], ["BHMS", "graduate"],
  ["DM", "superspecialty"], ["MCh", "superspecialty"], ["DrNB", "superspecialty"], ["Ph.D. in Physics", "doctorate"], ["DSc", "doctorate"],
  ["Diploma in Engineering", "diploma"], ["D.Pharm", "diploma"], ["ITI", "certificate"], ["Matric", "certificate"], ["12th", "certificate"],
];
for (const [q, lv] of fields) ok(`"${q}" is ${lv}`, level(q) === lv, `${level(q)}`);
ok("long forms are read too: Bachelor of Technology, Master of Computer Applications, Doctor of Philosophy, Bachelor of Medicine and Bachelor of Surgery", level("Bachelor of Technology") === "graduate" && level("Master of Computer Applications") === "postgraduate" && level("Doctor of Philosophy (Chemistry)") === "doctorate" && level("Bachelor of Medicine and Bachelor of Surgery") === "graduate");
ok("dots, spaces and capitals do not matter: M.B.B.S. / m b b s / B. Tech / M. Tech. / b.sc.", level("M.B.B.S.") === "graduate" && level("B. Tech") === "graduate" && level("M. Tech.") === "postgraduate" && level("b.sc.") === "graduate" && degreeByKey("m.b.b.s.")?.code === "MBBS");
ok("a postgraduate DIPLOMA is postgraduate, a diploma after Class X or XII is not", level("PG Diploma") === "postgraduate" && level("Post Graduate Diploma in Management") === "postgraduate" && level("DGO") === "postgraduate" && level("Diploma") === "diploma");

// ---- several degrees in one text, brackets, and what is not known
ok("the separators: comma, &, and, /, + (not inside brackets)", ["MBBS, MD", "MBBS & MD", "MBBS and MD", "MBBS AND MD", "MBBS/MD", "MBBS+MD"].every((q) => parseQualification(q).degrees.length === 2 && level(q) === "postgraduate"));
ok("a comma inside brackets does not split: MD (PAEDIATRICS, NEONATOLOGY) is one degree", parseQualification("MD (PAEDIATRICS, NEONATOLOGY)").degrees.length === 1 && parseQualification("MD (PAEDIATRICS, NEONATOLOGY)").subject === "PAEDIATRICS, NEONATOLOGY");
ok("the subject after 'in' or without brackets: 'MD in Medicine', 'M.Tech CSE'", parseQualification("MD in Medicine").subject === "MEDICINE" && parseQualification("M.Tech CSE").subject === "CSE");
const mixed = parseQualification("MBBS, XYZ");
ok("a degree the table does not know is REPORTED, never guessed; the others still count", mixed.unrecognised.join() === "XYZ" && mixed.highest === "graduate" && mixed.degrees.length === 1, JSON.stringify(mixed));
ok("an unknown text has no level; empty and missing texts too", level("XYZ") === null && level("") === null && parseQualification(null).highest === null && parseQualification(undefined).degrees.length === 0 && parseQualification("XYZ").unrecognised.join() === "XYZ");

// ---- "post graduate" = everything higher than graduate
ok("isPostgraduateOrHigher: MD, MS, DNB, MDS, M.Tech, MCA, DGO, MCh, DM, PhD are; MBBS, BDS, B.Tech, BCA, B.Com, LLB, a diploma, ITI, nothing, an unknown text are not", ["MD(MEDICINE)", "MS", "DNB(MEDICINE)", "MDS", "M.Tech", "MCA", "MBBS,DGO", "MCH & DRNB PLASTIC SURGERY", "DM", "PhD"].every((q) => isPostgraduateOrHigher(q)) && ["MBBS", "BDS", "B.Tech", "BCA", "B.Com", "LLB", "Diploma", "ITI", "", "XYZ"].every((q) => !isPostgraduateOrHigher(q)));
console.log(`qualifications selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

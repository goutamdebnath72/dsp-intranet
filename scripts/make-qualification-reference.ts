// scripts/make-qualification-reference.ts
// Writes the reference document of the degrees the system knows and the level of each: `npx tsx scripts/make-qualification-reference.ts > docs/QUALIFICATION_LEVELS.md`
// It is generated from src/lib/qualifications/degrees.ts, so the document and the system cannot disagree. Edit the table, then run this again.

import { DEGREES, LEVELS, LEVEL_LABEL, SEGMENTS, type DegreeDef, type Level } from "../src/lib/qualifications/degrees";

const row = (d: DegreeDef): string => `| ${d.code} | ${d.name} | ${d.aliases.length ? d.aliases.join(", ") : ""} |`;
const out: string[] = [];
out.push("# Degrees and their levels", "");
out.push("The table the system uses to understand a degree (`src/lib/qualifications/degrees.ts`). This document is generated from it: `npx tsx scripts/make-qualification-reference.ts > docs/QUALIFICATION_LEVELS.md`.", "");
out.push("**The list is general knowledge of Indian degrees. It has NOT been checked against an official source.** The lines marked in the first section are the ones the author was unsure of.", "");
out.push("## What a level means", "");
out.push("| Level | Meaning |", "|---|---|");
out.push("| Certificate | school and trade certificates (Class X, Class XII, ITI) |");
out.push("| Diploma (below graduate) | a diploma taken after Class X or XII (polytechnic engineering, D.Pharm, GNM ...) |");
out.push("| Graduate | a bachelor's degree, or a professional degree of the same level (MBBS, BDS, B.Tech, BCA, B.Com, LLB ...) |");
out.push("| Postgraduate | **everything higher than graduate**: a master's degree (M.Tech, MCA, MBA, M.Sc, LLM ...), MD, MS, DNB, MDS, and every POST-graduate diploma (DGO, DPM, PGDM, PGDCA ...) |");
out.push("| Super-specialty | above MD / MS: DM, MCh, DrNB, FNB |");
out.push("| Doctorate | PhD, DSc, D.Litt ... |", "");
out.push("A question that says **post graduate** means every degree from Postgraduate upwards (so also super-specialty and doctorate). An **MD is postgraduate**, although it is called a doctor's degree.", "");

const unsure = DEGREES.filter((d) => d.confirm);
out.push("## Please confirm", "", `${unsure.length} lines are the author's best understanding and are NOT certain. Please confirm each (or tell me the right level):`, "");
out.push("| Degree | Level used | What to confirm |", "|---|---|---|");
for (const d of unsure) out.push(`| ${d.code} | ${LEVEL_LABEL[d.level]} | ${d.confirm} |`);
out.push("");
const noted = DEGREES.filter((d) => d.note);
out.push("## Notes", "", "| Degree | Level used | Note |", "|---|---|---|");
for (const d of noted) out.push(`| ${d.code} | ${LEVEL_LABEL[d.level]} | ${d.note} |`);
out.push("");

const byLevel = (l: Level) => DEGREES.filter((d) => d.level === l);
const order: Level[] = ["graduate", "postgraduate", "superspecialty", "doctorate", "diploma", "certificate"];
for (const level of order) {
  const list = byLevel(level);
  out.push(`## ${LEVEL_LABEL[level]} (${list.length})`, "");
  for (const seg of SEGMENTS) {
    const inSeg = list.filter((d) => d.segment === seg);
    if (!inSeg.length) continue;
    out.push(`### ${seg}`, "", "| Abbreviation | Full name | Also written |", "|---|---|---|");
    for (const d of inSeg) out.push(row(d));
    out.push("");
  }
}
out.push(`Total: ${DEGREES.length} degrees (${LEVELS.map((l) => `${byLevel(l).length} ${LEVEL_LABEL[l].toLowerCase()}`).join(", ")}).`, "");
console.log(out.join("\n"));

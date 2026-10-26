// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/HospitalAnswerCard.headline.selftest.tsx
// Step 57b (owner, 26 Oct 2026): the CLEAN ANSWER FIRST. A big bold headline is the first thing on the card: the value asked for ("DNB(MEDICINE)"), a green Yes or a red No, a name, a count. The title
// becomes a small caption under it, then one plain sentence, the table, the bullets that matter; long explanations are folded away (a <details> line). A card without a headline looks as it did.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HospitalAnswerCard } from "./HospitalAnswerCard";
import type { HospitalAnswer } from "@/lib/hospital/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const html = (a: HospitalAnswer) => renderToStaticMarkup(<HospitalAnswerCard answer={a} />);
const at = (h: string, needle: string) => h.indexOf(needle);

const table = { columns: ["Doctor", "Ticket"], rows: [["Dr. Rajeev Kumar", "499169"]] };
const full = html({ title: "Dr. Rajeev Kumar: specialisation", headline: { text: "DNB(MEDICINE)", tone: "info" }, status: { tone: "info", text: "Dr. Rajeev Kumar's specialisation is Medicine." }, table, lines: ["Department: Medicine."], details: [{ summary: "How is a specialisation decided?", text: "From a postgraduate qualification." }] });

// ---- the headline is first, big and bold
ok("the headline is the first thing on the card (before the title)", /<div class="space-y-2" data-hospital-answer="true"><p class="[^"]*" data-headline="info">DNB\(MEDICINE\)<\/p>/.test(full), full.slice(0, 240));
ok("it is large and bold: text-2xl (one step below the first version), font-extrabold", /<p class="text-2xl font-extrabold[^"]*" data-headline="info">/.test(full));
const colours: [string, string][] = [["yes", "text-green-600"], ["no", "text-red-600"], ["info", "text-neutral-900"], ["unknown", "text-amber-600"]];
for (const [tone, cls] of colours) ok(`the ${tone} headline is ${cls}`, new RegExp(`class="[^"]*${cls}[^"]*" data-headline="${tone}"`).test(html({ title: "t", headline: { text: "X", tone: tone as never } })));
ok("a Yes is green and a No is red: the words carry the meaning, the colour only helps", />Yes<\/p>/.test(html({ title: "t", headline: { text: "Yes", tone: "yes" } })) && />No<\/p>/.test(html({ title: "t", headline: { text: "No", tone: "no" } })));
// ---- the title is a caption under it
ok("with a headline the title is a small caption", /<p class="text-xs font-semibold text-neutral-500" data-title="true">Dr\. Rajeev Kumar: specialisation<\/p>/.test(full) && at(full, "data-headline") < at(full, "data-title"));
ok("without a headline the title is as it was (text-sm, dark)", /<p class="text-sm font-semibold text-neutral-800" data-title="true">/.test(html({ title: "Doctors of ENT", status: { tone: "info", text: "ENT has 3 doctors." } })));
// ---- one plain sentence
ok("under a headline the sentence is plain (no box, not bold): the headline carries the colour", /<p class="text-sm text-neutral-700" data-tone="info" data-sentence="true">Dr\. Rajeev Kumar(?:'|&#x27;)s specialisation is Medicine\.<\/p>/.test(full), full);
ok("an amber caution keeps its box under a headline (not known)", /<p class="rounded-md border px-2\.5 py-1\.5 text-sm font-semibold bg-amber-100[^"]*" data-tone="unknown">The qualification is not recorded\.<\/p>/.test(html({ title: "t", headline: { text: "Not known", tone: "unknown" }, status: { tone: "unknown", text: "The qualification is not recorded." } })));
const yes = html({ title: "Dr. Rajeev Kumar: DNB?", headline: { text: "Yes", tone: "yes" }, status: { tone: "open", text: "Yes: Dr. Rajeev Kumar holds DNB (qualification DNB(MEDICINE))." } });
ok("under a big Yes the sentence does not repeat the word: 'Dr. Rajeev Kumar holds DNB ...'", />Dr\. Rajeev Kumar holds DNB \(qualification DNB\(MEDICINE\)\)\.<\/p>/.test(yes) && !/>Yes: /.test(yes), yes);
const no = html({ title: "t", headline: { text: "No", tone: "no" }, status: { tone: "closed", text: "No: Dr. Dipak Singh's qualification is MD(MEDICINE), not DNB." } });
ok("...and under a big No", />Dr\. Dipak Singh(?:'|&#x27;)s qualification is MD\(MEDICINE\), not DNB\.<\/p>/.test(no) && !/>No: /.test(no), no);
ok("a sentence that does not start with the verdict is left as it is; a lone 'Yes' is kept", />The OPD is open\.<\/p>/.test(html({ title: "t", headline: { text: "Yes", tone: "yes" }, status: { tone: "open", text: "The OPD is open." } })) && />Yes<\/p>/.test(html({ title: "t", headline: { text: "Yes", tone: "yes" }, status: { tone: "open", text: "Yes" } })));
ok("an information headline never loses the start of its sentence ('No doctor is recorded ...' under 'None')", />No doctor in ENT is recorded with DM\.<\/p>/.test(html({ title: "t", headline: { text: "None", tone: "info" }, status: { tone: "info", text: "No doctor in ENT is recorded with DM." } })));
// ---- a card with no headline is exactly as before
const legacy = html({ title: "Medicine OPD", status: { tone: "open", text: "Yes: the OPD is open now." } });
ok("no headline: no headline element, the status box as before (green, bold, with its words)", !/data-headline/.test(legacy) && /<p class="rounded-md border px-2\.5 py-1\.5 text-sm font-semibold bg-green-100 text-green-900 border-green-200" data-tone="open">Yes: the OPD is open now\.<\/p>/.test(legacy), legacy);
// ---- folded details
ok("a long explanation is a real <details> line, closed until asked", /<details class="text-sm text-neutral-600" data-details="true"><summary class="cursor-pointer font-medium text-neutral-700">How is a specialisation decided\?<\/summary><p class="mt-1">From a postgraduate qualification\.<\/p><\/details>/.test(full) && !/<details[^>]* open/.test(full), full);
ok("two details give two lines; none gives none", (html({ title: "t", details: [{ summary: "a", text: "b" }, { summary: "c", text: "d" }] }).match(/<details /g) ?? []).length === 2 && !/<details/.test(html({ title: "t" })));
ok("details text is plain text (escaped)", /&lt;script&gt;/.test(html({ title: "t", details: [{ summary: "s", text: "<script>x</script>" }] })) && !/<script>/.test(html({ title: "t", details: [{ summary: "s", text: "<script>x</script>" }] })));
// ---- the order: answer, caption, sentence, table, bullets, folded details
const order = ["data-headline", "data-title", "data-sentence", "<table", 'data-points="true"', "<details"].map((n) => at(full, n));
ok("the order: headline, caption, sentence, table, bullets, folded details", order.every((p) => p > 0) && order.every((p, i) => i === 0 || order[i - 1] < p), JSON.stringify(order));
// ---- a folded line opened on one answer must be closed again on the next one (26 Oct 2026: it stayed open): the <details> element is keyed by the answer as well as the position, so React never reuses it
import { readFileSync } from "node:fs";
const source = readFileSync("src/components/HospitalAnswerCard.tsx", "utf8");
ok("the folded lines are keyed by the answer's title, the position and the summary (not by the position alone)", /<details key=\{`\$\{answer\.title\}\|\$\{i\}\|\$\{d\.summary\}`\}/.test(source) && !/<details key=\{i\}/.test(source));
console.log(`HospitalAnswerCard headline selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

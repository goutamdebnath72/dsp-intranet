// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/qualifications/degreeAnswer.selftest.ts
// Step 61a: questions about the DEGREES themselves are answered from the table of degrees (owner, 26 Oct 2026: "what are the post graduate degrees in engineering").

import { DEGREES, LEVEL_LABEL, LEVEL_RANK, SEGMENTS } from "./degrees";
import { answerDegreeQuestion } from "./degreeAnswer";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const rowsOf = (q: string) => answerDegreeQuestion(q)?.card.table?.rows ?? [];
const codes = (q: string) => rowsOf(q).map((r) => r[0].replace(/ \*$/, ""));
const NOTE = "This is the table of degrees kept in the system (general knowledge, not an official list), so it may be incomplete.";

// ---- a LIST: the owner's own question, computed again from the table
{
  const r = answerDegreeQuestion("what are the post graduate degrees in engineering")!;
  const expect = DEGREES.filter((d) => d.segment === "Engineering and technology" && d.level === "postgraduate").map((d) => d.code);
  ok("'what are the post graduate degrees in engineering': M.E. and M.Tech, exactly the table's rows", !!r && JSON.stringify(codes("what are the post graduate degrees in engineering")) === JSON.stringify(expect) && expect.length === 2 && expect.includes("M.Tech") && expect.includes("M.E."), JSON.stringify(codes("what are the post graduate degrees in engineering")));
  ok("...the clean answer first: the count as the headline, the title says what and where", r.card.headline?.text === "2 degrees" && r.card.title === "Postgraduate degrees in Engineering and technology", JSON.stringify([r.card.headline, r.card.title]));
  ok("...no Field and no Level column (both are in the title)", JSON.stringify(r.card.table?.columns) === JSON.stringify(["Degree", "Full name"]));
  ok("...it says what it is: a table of general knowledge, not an official list", (r.card.lines ?? []).includes(NOTE));
  ok("...the degrees ABOVE postgraduate are folded away (PhD ...), and what postgraduate means", !!r.card.details?.some((d) => /^Degrees above postgraduate/.test(d.summary) && /PhD/.test(d.text)) && !!r.card.details?.some((d) => d.summary === "What counts as postgraduate?" && /MBBS and BDS are graduate/.test(d.text)));
}
for (const seg of SEGMENTS) {
  const w: Record<string, string> = { "Engineering and technology": "engineering", "Medical (allopathy)": "medicine", Dental: "dental", Pharmacy: "pharmacy", Law: "law", Education: "education", "Architecture and design": "architecture", "Computer applications": "computer", "Commerce and management": "management" };
  if (!w[seg]) continue;
  for (const lv of ["postgraduate", "graduate"] as const) {
    const expect = DEGREES.filter((d) => d.segment === seg && d.level === lv).map((d) => d.code).sort();
    const q = `what are the ${lv === "postgraduate" ? "post graduate" : "graduate"} degrees in ${w[seg]}`;
    const got = codes(q).sort();
    ok(`"${q}": exactly the table's ${expect.length} row(s)`, expect.length === 0 ? answerDegreeQuestion(q)?.card.headline?.text === "None in the table" : JSON.stringify(got) === JSON.stringify(expect), JSON.stringify([got, expect]));
  }
}
ok("'list the engineering degrees': all 7, with the level shown", rowsOf("list the engineering degrees").length === DEGREES.filter((d) => d.segment === "Engineering and technology").length && answerDegreeQuestion("list the engineering degrees")!.card.table!.columns.includes("Level"));
ok("'how many post graduate degrees are there in medicine': the number is the headline", answerDegreeQuestion("how many post graduate degrees are there in medicine")?.card.headline?.text === String(DEGREES.filter((d) => d.segment === "Medical (allopathy)" && d.level === "postgraduate").length));
ok("'which degrees are higher than graduate': every degree of level postgraduate or above, none below", (() => { const g = codes("which degrees are higher than graduate"); return g.length === DEGREES.filter((d) => LEVEL_RANK[d.level] >= 4).length && g.every((c) => DEGREES.find((d) => d.code === c)!.level !== "graduate"); })());
ok("a postgraduate list holds no graduate, no super-specialty and no doctorate degree", rowsOf("what are the post graduate degrees").every((r) => DEGREES.find((d) => d.code === r[0].replace(/ \*$/, ""))!.level === "postgraduate") && rowsOf("what are the post graduate degrees").length > 20);
{
  const q = "what are the graduate degrees in engineering";
  const r = answerDegreeQuestion(q)!;
  ok("a degree the author was not sure of is marked * and named (AMIE)", rowsOf(q).some((x) => x[0] === "AMIE *") && (r.card.lines ?? []).some((l) => /^\* Not confirmed: .*AMIE/.test(l)), JSON.stringify(rowsOf(q)));
}
ok("a field the table does not have is SAID, with the fields it has (nothing guessed)", (() => { const r = answerDegreeQuestion("post graduate degrees in underwater basketry"); return r?.card.headline?.text === "Not known" && /no field called “underwater basketry”/.test(r.card.status?.text ?? "") && /Engineering and technology/.test(r.card.status?.text ?? ""); })());

// ---- a VERDICT
const verdict = (q: string) => answerDegreeQuestion(q)?.card.headline;
ok("'is md a postgraduate degree': Yes (green)", verdict("is md a postgraduate degree")?.text === "Yes" && verdict("is md a postgraduate degree")?.tone === "yes");
ok("'is MD a post graduate degree' (capitals, two words): Yes", verdict("is MD a post graduate degree")?.text === "Yes");
ok("'is dnb a post graduate degree': Yes", verdict("is dnb a post graduate degree")?.text === "Yes");
ok("'is mbbs a postgraduate degree': No (red), and the card says it is a graduate degree", verdict("is mbbs a postgraduate degree")?.text === "No" && verdict("is mbbs a postgraduate degree")?.tone === "no" && /graduate degree/.test(answerDegreeQuestion("is mbbs a postgraduate degree")!.card.status!.text));
ok("'is dm a post graduate degree': Yes, and it says DM is ABOVE postgraduate", verdict("is dm a post graduate degree")?.text === "Yes" && /above postgraduate/.test(answerDegreeQuestion("is dm a post graduate degree")!.card.status!.text));
ok("'is btech a graduate degree': Yes; 'is mtech a graduate degree': No", verdict("is btech a graduate degree")?.text === "Yes" && verdict("is mtech a graduate degree")?.text === "No");
ok("'is mbbs graduate or post graduate': the answer is the level itself (Graduate)", verdict("is mbbs graduate or post graduate")?.text === "Graduate");

// ---- ONE DEGREE
const lv = (q: string) => verdict(q)?.text;
ok("'what is mtech': Postgraduate, and the full name", lv("what is mtech") === "Postgraduate" && /Master of Technology/.test(answerDegreeQuestion("what is mtech")!.card.status!.text));
ok("'full form of dnb', 'what level is bds', 'what is the level of mca', 'what is ms degree'", lv("full form of dnb") === "Postgraduate" && lv("what level is bds") === "Graduate" && lv("what is the level of mca") === "Postgraduate" && lv("what is ms degree") === "Postgraduate");
ok("every one of the table's degrees: 'what is <degree> degree' gives ITS level", DEGREES.every((d) => { const r = answerDegreeQuestion(`what is ${d.code} degree`); return r?.card.headline?.text === LEVEL_LABEL[d.level]; }), DEGREES.filter((d) => answerDegreeQuestion(`what is ${d.code} degree`)?.card.headline?.text !== LEVEL_LABEL[d.level]).map((d) => d.code).join(", "));
ok("a degree marked doubtful says so: AMIE", (answerDegreeQuestion("what is amie")?.card.lines ?? []).some((l) => /^\* Not confirmed: AMIE/.test(l)));

// ---- NOT taken: a question about people, a document or anything else goes to its own route
for (const q of ["list the doctors having post graduate degree on medicine", "how many doctors are post graduate?", "who has a post graduate degree", "is dr kunj bihari singh post graduate?", "what is the policy for higher studies degree", "which employees have a degree in engineering",
  "what is the holiday list", "what is the weather", "is it a holiday today", "list the employees of chrd", "what is mediclaim", "what is me", "how many executives are post graduate", "hospital opd timing", "", "   ", "x".repeat(400)])
  ok(`not taken: "${q.slice(0, 50)}"`, answerDegreeQuestion(q) === null);

// ---- every answer: a clean headline first, only table codes in its rows, no person
for (const q of ["what are the post graduate degrees in engineering", "list the engineering degrees", "is md a postgraduate degree", "what is mtech", "super specialty degrees", "list the doctorate degrees", "post graduate degrees in underwater basketry"]) {
  const r = answerDegreeQuestion(q)!;
  ok(`"${q}": a headline, a title and a one-line sentence`, !!r.card.headline?.text && !!r.card.title && !!r.card.status?.text && r.summary.length > 5);
  ok(`"${q}": every row is a degree of the table`, (r.card.table?.rows ?? []).every((x) => DEGREES.some((d) => d.code === x[0].replace(/ \*$/, ""))));
}
console.log(`degreeAnswer selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

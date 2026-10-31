// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/degreeRoute.selftest.ts
// Step 61a: a question about the degrees themselves goes through the REAL pipeline (runOmnibar) and is answered from the table of degrees: the model is never called, nothing is read from the database.

import { runOmnibar, type OmnibarDeps } from "./omnibar";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
let modelCalls = 0, dbCalls = 0;
const deps = (): OmnibarDeps => ({
  enabled: true,
  llm: (async () => { modelCalls++; throw new Error("the model must not be called for a degree question"); }) as any,
  withClient: (async () => { dbCalls++; throw new Error("the database must not be read for a degree question"); }) as any,
  holiday: async () => null,
  hospital: async () => null,
  legacy: async () => null,
  verifiedMin: 2,
});

(async () => {
  for (const [q, headline] of [
    ["what are the post graduate degrees in engineering", "2 degrees"],
    ["is MD a postgraduate degree", "Yes"],
    ["is mbbs a post graduate degree", "No"],
    ["what is mtech", "Postgraduate"],
    ["list the engineering degrees", "7 degrees"],
  ] as const) {
    modelCalls = 0; dbCalls = 0;
    const r: any = await runOmnibar(q, "T", deps());
    ok(`"${q}": answered by the table of degrees (headline "${headline}")`, r?.hospital?.headline?.text === headline && r.kind === "count" && r.source === "nl2sql", JSON.stringify(r)?.slice(0, 200));
    ok(`"${q}": no model call and no database read`, modelCalls === 0 && dbCalls === 0, `${modelCalls} model calls, ${dbCalls} db reads`);
    ok(`"${q}": a plain-text answer travels with the card (copy, export)`, typeof r?.answer === "string" && r.answer.length > 5);
  }
  // a question about people is NOT taken by this route: it goes on to the model (which here throws, so the pipeline gives its own answer or null)
  for (const q of ["how many doctors are post graduate?", "who has a post graduate degree", "list the employees of chrd"]) {
    modelCalls = 0;
    const r: any = await runOmnibar(q, "T", deps()).catch(() => null);
    ok(`"${q}": not taken by the degree route`, r?.hospital?.table?.columns?.[0] !== "Degree" && r?.hospital?.headline?.text !== "2 degrees");
  }
  console.log(`degreeRoute selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

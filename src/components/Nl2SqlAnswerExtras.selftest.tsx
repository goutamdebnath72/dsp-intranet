// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/Nl2SqlAnswerExtras.selftest.tsx
// Step 55a: the note about what a department word was taken to mean is drawn under "Departments covered", only when there is one.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Nl2SqlAnswerExtras } from "./Nl2SqlAnswerExtras";
import type { Nl2SqlExtras } from "@/lib/nl2sql/clientTypes";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const base: Nl2SqlExtras = { logId: null, userKey: null, sql: "SELECT 1", confidence: "high", attempts: 1, scope: { departments: ["REFRACTORY", "REFRACTORY (OFFICE)", "COKE OVEN REFRACTORY"], total: 3 } };
const note = "\u201CRefractory\u201D means all three Refractory departments, as in the old intranet. Coke Oven Refractory also belongs to CO & CC: its 5 people are counted in both.";
const h = (n: Nl2SqlExtras) => renderToStaticMarkup(<Nl2SqlAnswerExtras nl2sql={n} />);

const withNote = h({ ...base, departmentNote: note });
ok("the note is drawn, with its own mark", /data-department-note="true"/.test(withNote) && withNote.includes("its 5 people are counted in both"));
ok("...escaped (the & of CO & CC is safe)", withNote.includes("CO &amp; CC") && !/CO & CC/.test(withNote));
ok("...under 'Departments covered' and above the SQL", withNote.indexOf("Departments covered") < withNote.indexOf("data-department-note") && withNote.indexOf("data-department-note") < withNote.indexOf("SQL the model wrote"));
ok("no note, nothing drawn", !/data-department-note/.test(h(base)) && !/data-department-note/.test(h({ ...base, departmentNote: undefined })));
ok("an empty note draws nothing", !/data-department-note/.test(h({ ...base, departmentNote: "" })));
ok("a note with markup is escaped", !/<script>/.test(h({ ...base, departmentNote: "<script>x</script>" })) && h({ ...base, departmentNote: "<script>x</script>" }).includes("&lt;script&gt;"));
ok("the departments covered line is unchanged", withNote.includes("Departments covered (3):") && withNote.includes("COKE OVEN REFRACTORY"));
console.log(`Nl2SqlAnswerExtras selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

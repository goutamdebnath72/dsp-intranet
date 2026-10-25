// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/Nl2SqlAnswerExtras.spelling.selftest.tsx
// Step 55b: the sentence that says a name was searched by its nearest real spelling is drawn in an amber box above "Departments covered", only when there is one.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Nl2SqlAnswerExtras } from "./Nl2SqlAnswerExtras";
import type { Nl2SqlExtras } from "@/lib/nl2sql/clientTypes";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const base: Nl2SqlExtras = { logId: null, userKey: null, sql: "SELECT 1", confidence: "high", attempts: 1, scope: { departments: ["MEDICAL ORGANISATION"], total: 1 } };
const note = "No name is spelled \u201CGosyami\u201D (nearest: Goswami): showing the nearest real spelling instead.";
const h = (n: Nl2SqlExtras) => renderToStaticMarkup(<Nl2SqlAnswerExtras nl2sql={n} />);

const withNote = h({ ...base, spellingNote: note });
ok("the note is drawn, with its own mark, in an amber box", /data-spelling-note="true"/.test(withNote) && /border-amber-300 bg-amber-50/.test(withNote) && withNote.includes("nearest: Goswami"));
ok("...above 'Departments covered' and above the SQL", withNote.indexOf("data-spelling-note") < withNote.indexOf("Departments covered") && withNote.indexOf("Departments covered") < withNote.indexOf("SQL the model wrote"));
ok("no note, nothing drawn (also for an empty note)", !/data-spelling-note/.test(h(base)) && !/data-spelling-note/.test(h({ ...base, spellingNote: "" })));
ok("a note with markup is escaped", !/<script>/.test(h({ ...base, spellingNote: "<script>x</script>" })) && h({ ...base, spellingNote: "<script>x</script>" }).includes("&lt;script&gt;"));
console.log(`Nl2SqlAnswerExtras spelling selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

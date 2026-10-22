// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/CircularAnswerCard.loading.selftest.tsx
// While the summary of a circular search is prepared the card says "Loading Summary" with three animated dots: no pulsing bars, no sweeping colour.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CircularAnswerCard } from "./CircularAnswerCard";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const html = (status: "idle" | "loading" | "done") => renderToStaticMarkup(<CircularAnswerCard state={{ status, answer: null }} onOpenSource={() => {}} />);

const loading = html("loading");
ok("the loading card says Loading Summary", /Loading Summary/.test(loading), loading);
ok("with three animated dots", (loading.match(/class="dot-wave"/g) ?? []).length === 3, loading);
ok("the dots start one after another (three different delays)", new Set(loading.match(/animation-delay:[0-9.]+s/g)).size === 3, loading);
ok("it is announced to a screen reader as a status that is busy", /role="status"/.test(loading) && /aria-busy="true"/.test(loading), loading);
ok("no pulsing bars and no gradient bar any more", !/animate-pulse/.test(loading) && !/bg-gradient-to-r/.test(loading), loading);
ok("the old words are gone", !/Reading the documents/.test(loading), loading);
ok("nothing is shown when idle", html("idle") === "", html("idle"));
ok("nothing is shown when done without an answer", html("done") === "", html("done"));

console.log(`CircularAnswerCard loading selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/HospitalAnswerCard.selftest.tsx
// The hospital answer card: title, verdict with its words, lines, a table with headers, the caveats; nothing is drawn for what is missing, and text is escaped.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HospitalAnswerCard } from "./HospitalAnswerCard";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const h = (el: React.ReactElement) => renderToStaticMarkup(el);

const full = h(
  <HospitalAnswerCard
    answer={{
      title: "Medicine OPD, Monday, 26 October 2026",
      status: { tone: "closed", text: "The OPD is closed on Sunday, 25 October 2026: Sunday." },
      lines: ["OPD hours: 8:00 AM to 1:00 PM and 5:00 PM to 7:00 PM."],
      table: { columns: ["Department", "OPD", "Monday"], rows: [["Medicine", "OPD 24", "Dr. Ranjeet Kumar (retired)"], ["Medicine", "OPD 25", "Dr. Ajit Karmakar"]] },
      notes: ["The OPD schedule is not up to date."],
    }}
  />,
);
ok("the title is shown", full.includes("Medicine OPD, Monday, 26 October 2026"));
ok("the verdict is shown with its words and its tone", full.includes("The OPD is closed on Sunday") && full.includes('data-tone="closed"'));
ok("the table has header cells and one row per row", (full.match(/<th /g) ?? []).length === 3 && (full.match(/<tr /g) ?? []).length === 2 && full.includes("Dr. Ranjeet Kumar (retired)"));
ok("the header cells are real column headers for a screen reader", /<th scope="col"/.test(full));
ok("the caveat is shown", full.includes("The OPD schedule is not up to date."));
ok("the table can scroll sideways on a narrow screen", full.includes("overflow-x-auto"));

const withSug = h(<HospitalAnswerCard answer={{ title: "T", status: { tone: "closed", text: "The OPD is closed." }, suggestion: "For urgent medical attention, you can consult the Emergency Department.", lines: ["a line"] }} />);
ok("the suggestion is drawn in its own box with its words", withSug.includes('data-suggestion="true"') && withSug.includes("For urgent medical attention, you can consult the Emergency Department."));
ok("...after the verdict and before the lines", withSug.indexOf("The OPD is closed.") < withSug.indexOf("data-suggestion") && withSug.indexOf("data-suggestion") < withSug.indexOf("a line"));
ok("no suggestion box when there is none", !full.includes("data-suggestion"));
ok("the suggestion text is escaped", !h(<HospitalAnswerCard answer={{ title: "T", suggestion: "<b>x</b>" }} />).includes("<b>"));

const bare = h(<HospitalAnswerCard answer={{ title: "Only a title" }} />);
ok("nothing else is drawn when only a title is given", !bare.includes("<table") && !bare.includes("data-tone") && !bare.includes("<svg"));
const empty = h(<HospitalAnswerCard answer={{ title: "T", table: { columns: ["A"], rows: [] } }} />);
ok("a table with no rows is not drawn", !empty.includes("<table"));

const evil = h(<HospitalAnswerCard answer={{ title: "<script>alert(1)</script>", lines: ["<img src=x onerror=alert(1)>"] }} />);
ok("text is escaped, never run", !evil.includes("<script>") && !evil.includes("<img") && evil.includes("&lt;script&gt;"));

for (const tone of ["open", "closed", "unknown", "info"] as const) {
  const t = h(<HospitalAnswerCard answer={{ title: "T", status: { tone, text: `verdict ${tone}` } }} />);
  ok(`tone ${tone} has its own colour classes`, t.includes(`data-tone="${tone}"`) && /bg-(green|red|amber|slate)-100/.test(t));
}
console.log(`HospitalAnswerCard selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

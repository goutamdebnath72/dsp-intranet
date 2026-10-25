// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/HospitalAnswerCard.selftest.tsx
// The hospital answer card: the title with its Open / Closed badge, the verdict, THE TABLE FIRST, short bullet points, the pointer in its own box (one point per line), the red notes.
// Nothing is drawn for what is missing, and all text is escaped.

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
      badge: { tone: "open", text: "Open" },
      status: { tone: "closed", text: "The OPD is closed at this moment." },
      lines: ["Not sitting on Monday: Unit I (Wednesday and Saturday)", "A patient is seen only by the unit of his or her first visit."],
      table: { columns: ["Unit", "Room", "Doctor"], rows: [["Unit II", "OPD 24", "Dr. Ranjeet Kumar (retired)"], ["", "OPD 25", "Dr. Ajit Karmakar"]] },
      suggestion: "A patient is seen only by the unit of his or her first visit.\nFor general care: General Medicine OPD (MOPD).\nFor urgent medical attention: the Emergency Department, open 24 hours a day, 7 days a week.",
      notes: ["OPD hours: 8 AM to 1 PM and 5 PM to 7 PM", "Card registration (token) hours: 8 AM to 11:30 AM and 4:30 PM to 6:30 PM"],
    }}
  />,
);
ok("the title is shown", full.includes("Medicine OPD, Monday, 26 October 2026"));
ok("the badge is a word, beside the title, in a green pill for Open", full.includes('data-badge="open"') && />Open<\/span>/.test(full) && /bg-green-600/.test(full) && full.indexOf("Medicine OPD, Monday") < full.indexOf("data-badge"));
ok("the verdict is shown with its words and its tone", full.includes("The OPD is closed at this moment.") && full.includes('data-tone="closed"'));
ok("the table has the three column headers and one row per row (an empty cell is empty)", (full.match(/<th /g) ?? []).length === 3 && (full.match(/<tr /g) ?? []).length === 2 && full.includes("Dr. Ranjeet Kumar (retired)") && /<td[^>]*><\/td>/.test(full));
ok("the header cells are real column headers for a screen reader", /<th scope="col"/.test(full));
ok("THE TABLE COMES FIRST: before the points, the pointer and the notes", full.indexOf("<table") < full.indexOf("data-points") && full.indexOf("<table") < full.indexOf("data-suggestion") && full.indexOf("<table") < full.indexOf("data-notes"));
ok("the order is title, badge, verdict, table, points, pointer, notes", [full.indexOf("Medicine OPD, Monday"), full.indexOf("data-badge"), full.indexOf("data-tone"), full.indexOf("<table"), full.indexOf("data-points"), full.indexOf("data-suggestion"), full.indexOf("data-notes")].every((x, i, a) => i === 0 || x > a[i - 1]));
ok("the points are bullets", /<ul[^>]*data-points="true"[^>]*><li>Not sitting on Monday[^<]*<\/li><li>A patient is seen only by the unit/.test(full));
ok("the pointer is one bullet per line inside its blue box", /data-suggestion="true"/.test(full) && /bg-blue-50/.test(full) && (full.match(/<li>/g) ?? []).length === 2 + 3 + 2 && full.includes("For urgent medical attention: the Emergency Department"));
ok("the notes are red bullets", /<ul[^>]*text-red-700[^>]*data-notes="true"/.test(full) && full.includes("OPD hours: 8 AM to 1 PM and 5 PM to 7 PM") && full.includes("Card registration (token) hours"));
ok("the table can scroll sideways on a narrow screen", full.includes("overflow-x-auto"));

// ---- step 54a: captioned extra tables (the doctor's unit, and the unit that sits on the asked date)
const extra = h(
  <HospitalAnswerCard
    answer={{
      title: "Dr. Ajit Karmakar: OPD days",
      badge: { tone: "closed", text: "Closed" },
      extraTables: [
        { title: "Medicine Unit II: Monday and Thursday", table: { columns: ["Room", "Doctor"], rows: [["OPD 25", "Dr. Ajit Karmakar"]] } },
        { title: "Sitting on Tuesday, 27 October 2026", table: { columns: ["Unit", "Room", "Doctor"], rows: [["Unit III", "OPD 25", "Dr. Rajeev Kumar"], ["", "OPD 26", "Dr. Kunj Bihari Singh"]] } },
        { title: "An empty one", table: { columns: ["A"], rows: [] } },
      ],
      lines: ["Dr. Ajit Karmakar sits in Medicine Unit II (OPD 25) on Monday and Thursday."],
    }}
  />,
);
ok("each extra table has its caption and its own headers", extra.includes("Medicine Unit II: Monday and Thursday") && extra.includes("Sitting on Tuesday, 27 October 2026") && (extra.match(/<th /g) ?? []).length === 5);
ok("an extra table with no rows is not drawn", (extra.match(/data-extra-table="true"/g) ?? []).length === 2 && !extra.includes("An empty one"));
ok("the captions come in order, after the verdict and before the points", extra.indexOf("Medicine Unit II: Monday") < extra.indexOf("Sitting on Tuesday") && extra.indexOf("Sitting on Tuesday") < extra.indexOf("data-points") && extra.indexOf("data-badge") < extra.indexOf("Medicine Unit II: Monday"));
ok("the rows are drawn (an empty cell stays empty)", extra.includes("Dr. Kunj Bihari Singh") && /<td[^>]*><\/td>/.test(extra));
const evilExtra = h(<HospitalAnswerCard answer={{ title: "T", extraTables: [{ title: "<script>x</script>", table: { columns: ["<b>"], rows: [["<i>"]] } }] }} />);
ok("captions and cells of extra tables are escaped", !/<script>|<b>|<i>/.test(evilExtra) && evilExtra.includes("&lt;script&gt;"));

// ---- step 54d: the banner right under the verdict, and the question as the last line
const hp = h(
  <HospitalAnswerCard
    answer={{
      title: "Dr. Avisek Mukherjee: OPD days",
      badge: { tone: "closed", text: "Closed" },
      status: { tone: "closed", text: "No: Dr. Avisek Mukherjee does not sit on Tuesday." },
      highlight: "Dr. Avisek Mukherjee sits in Dental OPD 29 on Monday and Friday. Nearest: Monday, 26 October 2026 (tomorrow).",
      table: { columns: ["Room", "Doctor"], rows: [["OPD 29", "Dr. Avisek Mukherjee"]] },
      lines: ["a point"],
      notes: ["OPD hours: 8 AM to 1 PM and 5 PM to 7 PM"],
      prompt: "Which department do you want to visit on Monday, 26 October 2026?",
    }}
  />,
);
ok("the banner is drawn, with its own mark, and says when he is available", /data-highlight="true"/.test(hp) && hp.includes("Nearest: Monday, 26 October 2026 (tomorrow)."));
ok("the banner comes right after the verdict and before the table", hp.indexOf("No: Dr. Avisek") < hp.indexOf("data-highlight") && hp.indexOf("data-highlight") < hp.indexOf("<table"));
ok("the banner is green and bold (eye-catching), not the grey of an ordinary point", /border-emerald-300 bg-emerald-50[^"]*font-semibold text-emerald-900/.test(hp));
ok("the question is the LAST thing, after the red hours", /data-prompt="true"/.test(hp) && hp.indexOf("data-notes") < hp.indexOf("data-prompt") && hp.indexOf("data-prompt") > hp.indexOf("data-points"));
ok("a card with neither has neither", !/data-highlight|data-prompt/.test(h(<HospitalAnswerCard answer={{ title: "T", status: { tone: "open", text: "Yes: x" } }} />)));
const evilHp = h(<HospitalAnswerCard answer={{ title: "T", highlight: "<script>x</script>", prompt: "<img src=x onerror=y>" }} />);
ok("the banner and the question are escaped", !/<script>|<img/.test(evilHp) && evilHp.includes("&lt;script&gt;"));

// ---- step 54i: a short cell is never broken over two lines
const nw = h(
  <HospitalAnswerCard
    answer={{
      title: "T",
      table: { columns: ["OPD", "Doctor", "Ticket", "Days"], rows: [["OPD 12", "Dr. Rupak Kumar Goswami", "not recorded", "Monday, Tuesday, Thursday and Friday"], ["Not in the OPD schedule today", "Dr. A", "DTN00757 (non-permanent)", "Monday"]] },
    }}
  />,
);
const cellClass = (text: string) => (new RegExp(`<td class="([^"]*)">${text}</td>`).exec(nw) ?? [])[1] ?? "";
ok("'OPD 12' stays on one line (first column, short)", /whitespace-nowrap/.test(cellClass("OPD 12")));
ok("'not recorded' and a ticket stay on one line", /whitespace-nowrap/.test(cellClass("not recorded")) && /whitespace-nowrap/.test(cellClass("Monday")));
ok("a long cell still wraps: the days, a name with a note, a long ticket text, a first cell longer than 24 characters", !/whitespace-nowrap/.test(cellClass("Monday, Tuesday, Thursday and Friday")) && !/whitespace-nowrap/.test(cellClass("DTN00757 \\(non-permanent\\)")) && !/whitespace-nowrap/.test(cellClass("Not in the OPD schedule today")) && !/whitespace-nowrap/.test(cellClass("Dr. Rupak Kumar Goswami")));
ok("the headers never wrap", (nw.match(/<th scope="col" class="whitespace-nowrap /g) ?? []).length === 4);

const one = h(<HospitalAnswerCard answer={{ title: "T", suggestion: "For urgent medical attention, you can consult the Emergency Department." }} />);
ok("a one-line pointer is a sentence, not a list with one bullet", /data-suggestion="true"/.test(one) && !/data-suggestion[^>]*>(?:(?!<\/div>).)*<ul/.test(one) && one.includes("For urgent medical attention, you can consult the Emergency Department."));

const bare = h(<HospitalAnswerCard answer={{ title: "Only a title" }} />);
ok("nothing else is drawn when only a title is given", !bare.includes("<table") && !bare.includes("data-tone") && !bare.includes("data-badge") && !bare.includes("data-points") && !bare.includes("data-suggestion") && !bare.includes("data-notes"));
const empty = h(<HospitalAnswerCard answer={{ title: "T", table: { columns: ["A"], rows: [] }, lines: [], notes: [] }} />);
ok("a table with no rows, no points and no notes are not drawn", !empty.includes("<table") && !empty.includes("data-points") && !empty.includes("data-notes"));

const evil = h(<HospitalAnswerCard answer={{ title: "<script>alert(1)</script>", badge: { tone: "open", text: "<i>x</i>" }, lines: ["<img src=x onerror=alert(1)>"], suggestion: "<b>go</b>\n<u>now</u>", notes: ["<svg onload=alert(1)>"], table: { columns: ["<s>"], rows: [["<em>"]] } }} />);
ok("text is escaped, never run (title, badge, points, pointer, notes, table)", !/<script>|<img|<i>|<b>|<u>|<svg onload|<s>|<em>/.test(evil) && evil.includes("&lt;script&gt;"));

for (const tone of ["open", "closed", "unknown"] as const) {
  const t = h(<HospitalAnswerCard answer={{ title: "T", badge: { tone, text: tone === "unknown" ? "Not known" : tone === "open" ? "Open" : "Closed" } }} />);
  ok(`badge ${tone} has its own colour and its word`, t.includes(`data-badge="${tone}"`) && /bg-(green|red|amber)-(600|500)/.test(t) && />(Open|Closed|Not known)<\/span>/.test(t));
}
for (const tone of ["open", "closed", "unknown", "info"] as const) {
  const t = h(<HospitalAnswerCard answer={{ title: "T", status: { tone, text: `verdict ${tone}` } }} />);
  ok(`verdict ${tone} has its own colour classes`, t.includes(`data-tone="${tone}"`) && /bg-(green|red|amber|slate)-100/.test(t));
}
console.log(`HospitalAnswerCard selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

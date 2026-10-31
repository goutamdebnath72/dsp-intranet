// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/ui/answerHeadline.selftest.tsx
// Step 61a: the clean answer first, for holiday and health check-up answers (owner's standing rule of 26 Oct 2026).

import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AnswerHeadline } from "../../components/AnswerHeadline";
import { afterVerdict, HEADLINE_CLASS } from "./answerHeadline";
import { formatCheckupDate, healthHeadline } from "../nl2sql/healthHeadline";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

// ---- under a Yes or No the sentence does not repeat the word
ok("'Yes — 23 October 2025 is a holiday.' -> '23 October 2025 is a holiday.'", afterVerdict("Yes — 23 October 2025 is a holiday.") === "23 October 2025 is a holiday.");
ok("'No, 5 July 2026 is not a holiday.' -> '5 July 2026 is not a holiday.'", afterVerdict("No, 5 July 2026 is not a holiday.") === "5 July 2026 is not a holiday.");
ok("a sentence that does not start with a verdict stays as it is", afterVerdict("Holi falls on 4 March 2026 (Restricted).") === "Holi falls on 4 March 2026 (Restricted).");
ok("'Nobody ...' and 'Yesterday ...' are not verdicts", afterVerdict("Nobody was found.") === "Nobody was found." && afterVerdict("Yesterday was a holiday.") === "Yesterday was a holiday.");
ok("empty, null and undefined are safe", afterVerdict("") === "" && afterVerdict(null) === "" && afterVerdict(undefined) === "");
ok("a bare 'Yes' or 'No' is kept (nothing would be left)", afterVerdict("Yes") === "Yes" && afterVerdict("No.") === "No.");

// ---- the component: the hospital card's look (text-2xl, extra bold; green, red, dark, amber), plain text
for (const tone of ["yes", "no", "info", "unknown"] as const) {
  const html = renderToStaticMarkup(<AnswerHeadline headline={{ text: tone === "yes" ? "Yes" : "05 Jan 2026", tone }} />);
  ok(`tone ${tone}: text-2xl font-extrabold ${HEADLINE_CLASS[tone]}, marked data-headline="${tone}"`, html.includes("text-2xl font-extrabold") && html.includes(HEADLINE_CLASS[tone]) && html.includes(`data-headline="${tone}"`), html);
}
ok("nothing is drawn without a headline", renderToStaticMarkup(<AnswerHeadline headline={null} />) === "" && renderToStaticMarkup(<AnswerHeadline />) === "" && renderToStaticMarkup(<AnswerHeadline headline={{ text: "", tone: "info" }} />) === "");
ok("the text is escaped (it is plain text)", renderToStaticMarkup(<AnswerHeadline headline={{ text: "<b>x</b>", tone: "info" }} />).includes("&lt;b&gt;x&lt;/b&gt;"));
ok("the colours are the hospital card's (so the two never drift apart)", (() => { const h = readFileSync("src/components/HospitalAnswerCard.tsx", "utf8"); return h.includes('yes: "text-green-600"') && h.includes('no: "text-red-600"') && h.includes('info: "text-neutral-900"') && h.includes('unknown: "text-amber-600"') && HEADLINE_CLASS.yes === "text-green-600" && HEADLINE_CLASS.no === "text-red-600" && HEADLINE_CLASS.info === "text-neutral-900" && HEADLINE_CLASS.unknown === "text-amber-600"; })());

// ---- health check-up: ONE person, WHEN or WHICH DEPARTMENT
const row = (t: string, d: string, dep = "SMS-BOF (OPRN)", name = "BIPAD TARAN KUNDU") => ({ ticket_no: t, name, department_code: "32000", department: dep, checkup_date: d, circular: "Circular 010 (2025)" });
const cols = ["ticket_no", "name", "department_code", "department", "checkup_date", "circular"];
ok("'05 Jan 2026' from 2026-01-05", formatCheckupDate("2026-01-05") === "05 Jan 2026" && formatCheckupDate(new Date("2026-01-05T00:00:00")) === "05 Jan 2026" && formatCheckupDate("nonsense") === null && formatCheckupDate(null) === null);
{
  const h = healthHeadline("when is the health check-up of ticket 266288?", cols, [row("266288", "2026-01-05")]);
  ok("'when is the health check-up of ticket 266288?' -> 05 Jan 2026 (the verified answer HC-5)", h?.text === "05 Jan 2026" && h.tone === "info", JSON.stringify(h));
  const two = healthHeadline("when is the health check-up of ticket 205840?", cols, [row("205840", "2024-12-26", "SMS-CCP (OPRN)", "SUBHASISH GOSWAMI"), row("205840", "2024-12-23", "SMS-CCP (OPRN)", "SUBHASISH GOSWAMI")]);
  ok("a ticket listed twice -> both dates, in order: '23 Dec 2024 and 26 Dec 2024' (the verified answer for ticket 205840)", two?.text === "23 Dec 2024 and 26 Dec 2024", JSON.stringify(two));
  ok("'when is the health check-up of prasenjit khan?' (by name) -> the date", healthHeadline("when is the health check-up of prasenjit khan?", cols, [row("329066", "2026-01-05", "PLANT GARAGE (M.H.E.M.D.)", "PRASENJIT KHAN")])?.text === "05 Jan 2026");
  const dep = healthHeadline("which department is ticket 228757 in for the January 2026 health check-up?", cols, [row("228757", "2026-01-01", "CO & CC (BATTERY)", "BISWAJIT BHATTACHARJEE")]);
  ok("'which department is ticket 228757 in for the January 2026 health check-up?' -> CO & CC (BATTERY) (the verified answer HC-1)", dep?.text === "CO & CC (BATTERY)", JSON.stringify(dep));
}
ok("a LIST of people ('who has the health check-up on 5 January 2026') gets no headline: it keeps its count", healthHeadline("who has the health check-up on 5 January 2026?", cols, [row("1", "2026-01-05"), row("2", "2026-01-05"), row("3", "2026-01-05")]) === null);
ok("two different people with 'when' -> none (not one person)", healthHeadline("when is the health check-up of ticket 1 and 2", cols, [row("1", "2026-01-05"), row("2", "2026-01-06")]) === null);
ok("not a health check-up question -> none", healthHeadline("when is the holiday", cols, [row("1", "2026-01-05")]) === null);
ok("no rows, or no date column, or a date that is not a date -> none", healthHeadline("when is the health check-up of ticket 1", cols, []) === null && healthHeadline("when is the health check-up of ticket 1", ["ticket_no", "name"], [{ ticket_no: "1", name: "A" }]) === null && healthHeadline("when is the health check-up of ticket 1", cols, [row("1", "soon")]) === null);
ok("a question that asks neither when nor which department -> none", healthHeadline("show the health check-up of ticket 266288", cols, [row("266288", "2026-01-05")]) === null);

// ---- the screen really draws it (one place, above the count and the sentences), and the types are the same on both sides
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("OmnibarModal draws <AnswerHeadline headline={analytics.headline} /> before the count", modal.includes("<AnswerHeadline headline={analytics.headline} />") && modal.indexOf("<AnswerHeadline headline={analytics.headline} />") < modal.indexOf("analytics.count.toLocaleString()"));
ok("the sentence under a Yes or No does not repeat it (lead and answer)", modal.includes("analytics.headline ? afterVerdict(analytics.lead) : analytics.lead") && modal.includes("analytics.headline ? afterVerdict(analytics.answer) : analytics.answer"));
ok("AnalyticsPayload (backend) and AnalyticsAnswer (screen) both carry the same headline type", readFileSync("src/lib/employees/analytics.ts", "utf8").includes('headline?: import("@/lib/ui/answerHeadline").AnswerHeadline;') && readFileSync("src/hooks/useOmniSearch.ts", "utf8").includes('headline?: import("@/lib/ui/answerHeadline").AnswerHeadline;'));
ok("the circular answer card is already ANSWER FIRST (one large key figure for a single fact): unchanged", readFileSync("src/components/CircularAnswerCard.tsx", "utf8").includes("ANSWER FIRST"));

console.log(`answerHeadline selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

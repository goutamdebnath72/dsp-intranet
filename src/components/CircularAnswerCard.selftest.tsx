// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/CircularAnswerCard.selftest.tsx
// Renders the real answer card to static HTML: which circular each row comes from, the caveat, the note.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CircularAnswerCard } from "./CircularAnswerCard";
import type { CircularAnswer } from "@/lib/search/circularAnswer";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const SRC_A = { n: 1, type: "circular" as const, id: 10, headline: "Circular -Extension of SAIL Mediclaim policy (26-27)", publishedAt: "2026-08-20T00:00:00.000Z", page: 2 };
const SRC_B = { n: 2, type: "circular" as const, id: 11, headline: "Circular- Extension of SAIL Mediclaim policy (2026-2027)", publishedAt: "2026-08-11T00:00:00.000Z", page: 2 };
const row = (label: string, value: string, source: number, linked?: boolean) => ({ label, column: "Renewal deadline", value, source, quote: `quote for ${label}`, page: 2, ...(linked === undefined ? {} : { linked }) });
const html = (a: Partial<CircularAnswer> & Pick<CircularAnswer, "rows" | "sources">) => renderToStaticMarkup(<CircularAnswerCard state={{ status: "done", answer: { title: "Deadlines", note: "", ...a } }} onOpenSource={() => {}} />);
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const two = text(html({ rows: [row("Extended last date", "31.08.2026", 1, false), row("Original deadline", "20-08-2026", 2, false)], sources: [SRC_A, SRC_B] }));
ok("with two sources, each row says which circular it comes from and when", two.includes("Extended last date Circular -Extension of SAIL Mediclaim policy (26-27) · 20 Aug 2026 31.08.2026") && two.includes("Original deadline Circular- Extension of SAIL Mediclaim policy (2026-2027) · 11 Aug 2026 20-08-2026"), two.slice(0, 900));
const one = text(html({ rows: [row("Extended last date", "31.08.2026", 1), row("Original deadline", "20-08-2026", 1)], sources: [SRC_A] }));
const caps = text(html({ rows: [row("Extended last date", "31.08.2026", 1), row("Original deadline", "20-08-2026", 2)], sources: [{ ...SRC_A, headline: "CIRCULAR -EXTENSION OF SAIL MEDICLAIM POLICY (26-27)" }, SRC_B] }));
ok("an ALL-CAPS headline is tidied on the row line exactly as in the Sources list", caps.includes("Extended last date Circular -Extension of SAIL Mediclaim policy (26-27) · 20 Aug 2026") && !caps.includes("EXTENSION OF SAIL"), caps.slice(0, 500));
ok("with one source, the rows carry no source line (it is the Source box below)", !one.includes("Extended last date Circular") && one.includes("Source"), one.slice(0, 400));
const long = text(html({ rows: [row("A", "1", 1), row("B", "2", 2)], sources: [{ ...SRC_A, headline: "A very long circular headline ".repeat(6) }, SRC_B] }));
ok("a long headline is cut", /\u2026 · 20 Aug 2026/.test(long) || long.includes("… · 20 Aug 2026"), long.slice(0, 300));
ok("a row whose source is not listed shows nothing instead of failing", (() => { try { return html({ rows: [row("A", "1", 9), row("B", "2", 1)], sources: [SRC_A, SRC_B] }).length > 100; } catch { return false; } })());
ok("the caveat shows only when a row is the assistant's wording", text(html({ rows: [row("A", "1", 1, false)], sources: [SRC_A] })).includes("own wording") && !text(html({ rows: [row("A", "1", 1, true)], sources: [SRC_A] })).includes("own wording") && !text(html({ rows: [row("A", "1", 1)], sources: [SRC_A] })).includes("own wording"));
ok("the note is shown", text(html({ rows: [row("A", "1", 1)], sources: [SRC_A], note: "This lists what was found in the circulars retrieved for this question; other circulars may also apply." })).includes("other circulars may also apply"));

const rowOf = (label: string, column: string) => ({ label, column, value: "Four (04)", source: 1, quote: `quote for ${label}`, page: 2 });
const single = (label: string, column: string) => text(html({ rows: [rowOf(label, column)], sources: [SRC_A] }));
ok("single figure: a column that repeats the label is not shown twice", single("Last date", "Last date").includes("LAST DATE") === false && !/Last date . Last date/i.test(single("Last date", "Last date")) && !single("Gift Card Amount", "Amount").includes("Gift Card Amount · Amount"), single("Last date", "Last date"));
ok("single figure: a column that adds something is still shown", single("Extended renewal deadline", "Last date of renewal").includes("Extended renewal deadline · Last date of renewal"), single("Extended renewal deadline", "Last date of renewal"));
const two2 = text(html({ rows: [rowOf("Casual Leave", "Casual Leave"), rowOf("Medical Leave", "Medical Leave Days")], sources: [SRC_A] }));
ok("table: a repeated sub-label is dropped, a different one is kept", !/Casual Leave Casual Leave/.test(two2) && two2.includes("Medical Leave Days") === false ? true : /Medical Leave Medical Leave Days/.test(two2) === false, two2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

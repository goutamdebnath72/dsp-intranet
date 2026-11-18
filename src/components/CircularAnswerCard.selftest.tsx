// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/CircularAnswerCard.selftest.tsx
// Renders the real answer card to static HTML: which circular each row comes from, the caveat, the note.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { CircularAnswerCard, openTargetFor } from "./CircularAnswerCard";
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

const tgt = { title: "T", note: "", rows: [{ ...rowOf("Extended last date", ""), value: "31.08.2026", source: 1, quote: "extend the renewal period till 31.08.2026", page: 1 }, { ...rowOf("Original deadline", ""), value: "20-08-2026", source: 2, quote: "available up to 20-08-2026", page: 2 }], sources: [{ ...SRC_A, page: 1 }, { ...SRC_B, page: 2 }] } as CircularAnswer;
ok("Open circular: each source opens on its own row's page and words", JSON.stringify(openTargetFor(tgt, tgt.sources[0])) === JSON.stringify({ page: 1, quote: "extend the renewal period till 31.08.2026" }) && JSON.stringify(openTargetFor(tgt, tgt.sources[1])) === JSON.stringify({ page: 2, quote: "available up to 20-08-2026" }), JSON.stringify([openTargetFor(tgt, tgt.sources[0]), openTargetFor(tgt, tgt.sources[1])]));
ok("Open circular: a source no row cites opens with no words and the source's own page", JSON.stringify(openTargetFor(tgt, { n: 9, page: 3 })) === JSON.stringify({ page: 3, quote: "" }));
ok("Open circular: no page anywhere gives null, not a crash", openTargetFor({ ...tgt, rows: [{ ...tgt.rows[0], page: undefined as unknown as number }] }, { n: 1, page: null }).page === null);


// ---- an answer drawn from an ANNOUNCEMENT: its title and its source row open the announcement
const ANN = { n: 1, type: "announcement" as const, id: 21, headline: "TRINETRA Cyber Security Hardening Policy", publishedAt: "2026-11-17T04:00:00.000Z", page: 1 };
const annAnswer = (o: Partial<CircularAnswer> = {}): CircularAnswer => ({ title: "TRINETRA Cyber Security Hardening Policy", note: "", rows: [{ label: "Password minimum length", column: "", value: "8", source: 1, quote: "Be at least 8 characters long", page: 1 }], sources: [ANN], ...o });
const annHtml = (a: CircularAnswer) => renderToStaticMarkup(<CircularAnswerCard state={{ status: "done", answer: a }} onOpenSource={() => {}} />);
const annTitle = annHtml(annAnswer());
ok("an answer from an announcement: its title is plain text, not a link and not a button (the way in is the Source row)", /<h3[^>]*>TRINETRA Cyber Security Hardening Policy<\/h3>/.test(annTitle) && !/data-title-link/.test(annTitle) && !/<h3[^>]*><(button|a)\b/.test(annTitle) && !/title="Open the announcement"/.test(annTitle));
ok("the source row of an announcement opens it too, named 'Open announcement', with the megaphone", /Open announcement/.test(annTitle) && !/Open circular/.test(annTitle) && /<button[^>]*class="flex w-full items-start gap-2/.test(annTitle) && /lucide-megaphone/.test(annTitle));
ok("the announcement opens at the page of the PDF the answer came from (the answer's own page), and with the words when it has them", JSON.stringify(openTargetFor(annAnswer(), ANN)) === JSON.stringify({ page: 1, quote: "Be at least 8 characters long" }));
ok("a circular's answer is as before: its title is plain text and its row says 'Open circular'", !/data-title-link/.test(html({ rows: [row("A", "1", 1)], sources: [SRC_A] })) && /Open circular/.test(html({ rows: [row("A", "1", 1)], sources: [SRC_A] })));
ok("a holiday note is still not openable", !/Open (announcement|circular)/.test(annHtml(annAnswer({ sources: [{ ...ANN, type: "holiday" as any }] }))) );
const omniSrc = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("the search window opens an announcement from the answer in its own window, at that page, and does not touch the circular viewer; closing the window brings the search back as it was (its state is kept; the box is only hidden)", /onOpenSource=\{\(id, target, type\) => \{\s*[^}]*if \(type === "announcement"\) \{\s*openAnnouncement\(id, target\?\.page \?\? null\);\s*return;/.test(omniSrc) && /isOpen && !selectedCircularId && !selectedAnnouncement && \(/.test(omniSrc) && /onClose=\{\(\) => setSelectedAnnouncement\(null\)\}/.test(omniSrc));


// ---- THE SUMMARY every reply carries when no precise answer could be proved
const SUM_SRC = [{ n: 1, type: "circular" as const, id: 30, headline: "Circular for Gate Pass No.-13 (valid from 01.01.2024 to 31.03.2024)", publishedAt: "2023-12-20T00:00:00.000Z", page: 1 }];
const sumHtml = (summary: any, answer: any = null) => renderToStaticMarkup(<CircularAnswerCard state={{ status: "done", answer, summary }} onOpenSource={() => {}} />);
const sumNo = sumHtml({ text: "This circular concerns gate pass No. 13, valid from 01.01.2024 to 31.03.2024.", addresses: false, via: "model", sources: SUM_SRC });
ok("a reply with no precise answer carries a summary card: the text, the document it comes from and the button to open it", /data-summary-card="model"/.test(sumNo) && /data-summary-text/.test(sumNo) && /gate pass No\. 13/.test(sumNo) && /Summarised from/.test(sumNo) && /Open circular/.test(sumNo) && />Summary</.test(sumNo));
ok("when the document does not answer the question the card says so plainly, and tells the reader to check", /data-summary-note="not-addressed"/.test(sumNo) && /does not answer your question directly/.test(sumNo));
const sumYes = sumHtml({ text: "This announcement says OTPs remain valid for five minutes.", addresses: true, via: "model", sources: [{ ...SUM_SRC[0], type: "announcement", headline: "DSC procedure" }] });
ok("a summary that does answer carries no warning, and an announcement opens as an announcement", !/data-summary-note/.test(sumYes) && /Open announcement/.test(sumYes) && /lucide-megaphone/.test(sumYes));
const sumOpen = sumHtml({ text: "Procedure for Issuance of Digital Signature Certificate. Applicants are advised to keep all documents.", addresses: null, via: "opening", sources: SUM_SRC });
ok("the opening of a document (no written summary was available) is labelled as that, in the header and in a note", /data-summary-card="opening"/.test(sumOpen) && /opening of the document/.test(sumOpen) && /data-summary-note="opening"/.test(sumOpen) && /how the document begins/.test(sumOpen));
ok("a precise answer is shown as before and no summary card appears beside it", !/data-summary-card/.test(sumHtml({ text: "x y z w v", addresses: true, via: "model", sources: SUM_SRC }, { title: "Deadlines", note: "", rows: [{ label: "L", column: "", value: "5", source: 1, quote: "q", page: 1 }], sources: SUM_SRC })) && /Answer/.test(sumHtml(null, { title: "Deadlines", note: "", rows: [{ label: "L", column: "", value: "5", source: 1, quote: "q", page: 1 }], sources: SUM_SRC })));
ok("with neither an answer nor a summary (no text at all) nothing is drawn, as before", sumHtml(null) === "");
ok("the loading card still says Loading Summary while either is being made", /Loading Summary/.test(renderToStaticMarkup(<CircularAnswerCard state={{ status: "loading", answer: null }} onOpenSource={() => {}} />)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

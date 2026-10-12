// src/components/SourceBar.selftest.tsx
// Run:  npx tsx --tsconfig tsconfig.selftest.json src/components/SourceBar.selftest.tsx      (no browser: the component is rendered to HTML)
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceBar, pagesText } from "./SourceBar";
import type { CircularSource } from "../lib/nl2sql/clientTypes";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

const one: CircularSource = { circularId: 23, label: "Circular 003 (2024)", title: "CIRCULAR-HEALTH CHECK UP OF NON-EXECUTIVE EMPLOYEES DURING THE MONTH OF JANUARY-2025", pages: [5] };
const two: CircularSource = { circularId: 30, label: "Circular 009 (2024)", title: "CIRCULAR-HEALTH CHECK-UP FOR NON-EXECUTIVE EMPLOYEES DURING THE MONTH OF DECEMBER-2024", pages: [3, 4, 8] };
const noPage: CircularSource = { circularId: 37, label: "Circular 006 (2025)", title: "CIRCULAR- HEALTH CHECK UP OF NON- EXECUTIVE EMPLOYEES FOR JAN-2026", pages: [] };
const noop = () => undefined;

function buttons(node: ReactNode, out: ReactElement<{ onClick?: () => void }>[] = []): ReactElement<{ onClick?: () => void }>[] {
  if (Array.isArray(node)) node.forEach((n) => buttons(n, out));
  else if (isValidElement(node)) {
    const el = node as ReactElement<{ onClick?: () => void; children?: ReactNode }>;
    if (el.type === "button") out.push(el);
    buttons(el.props.children, out);
  }
  return out;
}

check("pages in words: none, one, several", pagesText([]) === "" && pagesText([5]) === "page 5" && pagesText([3, 4, 8]) === "pages 3, 4, 8");

const html = renderToStaticMarkup(createElement(SourceBar, { sources: [one, two], onOpen: noop }));
check("each circular: 'Source:', its number and year, its title and its page(s)", html.includes("Source: ") && html.includes("Circular 003 (2024)") && html.includes("January-2025") && html.includes("page 5") && html.includes("Circular 009 (2024)") && html.includes("December-2024") && html.includes("pages 3, 4, 8"));
check("the way in is a visible BUTTON with the words 'Open circular' (not a bare icon or an unmarked link)", (html.match(/<button/g) ?? []).length === 2 && (html.match(/Open circular/g) ?? []).length === 2);
check("each button has an accessible name and a tooltip that say what it opens and why", html.includes('aria-label="Open Circular 003 (2024), Circular-Health check up of non-executive employees during the month of January-2025, page 5"') && html.includes("to check this answer against the original"));
check("it is a labelled group for screen readers", html.includes('role="group"') && html.includes('aria-label="Source of this answer"'));
check("a title typed in capitals is shown in running letters (the stored title is not changed)", !html.includes("HEALTH CHECK UP") && html.includes("Circular-Health check up of non-executive employees"));
check("a circular whose page is unknown is still shown, without 'page' text", !renderToStaticMarkup(createElement(SourceBar, { sources: [noPage], onOpen: noop })).includes("page ") && renderToStaticMarkup(createElement(SourceBar, { sources: [noPage], onOpen: noop })).includes("Circular 006 (2025)"));
check("no sources: nothing is drawn", renderToStaticMarkup(createElement(SourceBar, { sources: [], onOpen: noop, note: "ignored" })) === "");
const withNote = renderToStaticMarkup(createElement(SourceBar, { sources: [one], note: "2 of the 15 people listed are not in the HR directory (the ticket shown is as printed in the circular): A B, C D.", onOpen: noop }));
check("the note about unconfirmed people appears in the bar when there is one", withNote.includes("2 of the 15 people listed are not in the HR directory") && withNote.includes("A B, C D"));
check("...and nothing about HR appears when there is no note", !html.includes("HR directory") && !renderToStaticMarkup(createElement(SourceBar, { sources: [one], note: null, onOpen: noop })).includes("HR directory"));
const evil = '<img src=x onerror="alert(1)">';
const evilHtml = renderToStaticMarkup(createElement(SourceBar, { sources: [{ ...one, title: evil }], note: evil, onOpen: noop }));
check("a title or note containing HTML is shown as text, never run", evilHtml.includes("&lt;img src=x") && !evilHtml.includes("<img"));

const calls: Array<[number, number[]]> = [];
const tree = SourceBar({ sources: [one, two, noPage], onOpen: (id, pages) => calls.push([id, pages]) });
const bs = buttons(tree);
bs.forEach((b) => b.props.onClick?.());
check("clicking each button passes that circular's id and pages to the viewer: (23, [5]) (30, [3,4,8]) (37, [])", bs.length === 3 && JSON.stringify(calls) === JSON.stringify([[23, [5]], [30, [3, 4, 8]], [37, []]]), JSON.stringify(calls));

console.log(`\nSourceBar selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

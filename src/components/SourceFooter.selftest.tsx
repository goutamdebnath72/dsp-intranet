// src/components/SourceFooter.selftest.tsx
// Run:  npx tsx --tsconfig tsconfig.selftest.json src/components/SourceFooter.selftest.tsx      (no browser: the component is rendered to HTML)
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceFooter, pagesText } from "./SourceFooter";
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

// find every <button> in an element tree without a DOM: the component is called as a function and the returned tree is walked
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

const html = renderToStaticMarkup(createElement(SourceFooter, { sources: [one, two], onOpen: () => undefined }));
check("each circular is shown with its number and year AND its title", html.includes("Circular 003 (2024)") && html.includes("JANUARY-2025") && html.includes("Circular 009 (2024)") && html.includes("DECEMBER-2024"));
check("...with the page(s) the people stand on", html.includes("page 5") && html.includes("pages 3, 4, 8"));
check("it is headed 'Source' and is a labelled group (for screen readers)", html.includes(">Source<") && html.includes('aria-label="Source of this answer"'));
check("each circular is a real button with an accessible name that says what it opens", (html.match(/<button/g) ?? []).length === 2 && html.includes('aria-label="Open Circular 003 (2024), CIRCULAR-HEALTH CHECK UP OF NON-EXECUTIVE EMPLOYEES DURING THE MONTH OF JANUARY-2025, page 5"'));
check("a circular whose page is not known is still shown (no 'page' text, no dangling dash)", renderToStaticMarkup(createElement(SourceFooter, { sources: [noPage], onOpen: () => undefined })).includes("Circular 006 (2025)") && !renderToStaticMarkup(createElement(SourceFooter, { sources: [noPage], onOpen: () => undefined })).includes("page"));
check("no sources: nothing is drawn at all", renderToStaticMarkup(createElement(SourceFooter, { sources: [], onOpen: () => undefined })) === "");
check("the title is escaped, never injected as HTML", renderToStaticMarkup(createElement(SourceFooter, { sources: [{ ...one, title: '<img src=x onerror="alert(1)">' }], onOpen: () => undefined })).includes("&lt;img src=x") && !renderToStaticMarkup(createElement(SourceFooter, { sources: [{ ...one, title: '<img src=x onerror="alert(1)">' }], onOpen: () => undefined })).includes("<img"));

// a click opens THAT circular at THOSE pages
const calls: Array<[number, number[]]> = [];
const tree = SourceFooter({ sources: [one, two, noPage], onOpen: (id, pages) => calls.push([id, pages]) });
const bs = buttons(tree);
bs.forEach((b) => b.props.onClick?.());
check("clicking each line passes that circular's id and its pages to the viewer: (23, [5]) (30, [3,4,8]) (37, [])", bs.length === 3 && JSON.stringify(calls) === JSON.stringify([[23, [5]], [30, [3, 4, 8]], [37, []]]), JSON.stringify(calls));

console.log(`\nSourceFooter selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

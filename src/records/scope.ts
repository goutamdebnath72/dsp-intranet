// src/records/scope.ts
//
// WHAT A SELECTION DOES ON THE SERVER, in one place: which of the answer paths of src/lib/nl2sql/omnibar.ts may run under each, and what to say when the chosen one has nothing.
// "auto" lets every path run (today). A chosen scope lets ONLY its own paths run: the line is never trafficked to the others, and a chosen scope that finds nothing says so (it does not fall through to
// the circulars). The management pages and their leading-action-word requests ("add new employee", "post circular") are always allowed: they only open for the words that ask for them, and each checks who is calling.

import type { PeopleFacet, ScopeId, Selection } from "./types";
import { DOMAIN_IDS, domainById, isPeopleFacet } from "./domains";

/** the answer paths of runOmnibar, by name */
export type Step = "admin" | "dates" | "cugPattern" | "pax" | "hospital" | "phd" | "degrees" | "holiday" | "departmentWords" | "verified" | "model";

const ALLOWED: Record<ScopeId, ReadonlySet<Step>> = {
  auto: new Set<Step>(["admin", "dates", "cugPattern", "pax", "hospital", "phd", "degrees", "holiday", "departmentWords", "verified", "model"]),
  people: new Set<Step>(["admin", "dates", "cugPattern", "phd", "departmentWords", "verified", "model"]),
  pax: new Set<Step>(["admin", "pax"]),
  hospital: new Set<Step>(["admin", "hospital"]),
  holidays: new Set<Step>(["admin", "holiday"]),
  degrees: new Set<Step>(["admin", "degrees", "phd"]),
  documents: new Set<Step>(["admin"]),
  eds: new Set<Step>(["admin"]), // never asked of the records: EDS has its own route (mode=intellectual)
  admin: new Set<Step>(["admin"]), // the management pages only; any other line says nothing was found (answerScoped)
};

export function stepAllowed(scope: ScopeId, step: Step): boolean {
  return ALLOWED[scope].has(step);
}

/** the scope of a request: anything that is not one of the fixed selections is "auto" (a typed URL cannot invent one) */
export function parseScope(raw: string | null | undefined): ScopeId {
  const v = String(raw ?? "").trim().toLowerCase();
  return (DOMAIN_IDS as readonly string[]).includes(v) || v === "admin" ? (v as ScopeId) : "auto";
}

export function parseFacet(raw: string | null | undefined): PeopleFacet {
  const v = String(raw ?? "").trim().toLowerCase();
  return isPeopleFacet(v) ? v : "ask";
}

/** the sentence shown when a CHOSEN scope has nothing for the line (the bar does not go looking elsewhere) */
export function nothingInScope(scope: ScopeId, line: string): string {
  const d = domainById(scope);
  const where = scope === "admin" ? "Admin" : d ? d.label : "this selection";
  const eg = scope === "admin" ? ' Type the words of a management page, for example "management" or "employee management".' : d?.examples[0] ? ` For example: "${d.examples[0]}".` : "";
  return `I found nothing for "${line}" under ${where}. Check the spelling, or choose Everything to search all of the intranet.${eg}`;
}

export const AUTO_SELECTION: Selection = { scope: "auto", facet: "find", dept: "", grade: "", nm: "" };

/** the part of the search address that carries the selection ("" under Everything, so an address under Everything is exactly what it always was) */
export function selectionQuery(sel: Selection | undefined): string {
  if (!sel || sel.scope === "auto" || sel.scope === "eds") return ""; // EDS travels as mode=intellectual, not as a selection
  let out = `&scope=${encodeURIComponent(sel.scope)}`;
  if (sel.scope === "people") {
    out += `&facet=${encodeURIComponent(sel.facet)}`;
    if (sel.facet === "roster") {
      if (sel.dept) out += `&dept=${encodeURIComponent(sel.dept)}`;
      if (sel.grade) out += `&grade=${encodeURIComponent(sel.grade)}`;
      if (sel.nm.trim()) out += `&nm=${encodeURIComponent(sel.nm.trim())}`;
    }
  }
  return out;
}

/** the line of text that stands for a finder choice (the box shows it, the search is keyed by it) */
export function finderLabel(parts: { deptName?: string | null; gradeName?: string | null; nm?: string | null }): string {
  const a = parts.gradeName || "Employees";
  const b = parts.deptName ? ` in ${parts.deptName}` : "";
  const c = parts.nm && parts.nm.trim() ? ` named like ${parts.nm.trim()}` : "";
  return `${a}${b}${c}`;
}

/** can the finder be run: at least one of the two lists, or a name */
export const finderReady = (sel: Selection): boolean => !!(sel.dept || sel.grade || sel.nm.trim().length >= 2);

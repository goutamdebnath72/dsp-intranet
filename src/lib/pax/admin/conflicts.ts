// src/lib/pax/admin/conflicts.ts
//
// DOES A NEW OR CHANGED LINE CLASH WITH A SAVED ONE? (step 64a; owner, 31 Oct 2026: "no entry must conflict with any currently saved one: inform him and ask whether he wants to edit an existing one
// or has made a mistake"). PURE. Three kinds of clash, each with its own way out:
//   same-number    the number is already assigned to another line.            No way through: the number belongs to one place. Edit the saved line, or correct the entry.
//   same-place     the department and the location are already saved (with another number).   Maybe a SECOND number of the same place ("40926 / 42043"): he may say so. Or edit the saved line, or correct the entry.
//   similar-place  a saved place that reads almost the same (a spelling slip, "Gate No. 2" for "Gate No. 2A", the words in another order).   Maybe a different place: he may say so. Or edit, or correct.
// The saved lines are named in the table's own words (department, location): the same splitting the search table uses (display.ts).

import { matchToken } from "../matcher";
import { normalizePax, type PaxRow } from "../matcher";
import { splitLabels, toEntries } from "../display";
import { EMPTY_LOCATION } from "../answer";
import type { Acknowledge, PaxConflict, PaxEntryView } from "./types";
import type { EntryInput } from "./validate";

const JOIN = new Set(["and", "of", "the", "at", "for", "s"]);

/** "Office" and "no location" are the same place (the table shows Office for an empty location). */
const locationKey = (loc: string): string => {
  const n = normalizePax(loc);
  return !n || n === normalizePax(EMPTY_LOCATION) ? normalizePax(EMPTY_LOCATION) : n;
};
export const placeKey = (department: string, location: string): string => `${normalizePax(department)}|${locationKey(location)}`;

/** The words actually written: an empty location adds none (the word Office of the table is only a stand-in, and would stop "CISF Tumla Gate" reading like "CISF" / "Tumla Gate"). */
const wordsOf = (department: string, location: string): string[] => `${normalizePax(department)} ${normalizePax(location)}`.split(" ").filter((t) => t && !JOIN.has(t));

/** Both ways every word has a counterpart (the same word, a short number and the same number with a letter, a slip of one letter): the two places read alike. */
function readAlike(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const sa = new Set(a), sb = new Set(b);
  return a.every((t) => matchToken(t, sb) !== null) && b.every((t) => matchToken(t, sa) !== null);
}

export interface SavedLine extends PaxEntryView { place: string; words: string[] }

/** The saved lines in the table's own words. Lines without an id (never read from the table) are left out: nothing can be edited without one. */
export function savedLines(rows: PaxRow[]): SavedLine[] {
  const parts = splitLabels(toEntries(rows));
  const out: SavedLine[] = [];
  for (const r of rows) {
    if (r.id === undefined) continue;
    const p = parts.get(r.label.trim()) ?? { department: r.label, location: "" };
    out.push({ id: r.id, department: p.department, location: p.location, number: r.number, place: placeKey(p.department, p.location), words: wordsOf(p.department, p.location) });
  }
  return out;
}

export interface ConflictOptions {
  /** The line being changed: it never clashes with itself. */
  ignoreId?: number;
  /** When a line is changed and keeps its number, the number is not checked again (42043 stands on two lines already, and changing the location of one must stay possible). */
  keepsNumber?: boolean;
}

const view = (l: SavedLine): PaxEntryView => ({ id: l.id, department: l.department, location: l.location, number: l.number });

export function findConflicts(rows: PaxRow[], candidate: EntryInput, opts: ConflictOptions = {}): PaxConflict[] {
  const lines = savedLines(rows).filter((l) => l.id !== opts.ignoreId);
  const conflicts: PaxConflict[] = [];

  if (!opts.keepsNumber) {
    const same = lines.filter((l) => l.number === candidate.number);
    if (same.length) conflicts.push({ kind: "same-number", existing: same.map(view) });
  }

  const key = placeKey(candidate.department, candidate.location);
  const samePlace = lines.filter((l) => l.place === key);
  if (samePlace.length) conflicts.push({ kind: "same-place", existing: samePlace.map(view) });

  const mine = wordsOf(candidate.department, candidate.location);
  const alike = lines.filter((l) => l.place !== key && readAlike(mine, l.words));
  if (alike.length) conflicts.push({ kind: "similar-place", existing: alike.map(view) });

  return conflicts;
}

/** The words the panel shows for a saved line: "CISF · Tumla Gate · 40926". */
export const describeLine = (l: PaxEntryView): string => `${l.department} · ${l.location || EMPTY_LOCATION} · ${l.number}`;

/**
 * May the person go on after answering? A number is never shared. The other two clashes may be answered, each by its own answer and only when it is true:
 * "second-number" = another number of the same place; "different" = a different place that merely reads alike.
 */
export function acknowledgementCovers(conflicts: PaxConflict[], acks: Acknowledge[] = []): boolean {
  if (conflicts.length === 0) return true;
  if (conflicts.some((c) => c.kind === "same-number")) return false;
  return conflicts.every((c) => (c.kind === "same-place" ? acks.includes("second-number") : acks.includes("different")));
}

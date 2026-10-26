// src/lib/qualifications/parse.ts
//
// Reads a PRINTED qualification ("MD(MEDICINE)", "MBBS,DGO", "MCH & DRNB PLASTIC SURGERY", "M.Tech (CSE)", "Bachelor of Technology") with the table of degrees (degrees.ts): which degrees it names, the HIGHEST
// level among them, and the subject (step 58a). A degree the table does not know is reported, never guessed.
//
//   "MBBS,DGO"                     -> MBBS (graduate), DGO (postgraduate)     highest postgraduate
//   "MCH & DRNB PLASTIC SURGERY"   -> MCh (super-specialty), DrNB (same)      highest superspecialty, subject PLASTIC SURGERY
//   "MD (COMMUNITY MEDICINE)"      -> MD (postgraduate)                       subject COMMUNITY MEDICINE

import { DEGREES, LEVEL_RANK, type DegreeDef, type Level } from "./degrees";

/** Capitals, letters and digits only: "M.B.B.S." = "mbbs", "B. Tech" = "btech". */
export const keyOf = (s: string): string => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const BY_KEY = new Map<string, DegreeDef>();
/** A spelling that two different degrees claim (it must stay empty: qualifications.selftest.ts checks). */
export const KEY_CONFLICTS: string[] = [];
for (const def of DEGREES) {
  for (const k of new Set([def.code, def.name, ...def.aliases].map(keyOf))) {
    const had = BY_KEY.get(k);
    if (had && had !== def) KEY_CONFLICTS.push(`${k}: ${had.code} and ${def.code}`);
    else BY_KEY.set(k, def);
  }
}
export const degreeByKey = (k: string): DegreeDef | undefined => BY_KEY.get(keyOf(k));

export interface ParsedDegree { code: string; name: string; level: Level; subject: string | null }
export interface ParsedQualification {
  printed: string;
  degrees: ParsedDegree[];
  /** The highest level among the degrees, or null when none is recognised. */
  highest: Level | null;
  /** The subject of the highest degree (or of the last degree that has one), upper case, or null. */
  subject: string | null;
  /** Pieces of the printed text the table does not know. */
  unrecognised: string[];
}

/** Names and spellings that contain "and" or "&" themselves ("Bachelor of Medicine and Bachelor of Surgery", "DTM&H", "BVSc & AH"): protected before the text is split at "and" / "&". */
const PROTECTED = DEGREES.flatMap((def) => [def.code, def.name, ...def.aliases])
  .filter((x) => /&|\band\b/i.test(x))
  .sort((a, b) => b.length - a.length)
  .map((x) => new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "gi"));
const protect = (text: string): string => PROTECTED.reduce((t, re) => t.replace(re, (m) => m.replace(/&/g, "\u0001").replace(/\s+and\s+/gi, " \u0002 ")), text);
const unprotect = (text: string): string => text.replace(/\u0001/g, "&").replace(/\u0002/g, "and");

/** Splits at , ; / + & and the word AND, but never inside brackets. */
function splitDegrees(text: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    const rest = text.slice(i);
    if (depth === 0 && (c === "," || c === ";" || c === "/" || c === "+" || c === "&" || /^\s+AND\s+/i.test(rest) && /\s/.test(c))) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      const m = /^\s+AND\s+/i.exec(rest);
      if (m && /\s/.test(c)) i += m[0].length - 1;
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const cleanSubject = (s: string): string | null => {
  const t = s.replace(/^[\s,:\-–]+/, "").replace(/^(IN|OF|FOR|ON)\s+/i, "").replace(/[\s.]+$/, "").trim();
  return t ? t.toUpperCase() : null;
};

export function parseQualification(printed: string | null | undefined): ParsedQualification {
  const text = String(printed ?? "").trim();
  const result: ParsedQualification = { printed: text, degrees: [], highest: null, subject: null, unrecognised: [] };
  if (!text) return result;
  for (const piece of splitDegrees(protect(text)).map(unprotect)) {
    const paren = [...piece.matchAll(/[(\[]([^)\]]*)[)\]]/g)].map((m) => m[1].trim()).filter(Boolean).join(" ");
    const core = piece.replace(/[(\[][^)\]]*[)\]]/g, " ").replace(/\s+/g, " ").trim();
    const words = core.split(" ").filter(Boolean);
    let found: { def: DegreeDef; used: number } | null = null;
    for (let n = Math.min(8, words.length); n >= 1 && !found; n--) {
      const def = BY_KEY.get(keyOf(words.slice(0, n).join("")));
      if (def) found = { def, used: n };
    }
    if (!found) { result.unrecognised.push(piece); continue; }
    const subject = cleanSubject([paren, words.slice(found.used).join(" ")].filter(Boolean).join(" "));
    result.degrees.push({ code: found.def.code, name: found.def.name, level: found.def.level, subject });
  }
  if (result.degrees.length) {
    const top = result.degrees.reduce((a, b) => (LEVEL_RANK[b.level] > LEVEL_RANK[a.level] ? b : a));
    result.highest = top.level;
    result.subject = top.subject ?? [...result.degrees].reverse().find((x) => x.subject)?.subject ?? null;
  }
  return result;
}

/** The highest level of a printed qualification, or null when it is empty or not recognised. */
export const highestLevel = (printed: string | null | undefined): Level | null => parseQualification(printed).highest;
export const levelRank = (l: Level | null): number => (l ? LEVEL_RANK[l] : 0);
/** Higher than graduate: postgraduate, super-specialty or doctorate. */
export const isPostgraduateOrHigher = (printed: string | null | undefined): boolean => levelRank(highestLevel(printed)) >= LEVEL_RANK.postgraduate;

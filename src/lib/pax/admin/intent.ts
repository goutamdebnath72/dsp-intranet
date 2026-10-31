// src/lib/pax/admin/intent.ts
//
// "I WANT TO CHANGE THE PAX DIRECTORY" (step 64a; owner, 31 Oct 2026). The HOD C&IT types it into the search bar in his own words; this reads which change he means. PURE.
//   add       "add new pax number", "new pax entry", "register a pax extension for stores", "please enter pax 42555 for Garage", "pax addition"
//   modify    "edit pax number", "update the pax of fire service", "change pax 42046", "correct a pax entry", "pax modification"
//   delete    "delete pax 42046", "remove a pax number", "pax deletion"
//   delegate  "delegate pax to Rakesh Ojha", "give pax access to another executive", "authorise someone for pax", "revoke pax delegation", "withdraw pax permission", "who can edit pax"
//   manage    "manage pax directory", "pax admin", "update pax directory" (no single change named): the panel opens on its first tab
// A QUESTION about the directory is never an admin intent ("pax number of fire service", "who has 42043", "show new pax numbers", "how many pax numbers"): the action word has to lead the sentence
// (within its first words), and the word "pax" (or extension / intercom) has to be there.

import { normalizePax } from "../matcher";
import type { PaxAdminOp } from "./types";

export interface PaxAdminIntent {
  op: PaxAdminOp;
  prefill?: { department?: string; number?: string; query?: string };
}

const CUE = /\b(?:pax|extension|extn|intercom)\b/;
const POLITE = /^(?:(?:please|kindly|hello|hi|hey|sir|i|we|would|like|want|wish|need|to|can|could|may|let|me|us|how|do|does|should|shall|is|it|possible|help|how|to|a|the)\s+)+/;

const ADD = new Set(["add", "adds", "adding", "create", "creating", "register", "registering", "insert", "inserting", "append", "enlist", "record", "recording", "enter", "entering", "include", "including", "put", "addition", "creation", "registration", "enrol", "enroll"]);
const MODIFY = new Set(["edit", "editing", "modify", "modifying", "modification", "update", "updating", "change", "changing", "correct", "correcting", "correction", "revise", "revising", "alter", "amend", "rename", "fix"]);
const DELETE = new Set(["delete", "deleting", "deletion", "remove", "removing", "removal", "erase", "drop", "discard"]);
const DELEGATE = new Set(["delegate", "delegating", "delegation", "authorise", "authorize", "authorisation", "authorization", "authorised", "authorized", "grant", "granting", "permit", "permission", "privilege", "empower", "entrust"]);
const REVOKE = new Set(["revoke", "revoking", "revocation", "withdraw", "withdrawing", "withdrawal", "rescind"]);
const MANAGE = new Set(["manage", "managing", "maintain", "administer", "admin", "administration", "maintenance"]);

/** The words that make a sentence about access: "remove access", "take back the permission", "give access". */
const ACCESS = /\b(?:access|permission|permissions|privilege|privileges|rights?|authority|authorit(?:y|ies)|delegation|delegate|delegates|authori[sz]ation)\b/;

export function detectPaxAdminIntent(typed: string): PaxAdminIntent | null {
  const norm = normalizePax(typed);
  if (!norm || !CUE.test(norm)) return null;
  const words = norm.replace(POLITE, "").split(" ").filter(Boolean);
  if (words.length === 0) return null;
  // the action leads the sentence ("add pax ...", "I want to delete a pax ...") or follows the word pax as a noun ("pax addition"); a word of a NAME further in ("pax number of change room") is not an action
  const first = words[0];
  const has = (set: Set<string>) => set.has(first) || (CUE.test(first) && set.has(words[1] ?? ""));

  // "who can edit pax", "who has pax access": a question about the privilege
  const askAboutPrivilege = /^(?:who|which)\b.*\b(?:can|may|is allowed|has)\b.*\b(?:edit|add|change|modify|delete|manage|update|access|permission|rights?|privilege)\b/.test(norm) && /\b(?:pax|extension|intercom)\b/.test(norm);

  let op: PaxAdminOp | null = null;
  // access words first: "remove pax access of X" is a revoke, "give pax access to X" is a delegation, neither is a deletion
  if (has(REVOKE) || (has(DELETE) && ACCESS.test(norm)) || /\btake back\b/.test(norm) && ACCESS.test(norm) || /\bcancel\b.*\b(?:delegation|permission|access|rights?)\b/.test(norm)) op = "delegate";
  else if (has(DELEGATE) || askAboutPrivilege || (/^(?:give|allow|let|assign)$/.test(first) && ACCESS.test(norm))) op = "delegate";
  else if (has(DELETE)) op = "delete";
  else if (has(MODIFY)) op = "modify";
  else if (has(ADD)) op = "add";
  else if (/^new (?:pax|extension|extn|intercom)\b/.test(words.join(" "))) op = "add";
  else if (has(MANAGE)) op = "manage";
  if (!op) return null;

  // a QUESTION is a search, not a change ("how many pax numbers were added", "pax number of the new gate")
  if (/^(?:how many|what|which|whose|when|where|list|show|display|tell)\b/.test(norm) && !askAboutPrivilege) return null;

  const number = /\b4\d{4}\b/.exec(norm)?.[0];
  const tail = / (?:for|of|to|in|at) (.+)$/.exec(norm)?.[1] ?? "";
  const hint = tail
    .split(" ")
    .filter((w) => w && !CUE.test(w) && !/^\d+$/.test(w) && !["number", "numbers", "no", "new", "a", "an", "the", "entry", "entries", "directory", "someone", "another", "executive", "him", "her", "them", "access", "permission"].includes(w))
    .join(" ")
    .slice(0, 60);
  // "update pax directory" names no single line: the panel opens on its first tab
  if (op === "modify" && /\bdirectory\b/.test(norm) && !number && !hint) op = "manage";
  const prefill: NonNullable<PaxAdminIntent["prefill"]> = {};
  if (number) prefill.number = number;
  if (hint && op === "add") prefill.department = hint;
  if (hint && (op === "modify" || op === "delete")) prefill.query = hint;
  return Object.keys(prefill).length ? { op, prefill } : { op };
}

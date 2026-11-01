// src/lib/employees/admin/intent.ts
//
// "I WANT TO CHANGE EMPLOYEE DATA" (step 66a; owner, 1 Nov 2026). Typed into the search bar in the person's own words; this reads which change he means. PURE.
//   add       "add new employee", "add an employee", "new employee", "register a new employee", "create employee record", "employee addition"
//   modify    "edit employee record", "update employee goutam debnath", "modify employee 498880", "change dob of goutam debnath", "correct the date of joining of 498880"
//   delete    "delete employee 498880", "remove employee Anil Das", "employee deletion"
//   delegate  "delegate employee editing to Rakesh Ojha", "give employee access to X", "authorise X for employee records", "revoke employee access", "who can edit employee records"
//   manage    "manage employees", "employee admin", "employee management"
// A QUESTION is never a change ("how many employees", "show employees of C&IT", "who is Rakesh Ojha", "employees with a birthday today", "new employees this month"): an action word has to LEAD the
// sentence (or the sentence is "new employee" in the singular), and the sentence has to be about employees (the word employee, or a date of birth / joining). Words of a NAME further in never act.

import { normalizePax } from "@/lib/pax/matcher";
import type { EmployeeAdminOp } from "./types";

export interface EmployeeAdminIntent {
  op: EmployeeAdminOp;
  prefill?: { name?: string; ticket?: string; query?: string };
}

const CUE = /\b(?:employee|employees|personnel|dob|doj|d o b|d o j|date of birth|birth date|birthdate|date of joining|joining date)\b/;
const POLITE = /^(?:(?:please|kindly|hello|hi|hey|sir|i|we|would|like|want|wish|need|to|can|could|may|let|me|us|how|do|does|should|shall|is|it|possible|help|a|the)\s+)+/;

const ADD = new Set(["add", "adds", "adding", "create", "creating", "register", "registering", "insert", "inserting", "enlist", "enroll", "enrol", "enter", "entering", "include", "onboard", "induct", "addition", "creation", "registration"]);
const MODIFY = new Set(["edit", "editing", "modify", "modifying", "modification", "update", "updating", "change", "changing", "correct", "correcting", "correction", "revise", "revising", "alter", "amend", "rename", "fix", "transfer", "promote", "redesignate"]);
const DELETE = new Set(["delete", "deleting", "deletion", "remove", "removing", "removal", "erase", "drop", "discard"]);
const DELEGATE = new Set(["delegate", "delegating", "delegation", "authorise", "authorize", "authorisation", "authorization", "authorised", "authorized", "grant", "granting", "permit", "permission", "privilege"]);
const REVOKE = new Set(["revoke", "revoking", "revocation", "withdraw", "withdrawing", "withdrawal", "rescind"]);
const MANAGE = new Set(["manage", "managing", "management", "maintain", "administer", "admin", "administration", "maintenance"]);
const ACCESS = /\b(?:access|permission|permissions|privilege|privileges|rights?|authority|authorit(?:y|ies)|delegation|delegate|delegates|authori[sz]ation)\b/;
const FIELD_WORDS = new Set(["dob", "doj", "d", "o", "b", "j", "date", "of", "birth", "joining", "joined", "born", "record", "records", "data", "details", "detail", "info", "information", "profile", "entry", "entries", "number", "no", "ticket", "employee", "employees", "personnel", "new", "a", "an", "the", "for", "to", "in", "at", "named", "name", "someone", "another", "executive", "him", "her", "them", "access", "permission", "permissions", "privilege", "privileges", "right", "rights", "authority", "editing", "adding", "deleting", "changing", "updating", "this", "that", "my", "our", "his", "their", "from", "dsp", "roster", "directory", "list", "and", "s"]);

export function detectEmployeeAdminIntent(typed: string): EmployeeAdminIntent | null {
  const norm = normalizePax(typed);
  if (!norm || !CUE.test(norm)) return null;
  const words = norm.replace(POLITE, "").split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const first = words[0];
  // "employee addition", "employee deletion": the noun after the word employee
  const has = (set: Set<string>) => set.has(first) || (/^(?:employee|employees|personnel)$/.test(first) && set.has(words[1] ?? ""));

  const askAboutPrivilege = /^(?:who|which)\b.*\b(?:can|may|is allowed|has)\b.*\b(?:edit|add|change|modify|delete|manage|update|access|permission|rights?|privilege)\b/.test(norm) && /\b(?:employee|employees|personnel)\b/.test(norm);

  let op: EmployeeAdminOp | null = null;
  if (has(REVOKE) || (has(DELETE) && ACCESS.test(norm)) || (/\btake back\b/.test(norm) && ACCESS.test(norm)) || (/\bcancel\b.*\b(?:delegation|permission|access|rights?)\b/.test(norm))) op = "delegate";
  else if (has(DELEGATE) || askAboutPrivilege || (/^(?:give|allow|let|assign)$/.test(first) && ACCESS.test(norm))) op = "delegate";
  else if (has(DELETE)) op = "delete";
  else if (has(MODIFY)) op = "modify";
  else if (has(ADD)) op = "add";
  else if (/^new employee\b/.test(words.join(" ")) && !/^new employees\b/.test(words.join(" "))) op = "add";
  else if (has(MANAGE)) op = "manage";
  if (!op) return null;

  // a QUESTION is a search, not a change
  if (/^(?:how many|what|which|whose|when|where|list|show|display|tell|count|number of)\b/.test(norm) && !askAboutPrivilege) return null;
  // a sentence that only names the dates, with an action word that is just a verb of the sentence ("change" in "change dob"), must name a person or a ticket to be a change request of a person
  const ticket = /\b[1-9]\d{5}\b/.exec(norm)?.[0];
  const hint = words
    .slice(1)
    .filter((w) => w && !FIELD_WORDS.has(w) && !/^\d+$/.test(w) && !ADD.has(w) && !MODIFY.has(w) && !DELETE.has(w) && !DELEGATE.has(w) && !REVOKE.has(w) && !MANAGE.has(w))
    .join(" ")
    .slice(0, 60);
  // "edit employee record" names nobody: the panel opens on its search; "update employee directory"-style sentences open the first tab
  const prefill: NonNullable<EmployeeAdminIntent["prefill"]> = {};
  if (ticket) prefill.ticket = ticket;
  if (hint && op === "add") prefill.name = hint.toUpperCase();
  if (hint && (op === "modify" || op === "delete")) prefill.query = hint;
  return Object.keys(prefill).length ? { op, prefill } : { op };
}

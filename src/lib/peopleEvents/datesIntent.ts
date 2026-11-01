// src/lib/peopleEvents/datesIntent.ts
//
// "WHAT IS THE DATE OF BIRTH / DATE OF JOINING OF SOMEBODY?" (step 65b; owner, 1 Nov 2026: no user can search the date of birth or the date of joining of an employee by the search bar except the HOD of C&IT). PURE.
// This only READS the sentence: which facts are asked, and about whom. Whether the person may know it is decided elsewhere (datesLookup.ts), by the login.
//
// The protected facts are those two dates and what they give away: the age ("how old is ..."), the day of retirement ("when does ... retire") and the length of service ("how long has ... served").
//   dob     "dob of Rakesh Ojha", "date of birth of 498880", "Rakesh Ojha's birthday", "when was Rakesh Ojha born"
//   doj     "doj of ...", "date of joining of ...", "joining date of 498880", "when did Rakesh Ojha join"
//   age     "age of ...", "how old is ..."
//   retire  "retirement date of ...", "when does ... retire"
//   service "years of service of ...", "length of service of ...", "how long has ... served"
// WHO is a six-digit ticket number or one to four words of a name. A sentence with no person ("birthdays today", "age limit", "joining instructions") gives null: it is not about anybody here.

import { normalizePax } from "../pax/matcher";

export type DateField = "dob" | "doj" | "age" | "retirement" | "service";
export interface DatesQuery { fields: DateField[]; ticket: string | null; words: string[] }

const FIELD: Array<[DateField, RegExp]> = [
  ["dob", /\b(?:dob|d o b|date of birth|birth date|birthdate|birthday|b day|bday|born)\b/],
  ["doj", /\b(?:doj|d o j|date of joining|joining date|date of join|date joined|date of appointment|appointment date|joining day|joined|joining|when (?:did|does|was|is|will)\b[^.?]*\b(?:join|appointed))\b/],
  ["age", /\b(?:age|how old|years old)\b/],
  ["retirement", /\b(?:retire|retires|retiring|retirement|superannuation|superannuates?)\b/],
  ["service", /\b(?:years of service|length of service|service period|service length|how long has|how long have|how many years has)\b/],
];

/** Words that are part of the question, never of the name. */
const FILLER = new Set([
  "a", "an", "the", "of", "for", "to", "at", "in", "on", "is", "are", "was", "were", "be", "s", "and", "or", "by", "with", "from", "has", "have", "had", "did", "does", "do", "will", "can", "could", "would",
  "what", "whats", "which", "who", "whom", "whose", "when", "where", "how", "many", "much", "long", "old", "year", "years",
  "tell", "give", "show", "me", "my", "please", "kindly", "find", "get", "know", "need", "want", "display", "search", "details", "detail", "info", "information",
  "date", "birth", "born", "birthday", "dob", "bday", "b", "day", "doj", "d", "o", "j", "join", "joined", "joining", "appointed", "appointment", "age", "retire", "retires", "retiring", "retirement", "superannuation", "superannuates", "superannuate",
  "service", "served", "serve", "length", "period", "employee", "emp", "ticket", "tkt", "no", "number", "sail", "dsp",
  "dr", "doctor", "mr", "mrs", "ms", "shri", "sri", "smt", "prof",
]);

/**
 * Words that show the sentence is about a SUBJECT, not about a person ("who has birthday today", "age limit", "joining instructions", "the retirement age policy of the company"): such a sentence is not a
 * question about somebody's dates, and no directory look-up is even made for it. No employee is named like these.
 */
const NOT_A_NAME = new Set([
  "today", "tomorrow", "yesterday", "tonight", "month", "week", "list", "lists", "all", "every", "everyone", "everybody", "anyone", "somebody", "someone", "instructions", "instruction", "limit", "limits", "policy", "policies",
  "rule", "rules", "company", "india", "circular", "circulars", "notice", "notices", "form", "forms", "format", "report", "calendar", "holiday", "holidays", "this", "that", "these", "those", "upcoming", "next", "current",
  "employees", "staff", "executives", "officers", "people", "persons", "benefits", "benefit", "criteria", "eligibility", "recruitment", "age limit", "minimum", "maximum", "average", "total", "count", "how", "many",
]);

export const MAX_SUBJECT_WORDS = 4;

export function detectDatesQuery(typed: string): DatesQuery | null {
  const norm = normalizePax(typed);
  if (!norm) return null;
  const fields = FIELD.filter(([, re]) => re.test(norm)).map(([f]) => f);
  if (fields.length === 0) return null;
  const tickets = norm.match(/\b\d{6}\b/g) ?? [];
  if (tickets.length > 1) return null; // two tickets are not one person's question
  const words = norm.split(" ").filter((t) => t && !FILLER.has(t) && !/^\d+$/.test(t));
  if (tickets.length === 1) return { fields, ticket: tickets[0], words: [] };
  if (words.length === 0 || words.length > MAX_SUBJECT_WORDS || words.some((w) => NOT_A_NAME.has(w))) return null;
  return { fields, ticket: null, words };
}

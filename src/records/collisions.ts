// src/records/collisions.ts
//
// THE REGISTER OF CLASHES: lines where two readings are possible, and what the planner says about each. Data, not code; every row is an assertion in records.selftest.ts.
// A clash found in live use is one more row. `expect` is a domain, "ask" (two readings are close: nothing is suggested, the reader chooses) or null (only text: the bar's usual paths decide).

import type { DomainId } from "./types";

export interface Collision {
  line: string;
  expect: DomainId | "ask" | null;
  why: string;
}

export const COLLISIONS: readonly Collision[] = [
  { line: "pax number of fire service", expect: "pax", why: "the word pax names the domain" },
  { line: "pax number of hospital opd", expect: "pax", why: "pax is placed before the hospital: an explicit PAX word is a PAX question" },
  { line: "holiday list for the hospital", expect: "holidays", why: "two domains are named; the order of PRECEDENCE settles it" },
  { line: "opd timings on republic day holiday", expect: "hospital", why: "opd is placed before holidays" },
  { line: "498301", expect: "people", why: "a six-digit ticket is an exact identifier" },
  { line: "D123456", expect: "people", why: "a SAIL P.No. is an exact identifier" },
  { line: "9434791234", expect: "people", why: "ten digits are a mobile number" },
  { line: "2584", expect: "people", why: "four digits that are not a year are the end of a CUG number" },
  { line: "2025", expect: null, why: "a year is not an identifier: it is text for the circulars" },
  { line: "42046", expect: null, why: "five digits mean a PAX extension only with a PAX word" },
  { line: "who has pax 42046", expect: "pax", why: "the PAX word makes the number an extension" },
  { line: "rakesh ojha", expect: "people", why: "the shape of a name" },
  { line: "dr karmakar", expect: "ask", why: "a doctor in the OPD or an employee: two readings are close" },
  { line: "leave policy", expect: "documents", why: "a policy is a document" },
  { line: "holiday list 2026", expect: "holidays", why: "the word holiday names the domain" },
  { line: "what is mtech", expect: "degrees", why: "a degree word" },
  { line: "circular on medical reimbursement", expect: "documents", why: "the word circular names the domain" },
  { line: "how many employees in c&it", expect: "people", why: "the word employees names people" },
];

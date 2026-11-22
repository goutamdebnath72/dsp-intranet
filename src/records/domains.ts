// src/records/domains.ts
//
// THE FIXED SELECTIONS, one entry each: its words, its example lines, and the way a typed line is made its own. Adding a selection is one entry here (and its engine call in src/lib/nl2sql/omnibar.ts).
// Every `examples` line is a line that really works; src/records/records.selftest.ts runs them through the engines that can run offline.

import type { Domain, DomainId, FacetInfo, PeopleFacet } from "./types";

const has = (re: RegExp, s: string) => re.test(s.toLowerCase());

/** a line that asks for the DEGREES or QUALIFICATIONS of DOCTORS ("list the degrees of the doctors"): the hospital's list of doctors and their qualifications answers it, not the table of degrees */
export const doctorDegreesAsked = (line: string): boolean => /\b(degrees?|qualifications?)\b/i.test(line) && /\b(doctors?|dr)\b/i.test(line);

const PAX_WORD = /\b(pax|p a x|extension|extn|ext|intercom|landline|land line|telephone|phone|contact)\b/;
const OPD_WORD = /\b(opd|hospital|doctors?|dr|token|clinic|specialist|specialists|consultants?)\b/;
const HOLIDAY_WORD = /\b(holidays?|festival|festivals|restricted|closed holiday|public holiday)\b/;
const DEGREE_QUESTION = /^(what|which|is|are|full form|meaning|explain|define|expand)\b/;

export const DOMAINS: readonly Domain[] = [
  {
    id: "people",
    label: "People",
    hint: "Find an employee by name, ticket, P.No or mobile; list a department or designation; or ask in words.",
    placeholder: "Type a name, ticket, SAIL P.No. or mobile number…",
    examples: ["rakesh ojha", "498301", "who is in charge of blast furnace", "how many DGMs in mechanical"],
    cues: /\b(employees?|people|staff|officers?|executives?|who is|head of|hod|in charge|ticket|p\.?\s?no)\b/,
    named: /\b(employees?|people|staff)\b/,
    scopeLines: (q) => [q],
  },
  {
    id: "pax",
    label: "PAX",
    hint: "Telephone extensions of offices and places, and the CUG number of an executive.",
    placeholder: "Type an office or place, or an extension number…",
    examples: ["fire service", "central store", "42046", "civil"],
    cues: PAX_WORD,
    named: /\b(pax|p a x)\b/,
    // a line that says pax / phone / contact is the engine's own; a bare number is asked as "who has pax 42046"; a name of a place gets "pax number of" in front
    scopeLines: (q) => {
      const t = q.trim();
      if (has(PAX_WORD, t)) return [t];
      if (/^\d{3,5}$/.test(t)) return [`who has pax ${t}`];
      return [`pax number of ${t}`];
    },
  },
  {
    id: "hospital",
    label: "Hospital OPD",
    hint: "OPD days and timings, doctors, units, and whether a doctor sits on a day.",
    placeholder: "Type a doctor, a department or a day…",
    examples: ["is opd open today", "medicine opd lists", "dr karmakar opd tuesday"],
    cues: OPD_WORD,
    named: /\bopd\b/,
    scopeLines: (q) => (has(OPD_WORD, q) ? [q.trim()] : [`${q.trim()} opd`]),
  },
  {
    id: "holidays",
    label: "Holidays",
    hint: "The plant's holiday lists, a festival's date, and comparisons between years.",
    placeholder: "Type a festival, a year or a question about holidays…",
    examples: ["holiday list 2026", "when is diwali", "how many restricted holidays in 2026"],
    cues: HOLIDAY_WORD,
    named: /\bholidays?\b/,
    // the parser understands "diwali 2026" and "when is diwali" but not "holiday diwali 2026": the line as typed first, then "when is ...", then (a bare year) "holiday list ..."
    scopeLines: (q) => {
      const t = q.trim();
      if (has(HOLIDAY_WORD, t)) return [t];
      return /^\d{4}$/.test(t) ? [`holiday list ${t}`] : [t, `when is ${t}`];
    },
  },
  {
    id: "degrees",
    label: "Degrees",
    hint: "What a degree means and its level, the people who hold a PhD, and the degrees of the hospital's doctors.",
    placeholder: "Type a degree, for example DNB, or ask about the degrees of the doctors…",
    examples: ["is DNB a postgraduate degree", "who are the PhD holders", "list the degrees of the doctors"],
    cues: /\b(degrees?|qualifications?|postgraduate|post graduate|graduate|phd|mbbs|mtech|mba)\b/,
    named: /\b(degrees?|qualifications?)\b/,
    scopeLines: (q) => {
      const t = q.trim();
      // a degree question, a PhD line, or the degrees of the doctors is the engine's own line; a bare degree ("dnb") becomes "what is dnb"
      return has(DEGREE_QUESTION, t) || /\b(phd|holders?)\b/i.test(t) || doctorDegreesAsked(t) ? [t] : [`what is ${t}`];
    },
  },
  {
    id: "documents",
    label: "Circulars & Notices",
    hint: "Search circulars and announcements only; no employee or other record is looked at.",
    placeholder: "Type what the circular or notice is about…",
    examples: ["mediclaim policy", "leave management system", "gift card", "pf loan repayment"],
    cues: /\b(circulars?|notices?|policy|policies|announcements?|office orders?|guidelines?|rules?)\b/,
    named: /\b(circulars?|announcements?|notices?)\b/,
    scopeLines: (q) => [q],
  },
];

/** THE ONE CHOICE OF THE BAR THAT IS NOT A RECORD: Executive Deep Search (EDS), a written summary across several circulars, for signed-in executives (the route verifies the login again). Shown beside the Utility Services button, not among the records. */
export const EDS_CHOICE = {
  id: "eds" as const,
  label: "Executive Deep Search",
  hint: "A written summary built from several circulars read together, with the circulars it rests on. For signed-in executives.",
  placeholder: "Ask a question that needs several circulars read together…",
  examples: ["Compare the holiday lists notified for DSP for 2022 and 2023", "How does the January to May 2026 Hindi Teaching Scheme session differ from the one starting in January 2024"] as readonly string[],
};

/** THE OTHER CHOICE OF THE SECOND ROW THAT IS NOT A RECORD: Admin, the management pages (Employee, PAX directory, Holiday, Circular and Announcement managers, the Contact access log). Nothing here is searched: the button asks the server who is signed in
 *  and shows the management page that person may open, or says they are not authorised. The words of each page are checked in src/lib/facility/hub.selftest.tsx. */
export const ADMIN_CHOICE = {
  id: "admin" as const,
  label: "Admin",
  hint: "The management pages: the HOD of C&IT and the people he has authorised. Type the words of a page, or press its title.",
  placeholder: "Type the words of a management page, for example: employee management…",
  examples: ["management", "pax directory management", "circular management"] as readonly string[],
};

export const DOMAIN_IDS: readonly DomainId[] = DOMAINS.map((d) => d.id);
export const domainById = (id: string): Domain | undefined => DOMAINS.find((d) => d.id === id);

/** the three ways to look for a person once People is selected (the order is the order of the chips) */
export const PEOPLE_FACETS: readonly FacetInfo[] = [
  { id: "find", label: "Name or number", hint: "A name, or a ticket number, SAIL P.No. or mobile number: looked up in the directory, no AI.", placeholder: "Type a name, ticket, SAIL P.No. or mobile number…", examples: ["rakesh ojha", "ojha", "498301"] },
  { id: "roster", label: "Department & designation", hint: "Pick a department and a designation to list the people, in seniority order: no AI.", placeholder: "Optional: part of a name to narrow the list…", examples: [] },
  { id: "ask", label: "Ask in words", hint: "A question about people: counts, who is in charge, comparisons. The AI writes the query.", placeholder: "Ask about people, for example: how many DGMs in mechanical…", examples: ["who is in charge of blast furnace", "how many DGMs in mechanical"] },
];
export const facetById = (id: string): FacetInfo | undefined => PEOPLE_FACETS.find((f) => f.id === id);
export const isPeopleFacet = (v: unknown): v is PeopleFacet => typeof v === "string" && PEOPLE_FACETS.some((f) => f.id === v);

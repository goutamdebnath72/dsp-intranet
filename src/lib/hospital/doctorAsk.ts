// src/lib/hospital/doctorAsk.ts
//
// The exact marker of a doctor (step 54a). When a name matches more than one doctor, the screen ASKS which one (radio buttons: the same ask as the department question, mode "one", built in
// engine.ts) and searches the person's OWN question again with the chosen doctor named by an exact marker: the ticket of a permanent doctor, the list number of a non-permanent one. So a date or
// a day in the question survives the click, and the same question can never ask again. Only hospital doctors are offered; "search all employees" is a separate button.

/** "(ticket 490138)", "(list no. D499964)" or "(doctor <id>)": a marker added to a question to name one doctor exactly. */
export const MARKER_RE = /\(\s*(ticket|list no\.?|doctor)\s+([A-Za-z0-9-]+)\s*\)/i;

/** The marker that names one doctor exactly. */
export const markerOf = (p: { id: string; ticket: string | null; doctorListId: string | null; employment: string }): string =>
  p.ticket ? `ticket ${p.ticket}` : p.doctorListId && p.employment === "contractual" ? `list no. ${p.doctorListId}` : `doctor ${p.id}`;

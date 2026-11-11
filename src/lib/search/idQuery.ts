// src/lib/search/idQuery.ts
//
// Is what was typed an IDENTIFIER (a ticket, a P.No, a mobile number, a short number) rather than words? Such a question
// is answered from the employee directory and is never sent to circular search. ONE definition, used by the search hook
// and by the search modal (they had two copies that could drift apart).
//
// A four-digit number that is a plausible YEAR (1990 to 2100: "2025", "2024") is NOT an identifier: people type it to
// find the circulars of that year, and treating it as an ID made Enter do nothing for them.

export function isIdQuery(raw: string): boolean {
  const q = (raw || "").trim();
  if (/^\d{4}$/.test(q)) {
    const n = Number(q);
    return !(n >= 1990 && n <= 2100);
  }
  return /^\d{6}$/.test(q) || /^\d{10}$/.test(q) || /^[A-Za-z]\d{4,}$/.test(q);
}

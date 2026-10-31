// src/lib/pax/admin/validate.ts
//
// THE RULES FOR A NEW OR CHANGED PAX LINE (step 64a; owner, 31 Oct 2026). PURE.
//   PAX number: always five digits, always starting with 4.
//   Department: required. Location: may be empty (the table then shows "Office"). Plain words only: letters, digits, spaces and & - – — ( ) . , / ' + # :
// The server runs these rules again whatever the panel did; the panel runs them only to tell the person early.

export const PAX_NUMBER_RULE = "A PAX number is exactly 5 digits and starts with 4 (for example 42046).";
export const PAX_NUMBER = /^4\d{4}$/;

const ALLOWED = /^[\p{L}\p{N} &\-–—().,/'+#:]+$/u;
const MAX_TEXT = 80;

export interface EntryInput { department: string; location: string; number: string }
export type FieldErrors = Partial<Record<"department" | "location" | "number", string>>;

/** Trim, join broken spaces, one form of the digits (full-width digits and the like become plain). */
export function cleanText(s: unknown): string {
  return String(s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function cleanInput(raw: Partial<Record<keyof EntryInput, unknown>>): EntryInput {
  return { department: cleanText(raw.department), location: cleanText(raw.location), number: cleanText(raw.number) };
}

export function validateEntry(raw: Partial<Record<keyof EntryInput, unknown>>): { ok: true; value: EntryInput } | { ok: false; errors: FieldErrors } {
  const v = cleanInput(raw);
  const errors: FieldErrors = {};
  if (!v.department) errors.department = "Type the department.";
  else if (v.department.length < 2) errors.department = "The department name is too short.";
  else if (v.department.length > MAX_TEXT) errors.department = `The department name may have at most ${MAX_TEXT} characters.`;
  else if (!/\p{L}/u.test(v.department)) errors.department = "The department name needs letters.";
  else if (!ALLOWED.test(v.department)) errors.department = "Use only letters, digits and the marks & - – ( ) . , / ' in the department.";
  if (v.location) {
    if (v.location.length > MAX_TEXT) errors.location = `The location may have at most ${MAX_TEXT} characters.`;
    else if (!ALLOWED.test(v.location)) errors.location = "Use only letters, digits and the marks & - – ( ) . , / ' in the location.";
  }
  if (!v.number) errors.number = "Type the PAX number.";
  else if (!PAX_NUMBER.test(v.number)) errors.number = PAX_NUMBER_RULE;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: v };
}

/**
 * The printed name that is stored for a line made here. A bracket keeps the two parts apart for the older search code ("Stores (Main Gate)"); the table itself uses the department and the location as typed
 * (display.ts: such a line carries its own two parts).
 */
export const composeLabel = (department: string, location: string): string => (location ? `${department} (${location})` : department);

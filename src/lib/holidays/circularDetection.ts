// src/lib/holidays/circularDetection.ts
//
// Detects whether an uploaded circular is THE annual holiday-list circular
// -- the one that should seed holidaymaster/holidayyear -- as opposed to the
// separate contract-worker holiday/leave circular DSP also publishes every
// year under a similar-sounding title.
//
// Heuristic validated against every holiday-related headline actually seen
// in circulars_manifest.csv (7 real examples, 2022-2025):
//   - employee holiday-list headlines all contain "holiday" AND "list"
//     e.g. "Circular-Holiday List - 2023", "CIRCULAR-HOLIDAY LIST FOR
//     EMPLOYEES OF DSP-2024", "CIRCULAR-HOLIDAY LIST FOR THE YEAR 2026"
//   - the contract-worker circular's headlines all contain "contract" or
//     "contractor" and are excluded on that basis
//     e.g. "Circular-Holidays & Leaves for contract workers...",
//     "...Holidays and Leaves for Contractor Workers in DSP..."
// All 7 real examples classify correctly under this rule. It has NOT been
// validated against any future rewording of either headline -- if a real
// circular is ever misclassified, revisit this, the same way the search
// parser's own hijack-guard heuristics are flagged as unvalidated until a
// battery proves them (see holidays/parser.ts's header comment).
//
// The TARGET YEAR is read from the headline text itself, never from the
// circular's own publishedAt/uploadedAt -- these circulars are routinely
// published in November/December for the FOLLOWING year (e.g. the 2026
// list was published 23/12/2025), so the upload date is the wrong source.

export interface HolidayCircularDetection {
  isHolidayListCircular: boolean;
  /** The year this circular's holidays are FOR, read from the headline.
   *  Null if isHolidayListCircular is true but no year could be parsed out
   *  of the headline -- callers should treat that as "detected but not
   *  safe to act on" rather than guessing a year. */
  year: number | null;
}

const HAS_HOLIDAY_WORD = /holiday/i;
const HAS_LIST_WORD = /\blist\b/i;
const IS_CONTRACT_WORKER_CIRCULAR = /contract(or)?/i;

export function detectHolidayListCircular(
  headline: string,
): HolidayCircularDetection {
  const isMatch =
    HAS_HOLIDAY_WORD.test(headline) &&
    HAS_LIST_WORD.test(headline) &&
    !IS_CONTRACT_WORKER_CIRCULAR.test(headline);

  if (!isMatch) return { isHolidayListCircular: false, year: null };

  // If more than one 4-digit year appears in the headline (shouldn't happen
  // in practice, but not asserted anywhere), prefer the largest -- "for the
  // year X" is always a forward-looking date, never an earlier reference.
  const years = Array.from(headline.matchAll(/\b(20\d{2})\b/g)).map((m) =>
    parseInt(m[1], 10),
  );
  const year = years.length > 0 ? Math.max(...years) : null;

  return { isHolidayListCircular: true, year };
}

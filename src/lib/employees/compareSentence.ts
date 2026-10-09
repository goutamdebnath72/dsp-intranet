// Drop-in helpers for the "holidayCompare" case in src/lib/employees/analytics.ts.
// Pure functions: no DB, no date library. Pass the current year in.

/** Verb follows the year relative to today: past -> had, current -> has, future -> will have. */
export function tenseVerb(year: number, nowYear: number): string {
  return year < nowYear ? "had" : year === nowYear ? "has" : "will have";
}

/** Difference stated in words, from yearA to yearB (never a bare +/- sign). */
function diffInWords(a: number, b: number, yearB: number): string {
  const d = b - a;
  return d === 0 ? "no change" : `${Math.abs(d)} ${d > 0 ? "more" : "fewer"} in ${yearB}`;
}

/** Single-type comparison, e.g. "Festival holidays: ...". */
export function compareTypeSentence(
  label: string, yearA: number, a: number, yearB: number, b: number, nowYear: number,
): string {
  const vA = tenseVerb(yearA, nowYear);
  const vB = tenseVerb(yearB, nowYear);
  if (a === b && vA === vB) {
    return `${label} holidays: both ${yearA} and ${yearB} ${vA} ${a} (no change).`;
  }
  return `${label} holidays: ${yearA} ${vA} ${a}, ${yearB} ${vB} ${b} (${diffInWords(a, b, yearB)}).`;
}

/** All-types comparison. `parts` is the existing per-type breakdown string. */
export function compareTotalSentence(
  yearA: number, totalA: number, yearB: number, totalB: number, nowYear: number, parts: string,
): string {
  const vA = tenseVerb(yearA, nowYear);
  const vB = tenseVerb(yearB, nowYear);
  const head =
    totalA === totalB && vA === vB
      ? `Both ${yearA} and ${yearB} ${vA} ${totalA} holidays in total.`
      : `${yearA} ${vA} ${totalA} holidays in total, ${yearB} ${vB} ${totalB} (${diffInWords(totalA, totalB, yearB)}).`;
  return `${head} ${parts}.`;
}

/* Plug-in, replacing the two `answer:` lines in case "holidayCompare":
 *   const nowYear = DateTime.now().year;
 *   answer: compareTypeSentence(row.label, c.yearA, row.a, c.yearB, row.b, nowYear),
 *   answer: compareTotalSentence(c.yearA, c.totalA, c.yearB, c.totalB, nowYear, parts.join("; ")),
 * and delete the now-unused `diff` / `diffTxt` lines.
 */

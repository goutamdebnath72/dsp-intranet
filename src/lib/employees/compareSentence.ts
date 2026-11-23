// Drop-in helpers for the "holidayCompare" case in src/lib/employees/analytics.ts.
// Pure functions: I use no DB and no date library here, so you pass the current year in.

/** The verb follows the year relative to today: past -> had, current -> has, future -> will have. */
export function tenseVerb(year: number, nowYear: number): string {
  return year < nowYear ? "had" : year === nowYear ? "has" : "will have";
}

/** I state the difference in words, from yearA to yearB, never as a bare +/- sign. */
export function diffInWords(a: number, b: number, yearB: number): string {
  const d = b - a;
  return d === 0 ? "no change" : `${Math.abs(d)} ${d > 0 ? "more" : "fewer"} in ${yearB}`;
}

/** Comparison for a single type, e.g. "Festival holidays: ...". */
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

/** Comparison across all types. `parts` is the existing per-type breakdown string. */
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

/*
 * To plug this in, replace the two `answer:` lines in case "holidayCompare":
 *   const nowYear = DateTime.now().year;
 *   answer: compareTypeSentence(row.label, c.yearA, row.a, c.yearB, row.b, nowYear),
 *   answer: compareTotalSentence(c.yearA, c.totalA, c.yearB, c.totalB, nowYear, parts.join("; ")),
 * and delete the now-unused `diff` / `diffTxt` lines.
 */

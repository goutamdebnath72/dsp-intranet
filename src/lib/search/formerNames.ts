// src/lib/search/formerNames.ts
//
// FORMER NAMES of a department: when a question uses one, the CURRENT name is shown first (step 59a).
// Owner, 26 Oct 2026: "CHRD was initially the Training Department, later CHRD, and now the Centre for L & D (CL&D). Keep the previous names as aliases: people still say Training Department or CHRD.
// If anyone searches with them, print the current name before the answer, to acknowledge it."
//
// Pure (no server code): the query modal calls it with the question that was searched, so the notice stands above ANY kind of answer (people, circulars, announcements ...), even while the answer is loading.
// The department itself is found by the alias group of departmentAliases.ts (the same words, so the notice and the answer cannot disagree); this file only says what the old words are and what the new name is.
// To add another renamed department: add one entry to RENAMED.

export interface Renamed {
  /** The current name, as it is shown. */
  current: string;
  /** The names it had, oldest first: they are the history line. */
  history: string[];
  /** The OLD names a question may use (the current name does not need a notice). */
  former: { label: string; re: RegExp }[];
}

export const RENAMED: Renamed[] = [
  {
    current: "Centre for L & D (CL&D)",
    history: ["Training Department", "CHRD", "Centre for L & D (CL&D)"],
    former: [
      // the names the owner gave and confirmed (26 Oct 2026): CHRD, and its full form Centre for Human Resource Development. NOT "Centre for HRD": it is not used at the plant.
      { label: "CHRD", re: /\bc\.?\s?h\.?\s?r\.?\s?d\b/ },
      { label: "Centre for Human Resource Development", re: /\bcent(?:re|er)\s+for\s+human\s+resource\s+development\b/ },
      { label: "Training Department", re: /\btraining\s+(?:dept|deptt|department)\b/ },
    ],
  },
];

/** Another plant's CHRD (Bhilai, Bokaro, Rourkela ...) or the corporate one is NOT the Durgapur department that was renamed: no notice then, and the department-name lookups (departmentAliases.ts, sailDepartments.ts) do not take it for the CL&D rows either. */
export const OTHER_PLANT = /\b(bsp|bhilai|bsl|bokaro|rsp|rourkela|iisco|burnpur|asp|alloy\s+steel|ssp|salem|vsp|visvesvaraya|ranchi|corporate|sail\s+chrd|chrd\s+sail)\b/;

export interface FormerNameNotice {
  /** The old name the question used, as it should be quoted ("CHRD"). */
  used: string;
  current: string;
  /** The sentence shown first: “CHRD” is now called Centre for L & D (CL&D). */
  sentence: string;
  /** The names in order, for the small line under it. */
  history: string;
}

const lower = (q: string) => String(q ?? "").toLowerCase().replace(/[“”"']/g, " ").replace(/[^a-z0-9&.\s]/g, " ").replace(/\s+/g, " ");

/** The notice for a question that uses a former name, or null (the first former name in the text wins). */
export function formerNameNotice(question: string): FormerNameNotice | null {
  const q = lower(question);
  if (!q.trim() || OTHER_PLANT.test(q)) return null;
  let best: { r: Renamed; label: string; at: number } | null = null;
  for (const r of RENAMED) {
    for (const f of r.former) {
      const m = f.re.exec(q);
      if (m && (!best || m.index < best.at)) best = { r, label: f.label, at: m.index };
    }
  }
  if (!best) return null;
  return {
    used: best.label,
    current: best.r.current,
    sentence: `“${best.label}” is now called ${best.r.current}.`,
    history: best.r.history.join(" → "),
  };
}

// src/lib/search/conditionFinding.ts
//
// A CONDITION THE PROSE LEAVES OUT. The table of a briefing carries a note on a row ("[under exceptional circumstances, provided no employee is waiting]" on the 7th to 12th month),
// and the overview and the findings said "up to 12 months" without it (query 1, 11 Nov 2026): not false, but a reader of the sentences alone is told the 12 months are his to take. A
// condition the table gives to a row is said in the sentences at least once. Plain code, from the table's own words (no new figure, no model): when the words of such a note are not in
// the overview or a finding, the note becomes one finding, "<row>, <column>: <the note>". Pure.
import type { SynthesisFinding, SynthesisResult, SynthesisTable } from "./executiveSynthesis";
import { stemsOf } from "./edsQuality";

/** at most this many findings are added for conditions: more would bury the answer */
const MAX_ADDED = 2;
/** a note counts as already said when this share of its content words is in the overview or the findings */
const SAID_SHARE = 1 / 3;
/** a bracket (not a [condition]) is a condition only when it begins like one */
const CONDITIONAL = /^\s*(?:under|provided|subject to|only (?:if|in|when)|except|unless|if|when|in case)\b/i;

/** A tag ("Category B", a pay scale, "w.e.f.") is not a condition: a note is one when it begins like one or says it in four words or more. */
const isCondition = (note: string): boolean => CONDITIONAL.test(note) || note.trim().split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length >= 4;

export interface Condition { row: string; column: string; note: string }

/** The notes the table gives to its rows: a trailing [condition], or a trailing (bracket) that begins like a condition. */
export function tableConditions(t: SynthesisTable | null | undefined): Condition[] {
  const out: Condition[] = [];
  if (!t) return out;
  for (const row of t.rows) {
    for (let col = 1; col < row.length; col++) {
      const cell = (row[col] ?? "").trim();
      const note = /\[([^\]]{6,})\]\s*$/.exec(cell)?.[1] ?? (() => { const b = /\(([^()]{6,})\)\s*$/.exec(cell)?.[1]; return b && CONDITIONAL.test(b) ? b : undefined; })();
      if (note && isCondition(note) && (row[0] ?? "").trim() && t.columns[col]) out.push({ row: row[0].trim(), column: t.columns[col].trim(), note: note.trim() });
    }
  }
  return out;
}

const sentence = (c: Condition): string => {
  const note = c.note.replace(/[.\s]+$/, "");
  return `${c.row}, ${c.column}: ${note[0].toUpperCase()}${note.slice(1)}.`;
};

/** The conditions of the tables that the sentences do not say, as findings (at most two). */
export function conditionFindings(r: SynthesisResult): SynthesisFinding[] {
  const prose = stemsOf([r.overview, ...(r.keyFindings ?? []).map((f) => f.text)].join(" "));
  const out: SynthesisFinding[] = [];
  const seen = new Set<string>();
  for (const t of [r.table, r.extraTable]) {
    for (const c of tableConditions(t)) {
      const key = c.note.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) continue;
      seen.add(key);
      const st = [...stemsOf(c.note)];
      if (st.length === 0) continue;
      if (st.filter((s) => prose.has(s)).length / st.length >= SAID_SHARE) continue;
      out.push({ text: sentence(c), sources: t?.sources ? [...t.sources] : [] });
      if (out.length >= MAX_ADDED) return out;
    }
  }
  return out;
}

/** The result with those findings added when there is room (eight at most). The result is not changed in place. */
export function withConditionFindings(r: SynthesisResult, max = 8): SynthesisResult {
  const add = conditionFindings(r).slice(0, Math.max(0, max - (r.keyFindings?.length ?? 0)));
  return add.length ? { ...r, keyFindings: [...r.keyFindings, ...add] } : r;
}

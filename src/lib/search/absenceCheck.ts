// src/lib/search/absenceCheck.ts
//
// A WRONG "NOT STATED" IS A WRONG ANSWER. The model sometimes writes "Not stated in circular" in a comparison-table cell for an item that the circular DOES list
// (the 2025 holiday list names Bhatridwitiya on 23 October; the briefing said "Not stated"). The prompt asks the model not to; this is the plain-code check that does
// not depend on the model obeying: for every "not stated" cell, the item in that row is looked up in the text of the circular(s) of that column. If the circular names
// it, the cell is replaced by the circular's own words (a short quotation), never by a value the code makes up.
//
// Pure: no I/O, no model, the same input always gives the same output.
import type { SynthesisTable } from "./executiveSynthesis";

export interface AbsenceSource {
  id: number;
  headline: string;
  text: string;
}

export interface AbsenceFix {
  row: string;
  column: string;
  sourceId: number;
  quote: string;
  /** the kind of list that names the item ("restricted holiday"), when the circular's headings say */
  section?: string | null;
}

/** A "not stated" cell that was CHECKED against the circular of its column and is true: none of the item's names appears in that circular. */
export interface ConfirmedAbsence {
  row: string;
  column: string;
  sourceIds: number[];
}

/** Words that name a kind of day or a category, not the item itself: never enough to say "the circular names this item". */
const GENERIC = new Set([
  "holiday", "holidays", "festival", "festivals", "category", "closed", "public", "restricted", "additional", "puja", "pujas", "day", "days", "birth", "birthday",
  "other", "others", "total", "number", "amount", "amounts", "rate", "rates", "scheme", "schemes", "employees", "employee", "workers", "worker", "circular", "notice",
  "month", "months", "period", "periods", "years", "limit", "limits", "minimum", "maximum", "grade", "grades", "level", "levels", "rules", "basic", "category", "location", "locations",
]);

const NOT_STATED = /^\s*(?:(?:not\s+(?:stated|specified|mentioned|given|available|applicable)|n\/a|nil)(?![\p{L}])|[-—–]\s*$)/iu;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const words = (s: string): string[] => (s.normalize("NFC").toLowerCase().match(/[\p{L}]+/gu) ?? []);

/** The words of a row label that identify the item: at least 5 letters, and not a generic word. */
export function distinctiveWords(label: string): string[] {
  return [...new Set(words(label).filter((w) => w.length >= 5 && !GENERIC.has(w)))];
}

/** The sources a column of the table speaks of: those whose headline carries the column's heading ("2025"), or the year in it ("2025 Date" -> 2025). A heading that carries no year gives none. */
export function sourcesOfColumn(heading: string, sources: AbsenceSource[]): AbsenceSource[] {
  const h = heading.trim();
  if (h.length < 3) return [];
  const whole = (needle: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRe(needle)}(?:$|[^\\p{L}\\p{N}])`, "iu");
  const exact = sources.filter((s) => whole(h).test(s.headline));
  if (exact.length) return exact;
  // a heading that is not itself in a headline maps to a circular only through a YEAR ("2025 Date" -> the circular of 2025): a year names an edition, a word like "Locations" names nothing
  const years = [...new Set(h.match(/\b(?:19|20)\d{2}\b/g) ?? [])];
  if (!years.length) return [];
  return sources.filter((s) => years.every((y) => whole(y).test(s.headline)));
}

/** The first and last character of every numbered table entry of a flattened text ("SL. No.: 28 | HOLIDAYS: ... | Day: Thursday"). */
function entriesOf(flat: string): Array<{ from: number; to: number }> {
  const marks: Array<{ at: number; end: number }> = [];
  for (const m of flat.matchAll(/\bsl\.?\s*(?:no\.?)?\s*:?\s*\d+\.?\s*\|/gi)) marks.push({ at: m.index!, end: m.index! + m[0].length });
  return marks.map((m, i) => ({ from: m.end, to: i + 1 < marks.length ? marks[i + 1].at : flat.length }));
}

const clip = (piece: string, max: number): string => {
  const t = piece.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trim();
};

/** A table entry as the text of the circular stores it ("HOLIDAYS: Rath Yatra | DATE: 27th June | Day: Friday") is read as "Rath Yatra · 27th June · Friday": the values, in the circular's own words and order, without the column names. */
export function readable(entry: string): string {
  const parts = entry.split("|").map((p) => p.trim().replace(/^[A-Za-z][A-Za-z .&/]{0,24}:\s*/, "").trim()).filter(Boolean);
  return parts.length > 1 ? parts.join(" · ") : entry.trim();
}

/**
 * The kind of list a table entry stands in, from the nearest HEADING before it ("RESTRICTED HOLIDAYS (RH)", "FESTIVAL HOLIDAYS", "CLOSED/ PUBLIC HOLIDAYS"): said in the cell, so a reader
 * does not take a restricted holiday for a festival holiday. Only a heading written in capitals counts (prose such as "treated as an additional Festival Holiday" is not a heading), and
 * only when the entry numbers run on from the heading without starting over or jumping: a restart or a jump means another list began (or text is missing) and then the kind is NOT said.
 */
function sectionBefore(flat: string, at: number): string | null {
  const before = flat.slice(0, at);
  let kind: string | null = null;
  let from = -1;
  for (const m of before.matchAll(/\b(RESTRICTED\s+HOLIDAYS|LIST\s+OF\s+(?:RESTRICTED\s+HOLIDAYS|RH)|FESTIVAL\s+HOLIDAYS|CLOSED\s*\/\s*PUBLIC\s+HOLIDAYS)\b/g)) {
    kind = /RESTRICTED|RH/.test(m[1]) ? "restricted holiday" : /FESTIVAL/.test(m[1]) ? "festival holiday" : "closed/public holiday";
    from = m.index!;
  }
  if (!kind) return null;
  let last = 0;
  for (const m of before.slice(from).matchAll(/\bsl\.?\s*(?:no\.?)?\s*:?\s*(\d+)\.?\s*\|/gi)) {
    const n = Number(m[1]);
    if (n < last || n > last + 3) return null; // a restart, or a jump (text between is missing): the list of this entry is not certain
    last = n;
  }
  return kind;
}

/** The circular's own words where the item is named: the table ENTRY that names it (one row), else the sentence around it; a place that carries a figure is preferred. */
function quoteFor(text: string, word: string): { text: string; section: string | null } | null {
  const flat = text.replace(/\s+/g, " ");
  const re = new RegExp(`(?<![\\p{L}])${escapeRe(word)}`, "giu");
  const entries = entriesOf(flat);
  let tableQuote: { text: string; section: string | null } | null = null;
  let proseQuote: string | null = null;
  let proseWithFigure: string | null = null;
  for (const m of flat.matchAll(re)) {
    const at = m.index!;
    // a word counts as part of a table ENTRY only when it stands in the entry's name fields (the first two "|"-separated fields): the last entry of a list runs on into the prose
    // that follows it, and a word in that prose is not that row's item
    const entry = entries.find((e) => {
      if (at < e.from || at >= e.to) return false;
      const first = flat.indexOf("|", e.from), second = first < 0 ? -1 : flat.indexOf("|", first + 1);
      return at < (second < 0 ? Math.min(e.to, (first < 0 ? e.from : first) + 60) : Math.min(second, e.to)); // an entry with fewer fields: the name field and a little after it
    });
    if (entry) {
      const q = readable(clip(flat.slice(entry.from, entry.to), 170));
      const hit = { text: q, section: sectionBefore(flat, at) };
      if (/\d/.test(q)) return hit;
      tableQuote ??= hit;
      continue;
    }
    const start = Math.max(0, at - 40);
    const end = Math.min(flat.length, at + word.length + 110);
    let piece = flat.slice(start, end);
    if (start > 0) piece = piece.slice(piece.indexOf(" ") + 1);
    if (end < flat.length) piece = piece.slice(0, piece.lastIndexOf(" "));
    piece = piece.trim();
    if (!piece) continue;
    if (/\d/.test(piece.slice(Math.max(0, piece.toLowerCase().indexOf(word))))) proseWithFigure ??= piece;
    proseQuote ??= piece;
  }
  const prose = proseWithFigure ?? proseQuote;
  return tableQuote ?? (prose ? { text: prose, section: null } : null);
}

/**
 * Replaces every "not stated" cell whose item the column's circular names by that circular's own words. A cell is left alone when the column maps to no circular,
 * when the row has no distinctive word, or when the circular does not contain it (a true "not stated").
 */
export function checkAbsences(table: SynthesisTable, sources: AbsenceSource[]): { table: SynthesisTable; fixes: AbsenceFix[]; confirmed: ConfirmedAbsence[] } {
  const fixes: AbsenceFix[] = [];
  const confirmed: ConfirmedAbsence[] = [];
  const colSources = table.columns.map((c, i) => (i === 0 ? [] : sourcesOfColumn(c, sources)));
  const rows = table.rows.map((row) => {
    const label = row[0] ?? "";
    // a label with a figure names a period or a step, not an item of the circular. A label that lists names ("Diwali / Kali Puja", "Saraswati Puja / Basant Panchami") is one item
    // under several names: the circular may use any of them, so each name is looked up on its own, in the label's order.
    const aliases = /\d/.test(label) ? [] : label.split(/\s*\/\s*|\s+or\s+/i).map(distinctiveWords).filter((k) => k.length);
    if (!aliases.length) return row;
    return row.map((cell, ci) => {
      if (ci === 0 || !NOT_STATED.test(cell ?? "") || !colSources[ci].length) return cell;
      // the item is named when its longest distinctive word is in the circular and at least half of its distinctive words are
      for (const src of colSources[ci]) {
        const present = new Set(words(src.text));
        for (const keys of aliases) {
          const hit = keys.filter((k) => present.has(k));
          const longest = [...keys].sort((a, b) => b.length - a.length)[0];
          if (!present.has(longest) || hit.length * 2 < keys.length) continue;
          const q = quoteFor(src.text, longest);
          if (!q) continue;
          fixes.push({ row: label, column: table.columns[ci], sourceId: src.id, quote: q.text, section: q.section });
          return `Listed in the circular${q.section ? ` as a ${q.section}` : ""}: "${q.text}"`;
        }
      }
      confirmed.push({ row: label, column: table.columns[ci], sourceIds: colSources[ci].map((x) => x.id) });
      return cell;
    });
  });
  return { table: fixes.length ? { ...table, rows } : table, fixes, confirmed };
}

/* ------------------------------------------------------------------ *
 * The TEXT of the reply must not contradict the corrected table. A finding or the overview that says an item the circular names is "not stated" /
 * "absent" / "only in ..." for a period the table now shows as listed is a wrong sentence. It is REMOVED (never rewritten: the code makes no claim of its own;
 * a missing sentence is better than a wrong one, and the table below carries the circular's own words).
 * ------------------------------------------------------------------ */

const NEGATION = /\b(?:not\s+(?:stated|specified|mentioned|given|listed|included|named|provided|available|found|notified|declared|present)|no\s+(?:mention|entry|listing|such)|(?:does|do|did)\s+not\s+(?:list|include|mention|name|contain|appear|state|specify|have|feature)|is\s+absent|absent|omitted|missing|unlisted|only\s+(?:in|appears|listed)|appears\s+only|exclusive(?:ly)?\s+to)\b/i;

/** The sentences of a text: split after a full stop followed by a capital letter, and at semicolons. Joined back with a space, nothing is lost. */
const sentencesOf = (text: string): string[] => text.split(/(?<=[.!?])\s+(?=[A-Z"“(])|(?<=;)\s+/).map((s) => s.trim()).filter(Boolean);

function mentions(sentence: string, fix: AbsenceFix): boolean {
  const lower = sentence.normalize("NFC").toLowerCase();
  const keys = distinctiveWords(fix.row);
  if (!keys.length) return false;
  const longest = [...keys].sort((a, b) => b.length - a.length)[0];
  if (!lower.includes(longest)) return false;
  // the sentence must speak of the period/edition of the corrected cell: its year (or the heading itself when it has none)
  const years = fix.column.match(/\b(?:19|20)\d{2}\b/g);
  return years ? years.every((y) => lower.includes(y)) : lower.includes(fix.column.trim().toLowerCase());
}

/** Removes the sentences that say an item is absent for a column that the corrected table now shows as listed. `removed` has what was taken out. */
export function dropContradictedClaims(text: string, fixes: AbsenceFix[]): { text: string; removed: string[] } {
  if (!fixes.length || !text) return { text, removed: [] };
  const removed: string[] = [];
  const kept = sentencesOf(text).filter((s) => {
    const bad = NEGATION.test(s) && fixes.some((f) => mentions(s, f));
    if (bad) removed.push(s);
    return !bad;
  });
  return removed.length ? { text: kept.join(" "), removed } : { text, removed };
}


/* ------------------------------------------------------------------ *
 * WHAT DIFFERS, from the table itself. A question that compares years or editions asks what differs; the model often answers in one vague sentence ("dates shift each year").
 * The cells the checks above settled give a plain, exact answer without any claim made by the code: which items the circular of a year carries only under another kind of
 * list (a restricted holiday), and which it does not name at all. Built from the circular's own headings and the checked table; never from the model's words.
 * ------------------------------------------------------------------ */

/** The column headings without the words they all share ("2024 Date", "2025 Date" -> "2024", "2025"). */
function shortHeadings(columns: string[]): string[] {
  const values = columns.slice(1);
  if (values.length < 2) return columns;
  const parts = values.map((c) => c.trim().split(/\s+/));
  let cut = 0;
  while (parts.every((p) => p.length - cut > 1 && p[p.length - 1 - cut] === parts[0][parts[0].length - 1 - cut])) cut++;
  return [columns[0], ...parts.map((p) => p.slice(0, p.length - cut).join(" "))];
}

export function describeDifferences(table: SynthesisTable, fixes: AbsenceFix[], confirmed: ConfirmedAbsence[]): { text: string; sources: number[] } | null {
  if (table.columns.length < 3 || (!fixes.length && !confirmed.length)) return null;
  const heads = shortHeadings(table.columns);
  const headOf = (col: string) => heads[table.columns.indexOf(col)] ?? col;
  const group = <T extends { row: string; column: string }>(items: T[]) => {
    const by = new Map<string, string[]>();
    for (const it of items) by.set(it.row, [...(by.get(it.row) ?? []), headOf(it.column)]);
    return [...by].map(([row, cols]) => `${row} (${cols.join(", ")})`);
  };
  const parts: string[] = [];
  const unit = heads.slice(1).every((h) => /^(?:19|20)\d{2}\b/.test(h)) ? "years" : "columns"; // "years" when the columns are years, else plainly "columns"
  const kinds = [...new Set(fixes.map((f) => f.section).filter((k): k is string => !!k))];
  for (const k of kinds) {
    const list = group(fixes.filter((f) => f.section === k));
    parts.push(`Found in the circular's list of ${k}s, not as a dated entry of the table: ${list.join("; ")}.`);
  }
  if (confirmed.length) parts.push(`Not named at all in that column's circular: ${group(confirmed).join("; ")}.`);
  if (!parts.length) return null;
  const sources = [...new Set([...fixes.map((f) => f.sourceId), ...confirmed.flatMap((c) => c.sourceIds)])];
  return { text: `Differences between the ${unit}, from the table. ${parts.join(" ")}`, sources };
}

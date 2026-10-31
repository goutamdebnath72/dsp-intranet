// src/lib/pax/matcher.ts
//
// THE PAX DIRECTORY SEARCH: reading the question and matching it against the rows (step 63a). PURE: no database, no model, no clock, so every rule here is tested offline.
// PAX = the land-line phone that works only inside DSP work areas (5 digits). The numbers are kept by the Telecom department in the table `public.pax_directory` (sql/12).
//
// What a person can ask (all answered from the table, never from a model):
//   - a NAME to a number:   "pax number of fire service", "fire service pax", "pax c&it", "pax of civil a zone", a misspelling ("pax fire servise")
//   - a NUMBER to a name:   "who has 42046", "42046" (only if it really is in the directory), "pax 42046", "pax 420" (all numbers that start so)
//   - a LIST or a COUNT:    "pax", "pax directory", "list all pax numbers", "how many pax numbers", "pax numbers outside plant", "township pax numbers"
//   - a FAULT:              "pax not working", "pax complaint" (the Telecom complaint numbers)
//   - an AREA:              "in plant" / "township" / "outside plant" narrows any of the above
//
// WHEN THE ROUTE TAKES A QUESTION (a wrong confident answer is worse than no answer, so it is careful):
//   STRONG cue = the word "pax": always ours (a found answer, or an honest "not found").
//   WEAK cue   = extension, extn, intercom, landline, telephone, phone: ours ONLY when every word of the question matches a directory name EXACTLY (no spelling guess),
//                the question is short, and it is not about a person, a doctor, the hospital OPD or a circular ("phone number of Rajesh Kumar" is not ours).
//   NO cue     = ONE bare 5-digit number (with only words like "who has") is ours ONLY when that number is in the directory; otherwise the question goes on untouched.
//   A number of six or more digits (a ticket, a mobile) or a word about circulars (notice, policy, tariff ...) is never ours.

export type PaxArea = "plant" | "outside" | "unclassified";

export interface PaxRow {
  /** The name exactly as printed in Telecom's list ("Civil (A - Zone)"). */
  label: string;
  /** The department part and the location part of the label (the location is empty when the list does not say). Used for matching only. */
  deptName: string;
  location: string;
  number: string;
  note: string;
  area: PaxArea;
}

export type PaxPlan =
  | { kind: "number"; claim: "always" | "ifFound"; numbers: string[]; area: PaxArea | null; count: boolean }
  | { kind: "name"; claim: "always" | "ifFound"; tokens: string[]; area: PaxArea | null; count: boolean; fault: boolean; exactOnly: boolean }
  | { kind: "list"; claim: "always"; area: PaxArea | null; count: boolean };

// ---- text ----------------------------------------------------------------------------------------

/** Lower case, accents removed, "&" read as "and", every other mark a space: "C & IT (Console)" -> "c and it console". */
export function normalizePax(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Filler words of a question: never part of a name. ("a" is here too: it is also the zone in "Civil (A - Zone)", so it can never be required.) */
const QUERY_STOP = new Set([
  "a", "an", "the", "of", "for", "to", "at", "in", "on", "is", "are", "was", "were", "be", "s", "and", "or", "with", "from", "by", "under",
  "what", "whats", "which", "who", "whom", "whose", "where", "how", "many", "much", "when", "does", "do", "did", "has", "have", "having", "had", "can", "could", "will", "would", "should",
  "i", "me", "my", "you", "your", "us", "our", "we", "this", "that", "there", "here", "any", "some", "all", "every", "each", "also",
  "tell", "give", "show", "list", "find", "get", "need", "want", "please", "kindly", "know", "provide", "display", "search", "enlist", "name", "names",
  "number", "numbers", "no", "nos", "num", "nbr", "contact", "contacts", "dial", "call", "directory", "dsp", "sail", "dept", "depts", "department", "departments", "total", "count", "full", "complete", "entire",
  "belongs", "belong", "belonging", "owner", "using", "uses", "use", "assigned", "registered", "listed", "number's",
  "kiska", "kiski", "kiske", "kaun", "kya", "hai", "hain", "ka", "ki", "ke", "batao", "bataiye", "dijiye", "do",
  "pax", "p", "x", "extension", "extn", "ext", "intercom", "landline", "land", "line", "telephone", "phone", "tel",
]);

/** Filler of the ROWS: only the joining words. */
const ROW_STOP = new Set(["and", "of", "the", "in", "at", "for", "s"]);

export const rowTokens = (r: Pick<PaxRow, "label" | "deptName" | "location">): Set<string> => {
  const out = new Set<string>();
  const parts = [r.label, r.deptName, r.location].map(normalizePax).filter(Boolean);
  for (const p of parts) {
    const toks = p.split(" ").filter((t) => t && !ROW_STOP.has(t));
    toks.forEach((t) => out.add(t));
    // "C & IT" is also typed "cit", "L & D" as "ld": the joined neighbours of a one- or two-letter piece are tokens too
    for (let i = 0; i + 1 < toks.length; i++) if (toks[i].length <= 2 || toks[i + 1].length <= 2) out.add(toks[i] + toks[i + 1]);
  }
  return out;
};

// ---- fuzzy ---------------------------------------------------------------------------------------

/** Edit distance with swapped neighbours counted as one edit (optimal string alignment); stops early above `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** How many spelling slips a word of this length may have: none for short words, and a 4-letter word must keep its first letter (gate is never date). */
const allowedEdits = (len: number): number => (len <= 3 ? 0 : len <= 7 ? 1 : 2);

export type TokenHit = { kind: "exact" | "prefix" | "fuzzy"; hit: string };

/** Does one word of the question match one of the row's words? exact; prefix ("hosp" for "hospital", "services" for "service"); or a spelling slip. */
export function matchToken(q: string, tokens: Set<string>): TokenHit | null {
  if (tokens.has(q)) return { kind: "exact", hit: q };
  if (q.length >= 4) {
    for (const t of tokens) {
      if (t.startsWith(q)) return { kind: "prefix", hit: t };
      if (t.length >= 4 && q.startsWith(t) && q.length - t.length <= 2) return { kind: "prefix", hit: t };
    }
  }
  const max = allowedEdits(q.length);
  if (max > 0) {
    let best: { t: string; d: number } | null = null;
    for (const t of tokens) {
      if (t.length < 3 || /^\d+$/.test(t) || /^\d+$/.test(q)) continue;
      if (q.length === 4 && t[0] !== q[0]) continue;
      const d = editDistance(q, t, max);
      if (d <= max && (!best || d < best.d)) best = { t, d };
    }
    if (best) return { kind: "fuzzy", hit: best.t };
  }
  return null;
}

// ---- reading the question ------------------------------------------------------------------------

const STRONG_CUE = /\b(?:pax|p a x)\b/;
const WEAK_CUE = /\b(?:extension|extn|ext|intercom|landline|land line|telephone|phone|tel)\b/;
/** A question about a document, not the directory ("pax billing notice", "tariff for ..."). */
const DOCUMENT_WORDS = /\b(?:circular|circulars|notice|notices|policy|policies|memo|rule|rules|tariff|bill|bills|billing|rate|rates|charges|allowance|amendment|guideline|guidelines|office order)\b/;
/** A question about a person, a doctor or the hospital OPD: the other routes own it unless the word "pax" itself is there. */
const PEOPLE_WORDS = /\b(?:mobile|cell|email|e mail|mail|ticket|pno|doctor|doctors|opd|hospital|employee|employees|staff|officer|officers|executive|executives)\b/;
const OUT_AREA = /\b(?:township|outside (?:the )?plant|out side plant|out of (?:the )?plant|outside area|outer plant)\b/;
const IN_AREA = /\b(?:(?:in|inside|within) (?:the )?plant|plant area|in plant|plant side)\b/;
/** A fault: the question is about the complaint desk ("PAX Complain" in the list). */
const FAULT = /\b(?:complain|complaint|complaints|complained|fault|faults|faulty|not working|out of order|no tone|no dial tone|dead|repair|repairs|problem|problems|defective|trouble|disturbance|breakdown|not ringing|not responding)\b/;
const LIST_WORDS = /\b(?:list|all|every|complete|entire|full|directory|everything|whole)\b/;
const COUNT_WORDS = /\b(?:how many|count|total)\b/;

const digitRuns = (s: string): string[] => s.match(/\d+/g) ?? [];

/** The text with its digit groups closed up when they make a 5-digit number ("42 046", "42-046" read as 42046); only used when "pax" itself is in the question. */
function closeUpNumbers(norm: string): string {
  return norm.replace(/\b(\d{2,3}) (\d{2,3})\b/g, (m, a, b) => (a.length + b.length === 5 ? a + b : m));
}

export function planPaxQuery(typed: string): PaxPlan | null {
  const raw = String(typed ?? "");
  let norm = normalizePax(raw);
  if (!norm) return null;
  const strong = STRONG_CUE.test(norm);
  if (strong) norm = closeUpNumbers(norm);
  const weak = !strong && WEAK_CUE.test(norm);
  const wordCount = norm.split(" ").length;

  // a ticket, a mobile number or any long number is somebody else's question
  const runs = digitRuns(norm);
  if (runs.some((r) => r.length >= 6)) return null;
  if (DOCUMENT_WORDS.test(norm)) return null;
  if (!strong && wordCount > 8) return null;

  // the area narrows the question
  let area: PaxArea | null = null;
  let rest = norm;
  const out = OUT_AREA.test(rest);
  if (out) rest = rest.replace(OUT_AREA, " ");
  const inn = IN_AREA.test(rest);
  if (inn) rest = rest.replace(IN_AREA, " ");
  if (out && !inn) area = "outside";
  else if (inn && !out) area = "plant";

  const faultAsked = FAULT.test(rest);
  const count = COUNT_WORDS.test(norm);
  const numbers = runs.filter((r) => r.length >= 3 && r.length <= 5);

  // a fault question: its fault words are not part of a name ("pax not working in civil" = civil), they only say "the complaint desk"
  const forName = faultAsked ? rest.replace(new RegExp(FAULT.source, "g"), " ") : rest;
  const content = forName.split(" ").filter((t) => t && !QUERY_STOP.has(t) && !/^\d+$/.test(t));
  // the bare word "plant" with nothing else asks for the area, not for a name ("pax plant")
  let tokens = content;
  // a single letter beside "zone" is the zone ("civil a zone" = Civil (A - Zone)): it is kept, whereas a lone "a" is only filler ("give me a pax number")
  for (const m of rest.matchAll(/\b([a-z]) zone\b|\bzone ([a-z])\b/g)) {
    const letter = m[1] ?? m[2];
    if (!tokens.includes(letter)) tokens = [...tokens, letter];
  }
  if (tokens.length === 1 && tokens[0] === "plant" && area === null) { area = "plant"; tokens = []; }

  if (strong) {
    if (numbers.length > 0) return { kind: "number", claim: "always", numbers: Array.from(new Set(numbers)), area, count: false };
    if (faultAsked) return { kind: "name", claim: "always", tokens, area, count, fault: true, exactOnly: false };
    if (tokens.length === 0) return { kind: "list", claim: "always", area, count };
    return { kind: "name", claim: "always", tokens, area, count, fault: false, exactOnly: false };
  }

  if (weak) {
    if (PEOPLE_WORDS.test(norm)) return null;
    if (numbers.some((n) => n.length === 5) && tokens.length === 0) {
      return { kind: "number", claim: "always", numbers: numbers.filter((n) => n.length === 5), area, count: false };
    }
    if (numbers.length > 0) return null;
    if (faultAsked) return null; // "my phone is not working" is not a PAX question without the word pax
    if (tokens.length === 0) return null; // "extension" alone: not a PAX question without the word "pax"
    return { kind: "name", claim: "ifFound", tokens, area, count: false, fault: false, exactOnly: true };
  }

  // no cue: one bare 5-digit number and nothing but filler words ("who has 42046", "42046")
  if (numbers.length === 1 && numbers[0].length === 5 && tokens.length === 0 && !PEOPLE_WORDS.test(norm) && wordCount <= 6) {
    return { kind: "number", claim: "ifFound", numbers, area: null, count: false };
  }
  return null;
}

// ---- matching ------------------------------------------------------------------------------------

export interface PaxMatch {
  rows: PaxRow[];
  /** Words of the question read through a spelling slip: [asked, read as]. Said to the person, never silent. */
  corrections: Array<[string, string]>;
  /** When nothing matched: the names that share some of the words (never presented as the answer). */
  closest: string[];
}

const byLabel = (a: PaxRow, b: PaxRow) => a.label.localeCompare(b.label, "en", { numeric: true, sensitivity: "base" }) || a.number.localeCompare(b.number);
const AREA_ORDER: Record<PaxArea, number> = { plant: 0, outside: 1, unclassified: 2 };
export const sortPaxRows = (rows: PaxRow[], areaFirst = false): PaxRow[] =>
  [...rows].sort((a, b) => (areaFirst ? AREA_ORDER[a.area] - AREA_ORDER[b.area] : 0) || byLabel(a, b));

/** Every row is counted once: the same name and number twice is one row. */
export function uniqueRows(rows: PaxRow[]): PaxRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.label.toLowerCase()}|${r.number}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function matchByNumber(rows: PaxRow[], numbers: string[]): PaxRow[] {
  const out: PaxRow[] = [];
  for (const n of numbers) for (const r of rows) if (n.length === 5 ? r.number === n : r.number.startsWith(n)) out.push(r);
  return uniqueRows(out);
}

export function matchByName(rows: PaxRow[], tokens: string[], exactOnly: boolean): PaxMatch {
  type Scored = { row: PaxRow; kinds: TokenHit[] | null; matched: number };
  const scored: Scored[] = rows.map((row) => {
    const set = rowTokens(row);
    const hits: TokenHit[] = [];
    let matched = 0;
    for (const t of tokens) {
      const h = matchToken(t, set);
      if (h) { hits.push(h); matched++; }
    }
    return { row, kinds: matched === tokens.length ? hits : null, matched };
  });
  const full = scored.filter((s) => s.kinds);
  const clean = full.filter((s) => s.kinds!.every((k) => k.kind !== "fuzzy"));
  const chosen = clean.length > 0 ? clean : exactOnly ? [] : full;
  const corrections: Array<[string, string]> = [];
  if (chosen.length > 0 && chosen === full && clean.length === 0) {
    tokens.forEach((t, i) => {
      const k = chosen[0].kinds![i];
      if (k.kind === "fuzzy" && !corrections.some((c) => c[0] === t)) corrections.push([t, k.hit]);
    });
  }
  const rowsOut = uniqueRows(sortPaxRows(chosen.map((s) => s.row)));
  let closest: string[] = [];
  if (rowsOut.length === 0) {
    // names that share at least one word (or nearly): shown as "closest", never as the answer
    const near = scored
      .map((s) => {
        const set = rowTokens(s.row);
        const loose = tokens.filter((t) => matchToken(t, set)).length; // the same strictness as a real match: "water" is not near "gate"
        return { label: s.row.label, loose };
      })
      .filter((s) => s.loose > 0)
      .sort((a, b) => b.loose - a.loose || a.label.localeCompare(b.label));
    closest = Array.from(new Set(near.map((n) => n.label))).slice(0, 4);
  }
  return { rows: rowsOut, corrections, closest };
}

export const filterByArea = (rows: PaxRow[], area: PaxArea | null): PaxRow[] => (area ? rows.filter((r) => r.area === area) : rows);

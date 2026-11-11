// src/lib/ingestion/indicRepair.ts
//
// HINDI AND BENGALI LETTER SLIPS: found by plain code, repaired only from the OTHER independent reading, never invented.
//
// What the circular PRINTS is a record: a spelling slip in the printed circular ("ठेकेदारो", "त्यौहारिय") is kept exactly as printed (a corrector, human or model, is wrong
// often enough: on the stored archive a strong model flagged 15 words and 4 of them were correct words). What is NOT a record is a slip of the READER: a letter of the wrong
// script (a Korean letter where "क्र" is printed), or a letter sequence that cannot occur in the language (a virama followed by a vowel sign). That kind is detectable
// without a dictionary, and the second reader (which read the same page independently) usually has the right word. So:
//   1. a token of the primary reading with such a defect is looked up in the checker's reading;
//   2. it is replaced only by a clean token of the checker that fits (the stray letters stand for 1-4 letters of it) and that is the ONLY fit on the page, or stands next to the same neighbour word;
//   3. a defect with no such token is left as read and REPORTED, never guessed.
// Pure: no I/O, no model.

// Greek is left out on purpose: mu, omega and alpha are real symbols in a technical circular; the other scripts never are
const STRAY =/[\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Hebrew}\p{Script=Thai}]+/gu;
const INDIC_LETTER = /[ऄ-हक़-ॡঅ-হড়-ৡ]/u;

// per script: virama, dependent vowel signs, other combining marks that cannot follow a virama
const SCRIPTS = [
  { name: "Devanagari", virama: "्", signs: "ा-ौॕ-ॗॢॣ", marks: "ऀ-ः़" },
  { name: "Bengali", virama: "্", signs: "া-ৌৗৢৣ", marks: "ঁ-ঃ়" },
];
const DEFECTS = SCRIPTS.map((s) => ({
  name: s.name,
  viramaThenSign: new RegExp(`[${s.virama}][${s.signs}${s.marks}${s.virama}]`, "u"),
  twoSigns: new RegExp(`[${s.signs}][${s.signs}]`, "u"),
  signAtStart: new RegExp(`^[^\\p{L}\\p{N}]*[${s.signs}${s.virama}]`, "u"),
}));

export interface IndicDefect { kind: "stray-script" | "malformed-sequence"; detail: string }

/** What is wrong with one token (a word with its punctuation), or null. Only tokens that hold a Devanagari or Bengali letter or a stray letter are looked at. */
export function indicDefect(token: string): IndicDefect | null {
  const stray = token.match(STRAY);
  if (stray && (INDIC_LETTER.test(token) || /[.।|]/.test(token) || true)) {
    // a stray-script letter is a slip whenever it sits in a circular of these languages (the archive has Latin, Devanagari and Bengali only)
    return { kind: "stray-script", detail: stray.join("") };
  }
  if (!INDIC_LETTER.test(token)) return null;
  const t = token.normalize("NFC");
  for (const d of DEFECTS) {
    if (d.viramaThenSign.test(t)) return { kind: "malformed-sequence", detail: `${d.name}: a virama is followed by a vowel sign, a mark or another virama` };
    if (d.twoSigns.test(t)) return { kind: "malformed-sequence", detail: `${d.name}: two vowel signs in a row` };
    if (d.signAtStart.test(t)) return { kind: "malformed-sequence", detail: `${d.name}: a word starts with a vowel sign or a virama` };
  }
  return null;
}

/** Canonical form of the Hindi and Bengali words of a text (Unicode NFC, which writes ड़ ढ़ য় ড় ঢ় the one standard way), so a word typed in one form is found in the other. The letters are the same letters. */
export function canonicalIndic(text: string): string {
  return text.replace(/\S*[ऀ-৿]\S*/gu, (w) => w.normalize("NFC"));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tokensOf = (s: string): string[] => s.split(/\s+/).filter(Boolean);

export interface IndicRepair { from: string; to: string; why: string }
export interface IndicUnresolved { token: string; why: string }

/** The pattern a defective token stands for: each run of stray letters may be 1 to 4 letters of the right word. */
function patternOf(token: string): RegExp | null {
  const parts = token.split(STRAY);
  if (parts.length < 2) return null;
  return new RegExp(`^${parts.map(escapeRe).join("\\S{1,4}")}$`, "u");
}

/** Levenshtein distance on code points, capped (returns cap + 1 when larger). */
function distance(a: string, b: string, cap: number): number {
  const x = [...a], y = [...b];
  if (Math.abs(x.length - y.length) > cap) return cap + 1;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

/**
 * Repairs the defective tokens of `primary` from `checker` (the other reading of the same page). Returns the repaired text, what was repaired, and what could not be.
 * `checker` may be empty or null: then nothing is repaired and every defect is reported.
 */
export function repairIndic(primary: string, checker: string | null | undefined): { text: string; repairs: IndicRepair[]; unresolved: IndicUnresolved[] } {
  const repairs: IndicRepair[] = [];
  const unresolved: IndicUnresolved[] = [];
  const other = tokensOf(checker ?? "");
  const clean = other.filter((t) => !indicDefect(t));
  const text = primary.split("\n").map((line) => {
    const toks = line.split(/(\s+)/); // keeps the spacing
    const words = toks.map((t, i) => ({ t, i })).filter((x) => x.t.trim());
    for (let k = 0; k < words.length; k++) {
      const { t, i } = words[k];
      const defect = indicDefect(t);
      if (!defect) continue;
      const pattern = patternOf(t);
      const fits = pattern ? clean.filter((c) => pattern.test(c)) : clean.filter((c) => INDIC_LETTER.test(c) && distance(c.normalize("NFC"), t.normalize("NFC"), 2) <= 2);
      const uniq = [...new Set(fits)];
      const prev = words[k - 1]?.t, next = words[k + 1]?.t;
      const nextToSame = (c: string) => other.some((o, j) => o === c && ((prev !== undefined && other[j - 1] === prev) || (next !== undefined && other[j + 1] === next)));
      let pick: string | null = null;
      if (uniq.length === 1) pick = uniq[0];
      else if (uniq.length > 1) { const near = uniq.filter(nextToSame); if (near.length === 1) pick = near[0]; }
      if (pick && pick !== t) { toks[i] = pick; repairs.push({ from: t, to: pick, why: defect.kind === "stray-script" ? `a letter of another script (${defect.detail}) was read; the second reading has the word` : `${defect.detail}; the second reading has the word` }); }
      else unresolved.push({ token: t, why: defect.kind === "stray-script" ? `a letter of another script (${defect.detail}) and no matching word in the second reading` : `${defect.detail}; no matching word in the second reading` });
    }
    return toks.join("");
  }).join("\n");
  return { text, repairs, unresolved };
}

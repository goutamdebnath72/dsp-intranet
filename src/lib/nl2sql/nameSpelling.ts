// src/lib/nl2sql/nameSpelling.ts
//
// The SPELLING SAFETY NET for name searches (step 55b).
//
// WHY: the name search compares a typed word with a name word through a phonetic CODE (indic_fold): two spellings match only when their codes are EQUAL. That cannot reach 100%: the code
// can be taught Roy = Ray and Majumdar = Mazumder, but every new way to write a Bengali name ("Gosyami", "Gosami", "Goshami" for Goswami) is a new rule, and one word off in one name
// word dropped the person ("rupak gosyami" found nobody although "Rupak" was perfect). Rules alone will never close it.
// WHAT: when a name search finds NOBODY, each name word of the SQL is looked at. A word that no real name is spelled (or coded) like is replaced by the NEAREST real name word of the
// directory, and the same SQL is run again, so every other condition of the question stays. The answer says so ("No name is spelled “Gosyami”: showing the nearest spelling, Goswami.").
// HOW NEAR: the words are compared by a key that treats W and Y after a consonant and before a vowel as silent (Goswami = Goshami = Gosyami = Gosami, Swapan, Biswas, Dwijen, Sandhya:
// the Bengali ব-ফলা and য-ফলা), then folded like the database does. Words that SOUND the same under that key are accepted; a weaker match must be one slip in the letters (two in a long
// word; a swapped pair of letters counts as one) AND keep the first sound. A word of fewer than 4 letters is never corrected. Only a word that is not already known (the same word, or the same code, as a real name) is touched, so a correct word is never "improved", and a
// question whose people simply do not exist stays empty (nothing is invented). No database change: the vocabulary is read from nlq.employees.name_words and kept for ten minutes.

import { foldToken } from "../employees/namePredicate";
import { guardSql } from "./guard";
import { runReadOnly, type ExecOptions } from "./executor";
import type { QueryResultData, SqlClient } from "./types";

const letters = (w: string): string => String(w ?? "").toUpperCase().replace(/[^A-Z]/g, "");
/** W or Y after a consonant and before a vowel is silent in a Bengali name (Goswami = Goshami = Gosyami). */
export const withoutGlides = (w: string): string => letters(w).replace(/([BCDFGHJKLMNPQRSTVXZ])[WY](?=[AEIOU])/g, "$1");
/** The key two spellings of one name share. */
export const spellingKey = (w: string): string => foldToken(withoutGlides(w), false);
/** The code the database itself gives a word (what nlq.word_like compares), for either position. */
const databaseCodes = (w: string): string[] => [foldToken(letters(w), false), foldToken(letters(w), true)];

/** Edit distance with a swap of two neighbouring letters counted as ONE slip (rupak / rupka). */
export function editDistance(a: string, b: string): number {
  const n = a.length, m = b.length;
  if (!n) return m;
  if (!m) return n;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => [i, ...new Array<number>(m).fill(0)]);
  for (let j = 1; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[n][m];
}

export interface NameVocabulary {
  /** every distinct name word (letters only, upper case, at least 3 letters) */
  words: string[];
  count: Map<string, number>;
  key: Map<string, string>;
  /** the database codes of the words: a typed word with one of these codes is already found by the phonetic match */
  codes: Set<string>;
}

export function buildVocabulary(rows: { w: string; n: number }[]): NameVocabulary {
  const count = new Map<string, number>();
  for (const r of rows) {
    const w = letters(r.w);
    if (w.length >= 3) count.set(w, (count.get(w) ?? 0) + Number(r.n || 1));
  }
  const words = [...count.keys()];
  const key = new Map(words.map((w) => [w, spellingKey(w)]));
  const codes = new Set(words.flatMap(databaseCodes));
  return { words, count, key, codes };
}

/** A word the name search already finds: the same word as a real name, or one with the same code. */
export function isKnownWord(token: string, vocab: NameVocabulary): boolean {
  const t = letters(token);
  return vocab.count.has(t) || databaseCodes(t).some((c) => vocab.codes.has(c));
}

export interface Nearest { word: string; keyDistance: number; plainDistance: number; count: number }

/** The real name words nearest to a typed word: the best tier only, at most `max`; nothing for a known word, a very short word or a word far from every name. */
export function nearestWords(token: string, vocab: NameVocabulary, max = 3): Nearest[] {
  const t = letters(token);
  if (t.length < 4 || isKnownWord(t, vocab)) return [];
  const tk = spellingKey(t);
  const maxKey = tk.length >= 8 ? 2 : tk.length >= 4 ? 1 : 0;
  const maxPlain = Math.max(2, Math.ceil(t.length / 3));
  const found: Nearest[] = [];
  for (const w of vocab.words) {
    if (Math.abs(w.length - t.length) > 3) continue;
    const wk = vocab.key.get(w) as string;
    const keyDistance = editDistance(tk, wk);
    if (keyDistance > maxKey) continue;
    const plainDistance = editDistance(t, w);
    if (plainDistance > maxPlain) continue;
    // Sounding the same (key distance 0) is strong evidence. Anything weaker must be ONE slip in the letters (two in a long word) and keep the first sound: a different first letter is a
    // different name ("swapan" is not "tapan"). A name that is simply not in the directory must stay "not found", never become somebody else.
    if (keyDistance > 0 && (tk[0] !== wk[0] || plainDistance > (t.length >= 9 ? 2 : 1))) continue;
    found.push({ word: w, keyDistance, plainDistance, count: vocab.count.get(w) ?? 1 });
  }
  found.sort((a, b) => a.keyDistance - b.keyDistance || a.plainDistance - b.plainDistance || b.count - a.count || a.word.localeCompare(b.word));
  if (!found.length) return [];
  const best = found[0];
  return found.filter((x) => x.keyDistance === best.keyDistance && x.plainDistance === best.plainDistance).slice(0, max);
}

// ---- the name words inside a model's SQL --------------------------------------------------------
export interface NameLiteral { start: number; end: number; text: string; literal: string; build: (word: string) => string }

/** nlq.word_like(name_words, name_codes, 'x') and its first_/last_ forms, and the exact form 'X' = ANY(name_words). */
export function nameLiteralsIn(sql: string): NameLiteral[] {
  const out: NameLiteral[] = [];
  const call = /nlq\.(first_word_like|last_word_like|word_like)\(\s*([A-Za-z_][\w.]*)\s*,\s*([A-Za-z_][\w.]*)\s*,\s*'((?:[^']|'')*)'\s*\)/gi;
  for (const m of sql.matchAll(call)) {
    out.push({ start: m.index as number, end: (m.index as number) + m[0].length, text: m[0], literal: m[4], build: (w) => `nlq.${m[1]}(${m[2]}, ${m[3]}, '${w}')` });
  }
  const any = /'((?:[^']|'')*)'\s*=\s*ANY\(\s*((?:[A-Za-z_]\w*\.)?name_words)\s*\)/gi;
  for (const m of sql.matchAll(any)) {
    out.push({ start: m.index as number, end: (m.index as number) + m[0].length, text: m[0], literal: m[1], build: (w) => `'${w}' = ANY(${m[2]})` });
  }
  return out.sort((a, b) => a.start - b.start);
}

export interface SpellingChange { typed: string; corrected: string[] }

/** The SQL with every unknown name word replaced by its nearest real spelling(s); null when nothing was changed. */
export function correctSql(sql: string, vocab: NameVocabulary): { sql: string; changes: SpellingChange[] } | null {
  const changes: SpellingChange[] = [];
  let result = sql;
  for (const lit of nameLiteralsIn(sql).reverse()) {
    if (!/^[A-Za-z]+$/.test(lit.literal)) continue; // one plain word only
    const near = nearestWords(lit.literal, vocab);
    if (!near.length) continue;
    const replacement = near.length === 1 ? lit.build(near[0].word) : `(${near.map((n) => lit.build(n.word)).join(" OR ")})`;
    result = result.slice(0, lit.start) + replacement + result.slice(lit.end);
    changes.unshift({ typed: lit.literal, corrected: near.map((n) => n.word) });
  }
  return changes.length ? { sql: result, changes } : null;
}

const nice = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
const joinWords = (ws: string[]): string => (ws.length <= 1 ? (ws[0] ?? "") : `${ws.slice(0, -1).join(", ")} or ${ws[ws.length - 1]}`);

/** The sentence under the answer. */
export function spellingNote(changes: SpellingChange[]): string {
  const parts = changes.map((c) => `“${nice(c.typed)}” (nearest: ${joinWords(c.corrected.map(nice))})`);
  return `No name is spelled ${parts.join(" or ")}: showing the nearest real spelling${changes.some((c) => c.corrected.length > 1) ? "s" : ""} instead.`;
}

// ---- the vocabulary of the directory and the second search ---------------------------------------
type WithClient = <T>(fn: (c: SqlClient) => Promise<T>) => Promise<T>;
const TEN_MINUTES = 10 * 60 * 1000;
let cache: { at: number; vocab: NameVocabulary } | null = null;
export const clearVocabularyCache = (): void => { cache = null; };

async function loadVocabulary(withClient: WithClient): Promise<NameVocabulary> {
  if (cache && Date.now() - cache.at < TEN_MINUTES) return cache.vocab;
  const rows = await withClient(async (c) => (await c.query(`SELECT w, count(*)::int AS n FROM (SELECT unnest(name_words) AS w FROM nlq.employees) x GROUP BY w`)).rows as { w: string; n: number }[]);
  const vocab = buildVocabulary(rows);
  cache = { at: Date.now(), vocab };
  return vocab;
}

/** The second search: the same SQL with the nearest real spellings. Null when nothing could be corrected or the corrected SQL finds nobody either. */
export async function spellingRetry(sql: string, deps: { withClient: WithClient; exec?: ExecOptions }): Promise<{ sql: string; data: QueryResultData; note: string } | null> {
  if (!nameLiteralsIn(sql).length) return null;
  const fixed = correctSql(sql, await loadVocabulary(deps.withClient));
  if (!fixed) return null;
  const g = guardSql(fixed.sql);
  if (!g.ok) return null;
  const data = await deps.withClient((c) => runReadOnly(c, g.sql, deps.exec));
  return data.total > 0 ? { sql: g.sql, data, note: spellingNote(fixed.changes) } : null;
}

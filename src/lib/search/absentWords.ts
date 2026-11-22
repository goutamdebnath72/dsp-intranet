// src/lib/search/absentWords.ts
//
// WORDS OF A QUESTION THAT NO DOCUMENT HAS. The circular search treats a word found in no circular as noise (a typo, a synonym: tokenWeights.ts gives it weight 0), which is right for the ranking, but it
// means that "LTC rules" quietly becomes "rules" and returns whatever has the word "rules", with a percentage. Under the "Circulars & Notices" choice the reader asked for documents only, so the bar says what is
// true: that no circular, notice or announcement has the word. When most of the question's words are absent, nothing is shown (nothing in the archive is about it); when only one of several is absent, the results
// stand with a one-line note. Used only under that choice: "Everything" keeps the old behaviour.

import type { DataSource } from "typeorm";

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; present: boolean }>();

/** the words (of those given) that appear in NO circular (its text or its headline), announcement (its title, its text, its PDF's text); [] when the lookup fails: then nothing is claimed */
export async function absentWords(ds: DataSource, words: string[]): Promise<string[]> {
  const uniq = Array.from(new Set(words.map((w) => w.toLowerCase()).filter((w) => w.length >= 3)));
  if (uniq.length === 0) return [];
  try {
    const now = Date.now();
    const need = uniq.filter((w) => { const c = cache.get(w); return !c || now - c.at > TTL_MS; });
    if (need.length) {
      const safe = need.map((w) => w.replace(/[\\%_]/g, ""));
      const rows: Array<{ tok: string; present: boolean }> = await ds.query(
        `SELECT t.tok AS tok,
                (EXISTS (SELECT 1 FROM public.circular_chunks cc WHERE cc.text ILIKE '%' || t.tok || '%')
              OR EXISTS (SELECT 1 FROM public.circulars c WHERE c.headline ILIKE '%' || t.tok || '%')
              OR EXISTS (SELECT 1 FROM public.announcement a WHERE a.title ILIKE '%' || t.tok || '%' OR a."contentText" ILIKE '%' || t.tok || '%')
              OR EXISTS (SELECT 1 FROM public.announcement_chunk k WHERE k.text ILIKE '%' || t.tok || '%')) AS present
           FROM unnest($1::text[]) AS t(tok)`,
        [safe],
      );
      need.forEach((w, i) => cache.set(w, { at: now, present: !!rows.find((r) => r.tok === safe[i])?.present }));
    }
    return uniq.filter((w) => cache.get(w)?.present === false);
  } catch {
    return [];
  }
}

export interface AbsentVerdict {
  /** most of the question is in no document: show nothing but the sentence */
  nothing: boolean;
  /** some word is in no document but the rest is: show the results with the sentence above */
  partial: boolean;
  sentence: string;
}

const quoteAll = (ws: string[]) => ws.map((w) => `“${w.toUpperCase() === w ? w : w}”`).join(", ");

/** pure: what to say, from the question's content words and those that no document has */
export function judgeAbsent(contentWords: string[], absent: string[]): AbsentVerdict {
  const total = new Set(contentWords.map((w) => w.toLowerCase())).size;
  const gone = Array.from(new Set(absent.map((w) => w.toLowerCase())));
  if (total === 0 || gone.length === 0) return { nothing: false, partial: false, sentence: "" };
  const list = quoteAll(gone.map((w) => (w.length <= 4 ? w.toUpperCase() : w)));
  if (gone.length * 2 >= total) {
    return { nothing: true, partial: false, sentence: `No circular, notice or announcement mentions ${list}. Check the spelling, try other words, or choose Everything to search all of the intranet.` };
  }
  return { nothing: false, partial: true, sentence: `No circular, notice or announcement mentions ${list}; the results below match the rest of your words.` };
}

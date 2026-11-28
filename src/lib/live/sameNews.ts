// src/lib/live/sameNews.ts
//
// THE SAME NEWS BY MEANING. Rules about names and figures (steel.ts clusterTopics, priority.ts assignDesk) join the headlines that name the same companies or carry the same figures, but they cannot know that two headlines that
// share no name and no figure say the same thing in two languages. For that I use the embedding model the intranet already uses for its circular search (Gemini gemini-embedding-001, GEMINI_API_KEY): it turns a headline into a vector in
// a space where the same meaning is near, whatever the language, so two headlines are the same news when their vectors are close (cosine similarity).
// WHAT GOES TO GOOGLE: only the headlines of public news feeds, nothing that anybody typed. WHAT IT COSTS: a headline is about 30 tokens; a batch of 100 is one call; a headline already embedded is kept in memory (and never asked
// again while this server process lives), so after the first minute only the headlines that are new are sent: a few calls an hour. WHEN IT FAILS (no key, no answer, over quota) it returns nothing and the rules alone decide; it never throws.
// This is a second opinion ADDED to the rules, never a replacement: the rules are free, instant and explain themselves; the vectors only catch what the rules cannot.

import { wordsOf } from "./rss";

const MODEL = "gemini-embedding-001";
const DIMENSIONS = 256; // the model's vectors are 3072 long; 256 of them are plenty to tell one headline's meaning from another's, and keep the memory small
const BATCH = 100;
const MAX_CACHED = 3000;
const cache = new Map<string, Float32Array>();

/** A vector scaled to length one, so that the dot product of two is their cosine. */
function unit(v: number[]): Float32Array {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return Float32Array.from(v, (x) => x / n);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Embeds the headlines (the ones not yet kept) in batches and returns a map of every headline that has a vector. A batch that fails is left out; nothing is thrown. `fetchImpl` is for the tests.
 */
export async function embedHeadlines(titles: string[], opts: { apiKey?: string | null; timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<Map<string, Float32Array>> {
  const key = opts.apiKey === undefined ? process.env.GEMINI_API_KEY : opts.apiKey;
  const wanted = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
  const todo = wanted.filter((t) => !cache.has(t));
  if (key && todo.length) {
    const f = opts.fetchImpl ?? fetch;
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000);
      try {
        const r = await f(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ requests: batch.map((text) => ({ model: `models/${MODEL}`, content: { parts: [{ text }] }, taskType: "SEMANTIC_SIMILARITY", outputDimensionality: DIMENSIONS })) }),
          signal: ctl.signal,
        });
        if (!r.ok) continue;
        const data = (await r.json()) as { embeddings?: Array<{ values?: number[] }> };
        batch.forEach((t, k) => { const v = data.embeddings?.[k]?.values; if (Array.isArray(v) && v.length) cache.set(t, unit(v)); });
      } catch {
        // a batch that did not come is simply not used
      } finally {
        clearTimeout(timer);
      }
    }
    while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
  }
  const out = new Map<string, Float32Array>();
  for (const t of wanted) { const v = cache.get(t); if (v) out.set(t, v); }
  return out;
}

/** The similarity at or above which two headlines are put to the judge. Headlines of one trade are all near each other (the steel headlines of a day are 0.88 to 0.95 apart, the real duplicates among the top of them), so a number alone cannot say "same news": it only picks the pairs worth asking about. */
export const SHORTLIST = 0.88;
/** The most pairs put to the judge in one asking (the nearest first). */
export const MAX_PAIRS = 40;

/** One pair, as a key that is the same whichever headline comes first. */
export const pairKey = (a: string, b: string): string => (a.trim() < b.trim() ? `${a.trim()}\u0001${b.trim()}` : `${b.trim()}\u0001${a.trim()}`);

const verdicts = new Map<string, boolean>();
const MAX_VERDICTS = 6000;

/** What the judge is told. It decides the SAME NEWS: the same thing happened or was announced, told by two papers or in two languages; the same company or topic is not enough, and different figures are different news. */
export function judgePrompt(pairs: Array<[string, string]>): string {
  return [
    "You compare news headlines in English, Hindi and Bengali. For each numbered pair, decide whether BOTH headlines report the SAME NEWS: the same event, announcement or figure, told by two papers, in different words or in different languages.",
    "Say NO when they only concern the same company, person or subject but report different events, different developments or different figures (for example two different share-price stories about one company, or two different statistics).",
    "Say YES for a paper's own wording or translation of the other headline, or a close follow-up that clearly reports the same development.",
    'Answer with JSON only: {"same":[the numbers of the pairs that are the SAME NEWS]}. If none, {"same":[]}.',
    "",
    ...pairs.map(([a, b], i) => `${i + 1}.\nA: ${a}\nB: ${b}`),
  ].join("\n");
}

/** Reads the judge's JSON: the numbers of the pairs it called the same (anything unreadable is "none"). */
export function parseJudge(text: string, count: number): number[] {
  try {
    const m = /\{[\s\S]*\}/.exec(text);
    const arr = (JSON.parse(m ? m[0] : text) as { same?: unknown }).same;
    return Array.isArray(arr) ? [...new Set(arr.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= count))] : [];
  } catch {
    return [];
  }
}

export type Judge = (pairs: Array<[string, string]>) => Promise<number[] | null>;

/** The models of the judge: the lite one first (1.2 s for eight pairs, where the ordinary flash model took 3 s and, with twenty pairs, more than 12 s: it thinks at length), then the chat chain; never a Pro one (src/lib/ai/noPro.ts). */
export const JUDGE_MODELS = (): string[] => [process.env.GEMINI_JUDGE_MODEL || "gemini-3.5-flash-lite"];
/** The pairs of one asking of the judge: more are split into several askings that go together. */
export const PAIRS_PER_ASKING = 15;

/** The judge: the intranet's own light Gemini model, JSON out, temperature 0. Returns null when it cannot answer. */
export const geminiJudge: Judge = async (pairs) => {
  if (!process.env.GEMINI_API_KEY || !pairs.length) return null;
  try {
    const { geminiGenerate, chatModels } = await import("@/lib/ai/geminiChat");
    const reply = await geminiGenerate(judgePrompt(pairs), { models: [...JUDGE_MODELS(), ...chatModels()], json: true, temperature: 0, thinking: "minimal", maxOutputTokens: 1800, attemptTimeoutMs: 9000, totalTimeoutMs: 14000, label: "same-news" });
    return parseJudge(reply.text, pairs.length);
  } catch {
    return null;
  }
};

/**
 * THE PAIRS OF HEADLINES THAT ARE THE SAME NEWS BY MEANING, as a set of pairKeys. Step 1: the vectors of the headlines (embedHeadlines) pick the nearest pairs (SHORTLIST, at most MAX_PAIRS). Step 2: the judge decides which of
 * them are the same news; its answer is kept for each pair, so a pair is asked once. If the vectors or the judge are not there, the set is empty and the rules alone decide.
 */
export async function meaningLinks(titles: string[], opts: { embed?: typeof embedHeadlines; judge?: Judge } = {}): Promise<Set<string>> {
  const out = new Set<string>();
  const uniq = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
  const vectors = await (opts.embed ?? embedHeadlines)(uniq);
  const near: Array<[number, string, string]> = [];
  for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) { const a = vectors.get(uniq[i]), b = vectors.get(uniq[j]); if (a && b) { const c = cosine(a, b); if (c >= SHORTLIST) near.push([c, uniq[i], uniq[j]]); } }
  // the pairs whose headlines share three words or more go first (a repeat of the same story in one language nearly always does), then the nearest: a long list of headlines of one trade (every steel headline of a day is 0.88 to 0.95 from the others) must not push a real repeat past the cap
  const shares = (a: string, b: string) => { const inB = wordsOf(b).set; return wordsOf(a).list.filter((w) => inB.has(w)).length >= 3 ? 1 : 0; };
  near.sort((x, y) => shares(y[1], y[2]) - shares(x[1], x[2]) || y[0] - x[0]);
  const pairs = near.slice(0, MAX_PAIRS).map(([, a, b]) => [a, b] as [string, string]);
  const unknown = pairs.filter(([a, b]) => !verdicts.has(pairKey(a, b)));
  if (unknown.length) {
    const judge = opts.judge ?? geminiJudge;
    const chunks: Array<Array<[string, string]>> = [];
    for (let i = 0; i < unknown.length; i += PAIRS_PER_ASKING) chunks.push(unknown.slice(i, i + PAIRS_PER_ASKING));
    // the askings go together; one that fails leaves its pairs unasked (asked again next time), never "different"
    await Promise.all(chunks.map(async (chunk) => {
      const said = await judge(chunk);
      if (!said) return;
      const yes = new Set(said);
      chunk.forEach(([a, b], k) => verdicts.set(pairKey(a, b), yes.has(k + 1)));
    }));
    while (verdicts.size > MAX_VERDICTS) verdicts.delete(verdicts.keys().next().value as string);
  }
  for (const [a, b] of pairs) if (verdicts.get(pairKey(a, b))) out.add(pairKey(a, b));
  return out;
}

/** Has the judge said these two headlines are the same news? Instant (it only looks at what the judge has already said); false when the pair was never asked. This is what the builders of the lists take. */
export const meaningOf = (a: string, b: string): boolean => verdicts.get(pairKey(a, b)) === true;

/** For the tests: forget what is kept. */
export function forgetHeadlines(): void { cache.clear(); verdicts.clear(); }

/**
 * ONE ROW FOR ONE NEWS, BEFORE THE ANSWER GOES: of two stories of a list that the judge has called the same news (meaningOf), the first stays and names the other paper. The route asks the judge about the list's own headlines first (meaningLinks, within a time limit),
 * so that the repeat is never shown, not even the first time; a pair the judge has not answered stays as it is.
 */
export function dropSameMeaning<T extends { title: string; source: string; also?: string[] }>(items: T[], same: (a: string, b: string) => boolean = meaningOf): T[] {
  const kept: T[] = [];
  for (const it of items) {
    const at = kept.findIndex((k) => same(k.title, it.title));
    if (at < 0) { kept.push(it); continue; }
    const k = kept[at];
    if (it.source !== k.source && !(k.also ?? []).includes(it.source)) kept[at] = { ...k, also: [...(k.also ?? []), it.source] };
  }
  return kept;
}

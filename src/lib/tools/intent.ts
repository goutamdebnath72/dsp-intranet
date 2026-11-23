// src/lib/tools/intent.ts
//
// Which utility a line means, whatever the words. detect.ts answers exact asks ("gold rate today"): every word must be one the topic knows. This file answers the rest, for the reader who writes a whole sentence, in
// capitals, with a typo, with "please" and "sir", or in Hinglish: I score the line against what each topic SAYS it is (its `intent`: name, one sentence, words and near-words, plus its own key words) and
// name the utility the line is clearly about, or none. It runs in the browser, instantly, and sends nothing anywhere. This file names no topic: it walks the topics of src/tools/registry.ts.
//
// The score. Each informative word of the line (not a filler like "please", "tell", "the", not a bare number, not a place such as "Kolkata", which says where and not what) is matched against the words of a topic:
// exactly, as the same stem ("prices"/"price"), with one slip of spelling ("pettrol"), or by a long common beginning ("calculation"/"calculate"). A match counts the RARITY of the word (a word that only one topic
// uses is worth more than "price", which four use); an informative word the topic does not know counts against it. I call a topic CLEAR when its score is high, nearly every informative word is explained by it,
// and no other topic comes close: "PLEASE TELL ME THE CURRENT GOLD PRICE IN KOLKATA SIR" is clear (gold); "circular on gold loan" is not (a document search with one word of a topic), and I leave it to the search,
// or to the AI that is asked what the user means (src/lib/tools/intentAi.ts).
import { TOPICS } from "@/tools/registry";
import type { TopicLogic } from "@/tools/types";
import { isIdQuery } from "@/lib/search/idQuery";
import { looksLikeNameSearch } from "@/lib/search/nameSearchGate";

const LIST: readonly TopicLogic[] = TOPICS;

/** Words that carry no meaning of their own: politeness, questions, the verbs of asking (English and the Hindi people mix in). */
const STOP = new Set((
  "a an and or of in on at to for from with by about as is are was were be been am do does did the this that these those it its i me my mine we us our you your he she they them his her " +
  "what which who whom whose when where why how much many more most any some all there here please pls kindly tell give show showme let know see check open want wanted need needed wish would like can could will shall " +
  "may might should must get got find look search provide share send help sir madam mam maam dear hello hi hey ok okay thanks thank regards now today todays current currently latest live new just only also still " +
  "going go come tomorrow yesterday tonight morning evening about info information detail details regarding related regard kya hai hain ka ki ke ko se me mein mai batao bataiye dikhao dikhaiye chahiye aaj abhi " +
  "tell-me whats what's it's if then so but because than after before doing happening performing read reading watch kaisa kaise kaisi kab kitna kitni kitne kahan kaun"
).split(/\s+/).filter(Boolean));
/** Generic words that say little about WHICH utility (the size of an answer, how it is asked): I make not knowing one cost a little, not as much as a full unknown word. */
const SOFT = new Set("final amount total estimated estimate probable expected approximate approx value long time times timing timings schedule list details month monthly year yearly per rate kg litre litres gram grams".split(" "));
/** Places and names of the plant: they say WHERE, not WHAT ("gold price in Kolkata"), so I let them neither help nor hurt a match. */
const CONTEXT = new Set("india indian kolkata calcutta delhi mumbai chennai bengal west durgapur dsp plant company sail".split(" "));

export interface IntentEntry {
  id: string;
  title: string;
  about: string;
  /** Every word the topic uses of itself, lower case. */
  vocab: string[];
  /** How it is opened: its own page (a form), or the card that this typed line makes. */
  open: { form: true } | { query: string };
}

const norm = (s: string): string[] => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);

export const INTENTS: readonly IntentEntry[] = LIST.flatMap((t): IntentEntry[] => {
  if (!t.intent) return [];
  const vocab = new Set<string>();
  for (const w of [...norm(t.intent.title), ...t.intent.words.flatMap(norm), ...(t.live?.keys ?? []).flatMap(norm), ...(t.live?.phrases ?? []).flatMap(norm)]) if (!/^\d+$/.test(w) && w.length >= 2) vocab.add(w);
  const sample = (t.samples ?? []).find((s) => s.instant) ?? (t.samples ?? [])[0];
  return [{ id: t.id, title: t.intent.title, about: t.intent.about, vocab: [...vocab], open: t.form ? { form: true } : { query: sample?.q ?? t.intent.title } }];
});

const N = Math.max(1, INTENTS.length);
const df = new Map<string, number>();
for (const e of INTENTS) for (const w of e.vocab) df.set(w, (df.get(w) ?? 0) + 1);
/** How much a matched word is worth: a word of one topic, 3.3; of four, 1.9; of ten, 1.2. */
const weight = (w: string): number => Math.log(1 + N / (df.get(w) ?? 1));

/** I take a plural or an ending off, so that "prices" and "price", "charging" and "charge" meet. */
export function stem(w: string): string {
  let s = w;
  for (const end of ["ings", "ing", "ers", "er", "ies", "es", "ed", "s"]) if (s.length - end.length >= 3 && s.endsWith(end)) { s = s.slice(0, -end.length); break; }
  return s.endsWith("e") && s.length > 3 ? s.slice(0, -1) : s;
}

/** The edit distance, with an early stop since the words are short. */
export function distance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      low = Math.min(low, cur[j]);
    }
    if (low > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** How well a word of the line matches a word of a topic: 1 exact; .92 the same stem; .8 one slip of spelling (.7 two, in a long word); .65 a long common beginning; else 0. */
export function similarity(q: string, v: string): number {
  if (q === v) return 1;
  if (stem(q) === stem(v)) return 0.92;
  if (q.length >= 5 && v.length >= 5) {
    const d = distance(q, v, q.length >= 8 && v.length >= 8 ? 2 : 1);
    if (d === 1) return 0.8;
    if (d === 2 && q.length >= 8 && v.length >= 8) return 0.7;
  }
  let p = 0;
  while (p < q.length && p < v.length && q[p] === v[p]) p++;
  return p >= 6 && p >= Math.min(q.length, v.length) - 3 ? 0.65 : 0;
}

/** Returns the words of a line that say WHAT is wanted (not fillers, not bare numbers, not places). */
export function informative(line: string): string[] {
  return norm(line).filter((w) => w.length >= 2 && !STOP.has(w) && !CONTEXT.has(w) && !/^\d+$/.test(w));
}

export interface Ranked {
  id: string;
  /** The rarity-weighted size of what matched. */
  strength: number;
  /** strength / (strength + a charge for each informative word of the line that the topic does not know): 1 when the topic explains every word. */
  confidence: number;
  /** The informative words the topic did not know. */
  unknown: string[];
}

/** Scores every topic against the line, best first. */
export function rankIntents(line: string): Ranked[] {
  const words = informative(line);
  if (words.length === 0) return [];
  const out: Ranked[] = INTENTS.map((e) => {
    let strength = 0, charge = 0;
    const unknown: string[] = [];
    for (const q of words) {
      let best = 0;
      for (const v of e.vocab) {
        const m = similarity(q, v);
        if (m > 0) best = Math.max(best, m * weight(v));
      }
      if (best > 0) strength += best; else { unknown.push(q); charge += SOFT.has(q) ? 0.5 : 2; }
    }
    return { id: e.id, strength, confidence: strength / (strength + charge || 1), unknown };
  });
  return out.filter((r) => r.strength > 0).sort((a, b) => b.confidence - a.confidence || b.strength - a.strength);
}

/** The utility a line is CLEARLY about, by my rule: a strong match (not a lone common word), nearly every informative word explained, and no other topic close; else null. */
export function clearIntent(line: string): Ranked | null {
  const r = rankIntents(line);
  const [a, b] = r;
  // A line of one word (or one word and fillers) stays with the exact readers and the search: "loan" or "leave" may be a document search as well as a utility.
  if (informative(line).length < 2 && norm(line).length < 3) return null;
  if (!a || a.strength < 2 || a.confidence < 0.75) return null;
  if (b && a.confidence - b.confidence < 0.15 && b.strength >= a.strength * 0.6) return null;
  return a;
}

/** A few words of a sentence: these are the lines worth asking the AI about when the topics do not settle them. */
export const looksLikeSentence = (line: string): boolean => norm(line).length >= 3;

/** The line as it may leave for the AI: long digit runs (a ticket, a phone, a PAN-like number) and e-mail addresses are blanked; null when the line is not for the AI at all (an ID query, too short, too long). */
export function maskForAi(line: string): string | null {
  const q = (line || "").trim();
  if (q.length < 6 || q.length > 300 || isIdQuery(q)) return null;
  // A line of nothing but numbers and ID-like tokens ("D123456 2584": a person by number) is a lookup, and I never make it a question for the AI.
  if (q.split(/\s+/).every((t) => /^[A-Za-z]?\d+$/.test(t))) return null;
  return q.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]").replace(/\d[\d\s-]{4,}\d/g, "[number]").replace(/\s+/g, " ");
}

/** Whether the AI is worth asking about this line: a few words, nothing that could only be a person's name or an ID (those go to the directory), and a line that may leave at all. */
export const worthAsking = (line: string): boolean => looksLikeSentence(line) && maskForAi(line) !== null && !looksLikeNameSearch(line);

/** The list of utilities as the AI is shown it: one line each, "id | title: about". */
export const catalogForAi = (): string => INTENTS.map((e) => `- ${e.id} | ${e.title}: ${e.about}`).join("\n");

export const intentById = (id: string): IntentEntry | undefined => INTENTS.find((e) => e.id === id);

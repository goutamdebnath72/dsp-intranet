// src/lib/tools/detect.ts
//
// WHAT HAS BEEN TYPED: a sum, a unit or currency conversion, a date question, a tyre size, a VIN, a BH number (all answered AS YOU TYPE, in the browser), or a request for a calculator form (opened with Enter).
// This file names no topic: it walks the topics of src/tools/registry.ts, each of which says in its own topic.ts which lines are its.
// One strict gate, so that no ordinary search is ever taken for a calculation: a sentence about a circular, a person's name, a ticket number, a date on its own all give null.
//
// PRIVACY: a line that is a tool hit is never sent to the server's search: a figure of someone's loan, pay or savings is not logged anywhere. (The currency rates come down as a
// public file; the amount stays in the browser.)

import type { DateTime } from "luxon";
import { TOPICS, type FormKind, type LiveTopic, type TopicHit } from "@/tools/registry";
import { MENU_KEYS, MENU_RANK, MENU_WORDS } from "@/tools/menu";
import type { FormCtx, TopicLogic } from "@/tools/types";

export type { FormKind, LiveTopic };

export type ToolHit =
  | TopicHit
  | { kind: "live"; topic: LiveTopic; /** for the news: the tab or language the line asked for ("hindi news", "business news") */ lang?: string }
  | { kind: "form"; form: FormKind }
  | { kind: "menu" };

/** the kinds that answer as the user types (the others open on Enter) */
export const isLive = (h: ToolHit | null): h is Exclude<ToolHit, { kind: "form" | "menu" }> => !!h && h.kind !== "form" && h.kind !== "menu";

/** where the calculator forms are tried among the typed-line answers: after the readers of a tyre, a rim, a BH number and a VIN (ranks below), before the dates, conversions and sums (ranks above) */
const FORM_RANK = 50;
/** where the live-data cards are tried: after the dates and conversions, before engine power and plain sums */
const LIVE_RANK = 90;

const FILLER = new Set([
  "calculator", "calculators", "calculate", "calculation", "calculations", "calc", "estimate", "estimator", "estimation", "compute", "tool", "tools", "online", "free", "form", "my", "for", "of", "the", "a", "an", "to", "me",
  "amount", "probable", "expected", "approximate", "approx", "how", "much", "is", "will", "be", "what", "can", "i", "get", "find", "show", "open", "need", "want", "please", "total", "monthly",
]);

const words = (q: string): string[] => q.toLowerCase().replace(/[?.!,]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

/** the topics, walked as plain TopicLogic (their exact types are kept in registry.ts for FormKind, LiveTopic and ToolHit) */
const TOPIC_LIST: readonly TopicLogic[] = TOPICS;

type FormRule = { id: FormKind | "menu"; rank: number; nouns: string[]; wants: (c: FormCtx) => boolean };
const MENU_RULE: FormRule = { id: "menu", rank: MENU_RANK, nouns: MENU_WORDS, wants: (c) => c.w.every((x) => MENU_WORDS.includes(x)) && c.w.some((x) => MENU_KEYS.includes(x)) };
const FORM_RULES: FormRule[] = [
  ...TOPIC_LIST.flatMap((t): FormRule[] => (t.form ? [{ id: t.id as FormKind, ...t.form }] : [])),
  // the list of all the calculators: "calculators", "all tools", "calculator menu"
  MENU_RULE,
].sort((a, b) => a.rank - b.rank);

/** A calculator form requested in a few plain words: every word is a noun of the tool or a filler. */
export function detectForm(raw: string): FormKind | "menu" | null {
  const w = words(raw);
  if (w.length === 0 || w.length > 7) return null;
  const has = (set: string[]) => w.some((x) => set.includes(x));
  const calcWord = w.some((x) => ["calculator", "calculate", "calculation", "calc", "estimate", "estimator", "estimation", "compute", "converter", "conversion"].includes(x));
  for (const r of FORM_RULES) {
    if (r.wants({ w, has, calcWord, only: () => w.every((x) => FILLER.has(x) || r.nouns.includes(x)) })) return r.id;
  }
  return null;
}

const LIVE_FILLER = new Set(["and", "or", "&", "today", "todays", "today's", "now", "current", "live", "latest", "in", "india", "indian", "of", "the", "a", "price", "prices", "rate", "rates", "bhav", "show", "me", "what", "is", "are", "check", "and", "for", "per", "gram", "grams", "10", "tola", "kg"]);

/** the multi-word names the topics want read as one word, longest first ("the hindu business line" before "the hindu") */
const PHRASES = TOPIC_LIST.flatMap((t) => t.live?.phrases ?? []).sort((a, b) => b.length - a.length);
const phraseWord = (p: string) => p.replace(/ /g, "_");
/** the words of a live line: hyphens read as spaces ("news-feed"), and a topic's multi-word names joined into one word ("dainik bhaskar" is "dainik_bhaskar") */
export function liveWords(raw: string): string[] {
  let s = ` ${words(raw).map((x) => x.replace(/^[‘'’"]+|[‘'’"]+$/g, "")).join(" ").replace(/-/g, " ").replace(/\s+/g, " ").trim()} `;
  for (const p of PHRASES) s = s.split(` ${p} `).join(` ${phraseWord(p)} `);
  return s.trim().split(" ").filter(Boolean);
}

/** A live-data card asked for in a few plain words: every word is a key word of the topic or a filler ("gold rate today", "silver price", "22k gold"), so no ordinary sentence is taken for it. */
export function detectLive(raw: string): LiveTopic | null {
  const w = liveWords(raw);
  if (w.length === 0 || w.length > 6) return null;
  for (const t of TOPIC_LIST) {
    const l = t.live;
    if (!l || !l.keys.length) continue;
    const phrases = (l.phrases ?? []).map(phraseWord);
    const isKey = (x: string) => l.keys.includes(x) || phrases.includes(x);
    if (w.some(isKey) && w.every((x) => LIVE_FILLER.has(x) || isKey(x) || l.extra.includes(x))) return t.id as LiveTopic;
  }
  return null;
}

type Step = { rank: number; run: (q: string, now?: DateTime) => ToolHit | null };
const formStep: Step = {
  rank: FORM_RANK,
  run: (q) => {
    const form = detectForm(q);
    if (form === "menu") return { kind: "menu" };
    return form ? { kind: "form", form } : null;
  },
};
const liveStep: Step = {
  rank: LIVE_RANK,
  run: (q) => {
    const live = detectLive(q);
    if (!live) return null;
    const lang = TOPIC_LIST.find((t) => t.id === live)?.live?.lang?.(liveWords(q));
    return { kind: "live", topic: live, ...(lang ? { lang } : {}) };
  },
};
const STEPS: Step[] = [
  ...TOPIC_LIST.flatMap((t): Step[] => (t.hits ?? []).map((h): Step => ({ rank: h.rank, run: (q, now) => h.detect(q, now) as ToolHit | null }))),
  formStep,
  liveStep,
].sort((a, b) => a.rank - b.rank);

/** What a typed line is: a tool hit, or null (an ordinary search). `now` fixes "today" for the tests. */
export function detectTool(raw: string, now?: DateTime): ToolHit | null {
  const q = (raw || "").trim();
  if ((q.length < 2 && q !== "π") || q.length > 200) return null;
  for (const s of STEPS) {
    const hit = s.run(q, now);
    if (hit) return hit;
  }
  return null;
}

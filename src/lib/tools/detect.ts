// src/lib/tools/detect.ts
//
// WHAT HAS BEEN TYPED: a sum, a unit or currency conversion, a date question (all answered AS YOU TYPE, in the browser), or a request for a calculator form (opened with Enter).
// One strict gate, so that no ordinary search is ever taken for a calculation: a sentence about a circular, a person's name, a ticket number, a date on its own all give null.
//
// PRIVACY: a line that is a tool hit is never sent to the server's search: a figure of someone's loan, pay or savings is not logged anywhere. (The currency rates come down as a
// public file; the amount stays in the browser.)

import type { DateTime } from "luxon";
import { evaluateExpression, type ExpressionResult } from "./expression";
import { parseConversion, type Conversion, type Mismatch } from "./units";
import { parseEngine } from "./converterModel";
import { parseTyre, type TyreSize } from "./tyre";
import { parseCurrency, type CurrencyRequest } from "./currency";
import { answerDateQuestion, type DateAnswer } from "./dateCalc";

/** the live-data cards: public numbers fetched by our own /api/live routes (nothing typed is sent to them) */
export type LiveTopic = "gold" | "markets" | "fuel" | "news" | "sports";

export type FormKind = "emi" | "pf" | "gratuity" | "encashment" | "dates" | "converter" | "tyre" | "ev" | "calc";

export type ToolHit =
  | { kind: "expression"; result: ExpressionResult }
  | { kind: "convert"; result: Conversion | Mismatch }
  | { kind: "currency"; request: CurrencyRequest }
  | { kind: "date"; answer: DateAnswer }
  | { kind: "engine"; value: number; id: string }
  | { kind: "tyre"; size: TyreSize; text: string }
  | { kind: "live"; topic: LiveTopic; /** for the news: the language the line asked for ("hindi news") */ lang?: "en" | "hi" | "bn" }
  | { kind: "form"; form: FormKind }
  | { kind: "menu" };

/** the kinds that answer as the user types (the others open on Enter) */
export const isLive = (h: ToolHit | null): h is Extract<ToolHit, { kind: "expression" | "convert" | "currency" | "date" | "engine" | "tyre" | "live" }> => !!h && ["expression", "convert", "currency", "date", "engine", "tyre", "live"].includes(h.kind);

const FILLER = new Set([
  "calculator", "calculators", "calculate", "calculation", "calculations", "calc", "estimate", "estimator", "estimation", "compute", "tool", "tools", "online", "free", "form", "my", "for", "of", "the", "a", "an", "to", "me",
  "amount", "probable", "expected", "approximate", "approx", "how", "much", "is", "will", "be", "what", "can", "i", "get", "find", "show", "open", "need", "want", "please", "total", "monthly",
]);
const NOUN: Record<FormKind, string[]> = {
  emi: ["emi", "emis", "loan", "loans", "home", "car", "personal", "bank", "pf", "coop", "co-operative", "cooperative", "society", "repayment", "installment", "installments", "instalment", "instalments"],
  pf: ["pf", "epf", "provident", "fund", "maturity", "corpus", "balance", "vpf"],
  gratuity: ["gratuity"],
  encashment: ["leave", "encashment", "el", "hpl"],
  dates: ["date", "dates", "age", "retirement", "superannuation", "days", "between", "difference"],
  tyre: ["tyre", "tyres", "tire", "tires", "size", "sizes", "specification", "specifications", "spec", "specs", "meaning", "meanings", "decode", "reader", "read", "reading", "guide", "chart", "code", "explained", "load", "speed", "index", "rating", "ratings", "symbol", "symbols", "and", "car", "wheel"],
  ev: ["ev", "evs", "electric", "car", "cars", "vehicle", "vehicles", "battery", "batteries", "charging", "charger", "chargers", "charge", "time", "times", "dc", "ac", "fast", "slow", "kwh", "specification", "specifications", "spec", "specs", "range", "and", "how", "long"],
  calc: ["calculator", "calc", "scientific", "basic", "standard", "numerical", "numeric", "full", "normal", "simple", "mac", "online", "free", "open", "the", "a", "my", "show", "need", "want"],
  converter: ["unit", "units", "currency", "converter", "conversion", "convert", "length", "area", "volume", "temperature", "angle", "energy", "power", "force", "pressure", "mass", "weight", "speed", "exchange", "rate"],
};

const words = (q: string): string[] => q.toLowerCase().replace(/[?.!,]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

/** A calculator form requested in a few plain words: every word is a noun of the tool or a filler. */
export function detectForm(raw: string): FormKind | "menu" | null {
  const w = words(raw);
  if (w.length === 0 || w.length > 7) return null;
  const has = (set: string[]) => w.some((x) => set.includes(x));
  const only = (kind: FormKind) => w.every((x) => FILLER.has(x) || NOUN[kind].includes(x));
  const calcWord = w.some((x) => ["calculator", "calculate", "calculation", "calc", "estimate", "estimator", "estimation", "compute", "converter", "conversion"].includes(x));
  // the full calculator (basic and scientific): "calculator", "scientific calculator", "calc"; the plural, "tools" and "menu" are the list of all the calculators below
  if (has(["calculator", "calc"]) && only("calc") && !has(["tools", "tool", "menu", "list"])) return "calc";
  if (w.every((x) => ["calculator", "calculators", "calc", "tools", "tool", "all", "menu", "list", "of", "available", "utilities", "the", "online"].includes(x)) && w.some((x) => ["calculator", "calculators", "calc", "tools", "tool", "utilities"].includes(x))) return "menu";
  // the loan and EMI forms: "emi" alone is enough; "loan" needs a calculator word
  if (has(["emi", "emis"]) && only("emi")) return "emi";
  if (has(["loan", "loans"]) && calcWord && only("emi")) return "emi";
  if (has(["pf", "epf", "provident", "vpf"]) && has(["maturity", "corpus", "calculator", "calculate", "calculation", "estimate", "estimator", "estimation"]) && only("pf") && !has(["loan", "loans"])) return "pf";
  if (has(["gratuity"]) && calcWord && only("gratuity")) return "gratuity";
  if (has(["encashment"]) && has(["leave", "el", "hpl"]) && (calcWord || has(["amount"])) && only("encashment")) return "encashment";
  if (has(["date", "dates", "age", "retirement", "superannuation", "days"]) && calcWord && only("dates")) return "dates";
  if (has(["converter", "conversion", "convert"]) && only("converter")) return "converter";
  // the tyre reader and the electric-car charging estimate: every word is a noun of the tool or a filler, so "ev policy circular" or "tyre purchase order" stay ordinary searches
  if (has(["tyre", "tyres", "tire", "tires"]) && only("tyre")) return "tyre";
  if (has(["ev", "evs", "electric"]) && has(["charging", "charger", "chargers", "charge", "battery", "batteries"]) && only("ev")) return "ev";
  return null;
}

const LIVE_FILLER = new Set(["and", "or", "&", "today", "todays", "today's", "now", "current", "live", "latest", "in", "india", "indian", "of", "the", "a", "price", "prices", "rate", "rates", "bhav", "show", "me", "what", "is", "are", "check", "and", "for", "per", "gram", "grams", "10", "tola", "kg"]);
const LIVE_TOPICS: Record<LiveTopic, { keys: string[]; extra: string[] }> = {
  gold: { keys: ["gold", "silver", "bullion", "24k", "22k", "24", "22", "carat", "karat", "sona", "chandi"], extra: ["24k", "22k", "carat", "karat", "gold", "silver", "metal", "metals", "ibja", "trend", "chart"] },
  markets: { keys: ["sensex", "nifty", "stock", "stocks", "share", "shares", "bse", "nse", "banknifty", "trending", "sail"], extra: ["market", "markets", "index", "indices", "bank", "50", "price", "prices", "trending", "stocks", "gainers", "losers", "movers", "top", "today", "live", "watch", "list", "sensex", "nifty", "share", "sail", "bhav"] },
  fuel: { keys: ["petrol", "diesel", "lpg", "fuel", "fuels", "cylinder", "cylinders", "e20", "cng"], extra: ["metro", "metros", "city", "cities", "delhi", "mumbai", "chennai", "kolkata", "subsidised", "subsidized", "unsubsidised", "unsubsidized", "domestic", "commercial", "cooking", "gas", "ujjwala", "litre", "liter", "e20", "blend", "kg", "5", "14.2", "19", "47.5"] },
  news: { keys: ["news", "headline", "headlines", "samachar", "khabar", "khabrein", "समाचार", "খবর"], extra: ["hindi", "bengali", "bangla", "english", "top", "breaking", "stories", "story", "national", "india", "latest", "morning", "daily", "paper", "newspaper", "in", "hindi", "bangla"] },
  sports: { keys: ["sports", "sport", "cricket", "ipl", "olympics", "olympic", "football", "hockey", "tennis"], extra: ["news", "update", "updates", "scores", "score", "live", "match", "matches", "world", "cup", "asian", "games", "commonwealth", "india", "headlines", "latest", "results", "today"] },
};

/** A live-data card asked for in a few plain words: every word is a key word of the topic or a filler ("gold rate today", "silver price", "22k gold"), so no ordinary sentence is taken for it. */
export function detectLive(raw: string): LiveTopic | null {
  const w = words(raw).map((x) => x.replace(/^[‘'’"]+|[‘'’"]+$/g, ""));
  if (w.length === 0 || w.length > 6) return null;
  for (const topic of Object.keys(LIVE_TOPICS) as LiveTopic[]) {
    const t = LIVE_TOPICS[topic];
    if (!t.keys.length) continue;
    if (w.some((x) => t.keys.includes(x)) && w.every((x) => LIVE_FILLER.has(x) || t.keys.includes(x) || t.extra.includes(x))) return topic;
  }
  return null;
}

/** What a typed line is: a tool hit, or null (an ordinary search). `now` fixes "today" for the tests. */
export function detectTool(raw: string, now?: DateTime): ToolHit | null {
  const q = (raw || "").trim();
  if ((q.length < 2 && q !== "π") || q.length > 200) return null;
  const tyre = parseTyre(q);
  if (tyre) return { kind: "tyre", size: tyre, text: q.replace(/^(?:what\s+is\s+|read\s+|decode\s+|explain\s+)?(?:the\s+)?(?:tyre|tire)s?\s+(?:size|code|specs?|specifications?)\s+/i, "").trim().toUpperCase() };
  const form = detectForm(q);
  if (form === "menu") return { kind: "menu" };
  if (form) return { kind: "form", form };
  const date = answerDateQuestion(q, now);
  if (date) return { kind: "date", answer: date };
  const currency = parseCurrency(q);
  if (currency) return { kind: "currency", request: currency };
  const convert = parseConversion(q);
  if (convert) return { kind: "convert", result: convert };
  const live = detectLive(q);
  if (live) {
    const w = words(q);
    const lang = live === "news" ? (w.some((x) => ["hindi", "samachar", "khabar", "khabrein", "समाचार"].includes(x)) ? "hi" : w.some((x) => ["bengali", "bangla", "খবর"].includes(x)) ? "bn" : undefined) : undefined;
    return { kind: "live", topic: live, ...(lang ? { lang } : {}) };
  }
  const engine = parseEngine(q);
  if (engine) return { kind: "engine", value: engine.value, id: engine.id };
  const expression = evaluateExpression(q);
  if (expression) return { kind: "expression", result: expression };
  return null;
}

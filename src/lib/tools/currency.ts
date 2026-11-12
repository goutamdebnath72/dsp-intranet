// src/lib/tools/currency.ts
//
// CURRENCY CONVERSION FOR THE SEARCH BAR: "100 usd to inr", "$100 in rupees", "1 pound in rupees", "euro rate", "usd to inr".
// The parser is pure. The RATES are public reference rates fetched by the server route /api/tools/rates (Frankfurter, which publishes the European Central Bank's rates, with
// open.er-api.com for the Gulf currencies); the amount a user types is never sent anywhere: only the rates come down, and the sum is done in the browser.
//
// Reference rates are not what a bank or a money changer pays: the answer says so, with the date of the rates.

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  aliases: string[];
}

const C = (code: string, name: string, symbol: string, aliases: string[]): Currency => ({ code, name, symbol, aliases: [code.toLowerCase(), ...aliases] });

export const CURRENCIES: Currency[] = [
  C("INR", "Indian rupee", "₹", ["rupee", "rupees", "rs", "inr", "₹", "indian rupee", "indian rupees"]),
  C("USD", "US dollar", "$", ["dollar", "dollars", "$", "us dollar", "us dollars", "usd", "buck", "bucks"]),
  C("EUR", "Euro", "€", ["euro", "euros", "€", "eur"]),
  C("GBP", "Pound sterling", "£", ["pound", "pounds", "£", "sterling", "pound sterling", "pounds sterling", "gbp", "british pound", "british pounds"]),
  C("JPY", "Japanese yen", "¥", ["yen", "jpy", "japanese yen"]),
  C("CNY", "Chinese yuan", "CN¥", ["yuan", "cny", "rmb", "renminbi", "chinese yuan"]),
  C("AUD", "Australian dollar", "A$", ["aud", "australian dollar", "australian dollars"]),
  C("CAD", "Canadian dollar", "C$", ["cad", "canadian dollar", "canadian dollars"]),
  C("SGD", "Singapore dollar", "S$", ["sgd", "singapore dollar", "singapore dollars"]),
  C("CHF", "Swiss franc", "CHF", ["chf", "franc", "francs", "swiss franc", "swiss francs"]),
  C("AED", "UAE dirham", "AED", ["aed", "dirham", "dirhams", "uae dirham", "uae dirhams"]),
  C("SAR", "Saudi riyal", "SAR", ["sar", "saudi riyal", "saudi riyals"]),
  C("QAR", "Qatari riyal", "QAR", ["qar", "qatari riyal", "qatari riyals"]),
  C("KWD", "Kuwaiti dinar", "KWD", ["kwd", "kuwaiti dinar", "kuwaiti dinars"]),
  C("RUB", "Russian rouble", "RUB", ["rub", "rouble", "roubles", "ruble", "rubles"]),
  C("ZAR", "South African rand", "ZAR", ["zar", "rand"]),
  C("HKD", "Hong Kong dollar", "HK$", ["hkd", "hong kong dollar", "hong kong dollars"]),
  C("NZD", "New Zealand dollar", "NZ$", ["nzd", "new zealand dollar", "new zealand dollars"]),
  C("KRW", "South Korean won", "₩", ["krw", "won", "₩"]),
  C("MYR", "Malaysian ringgit", "RM", ["myr", "ringgit"]),
  C("THB", "Thai baht", "฿", ["thb", "baht", "฿"]),
  C("BDT", "Bangladeshi taka", "৳", ["bdt", "taka", "৳"]),
  C("NPR", "Nepalese rupee", "NPR", ["npr", "nepalese rupee", "nepali rupee", "nepalese rupees"]),
  C("LKR", "Sri Lankan rupee", "LKR", ["lkr", "sri lankan rupee", "sri lankan rupees"]),
];

const BY_ALIAS = new Map<string, Currency>();
for (const c of CURRENCIES) for (const a of c.aliases) if (!BY_ALIAS.has(a.toLowerCase())) BY_ALIAS.set(a.toLowerCase(), c);

export const currencyOf = (word: string): Currency | null => {
  const w = (word || "").trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  return BY_ALIAS.get(w) ?? null;
};

/** The rates the server route returns: how many units of each currency one US dollar buys. */
export interface Rates {
  base: "USD";
  /** the date the rates are for (YYYY-MM-DD) */
  date: string;
  rates: Record<string, number>;
  /** where they came from, in words */
  source: string;
}

export interface CurrencyRequest {
  amount: number;
  from: Currency;
  to: Currency;
}

const NUM = String.raw`((?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?)`;
const JOIN = String.raw`(?:in|to|into|as|=|->|→)`;
const SYMBOLS = String.raw`(₹|\$|£|€|rs\.?|inr|usd)`;

/**
 * Reads a currency question. Returns null unless BOTH sides are currencies the table knows ("5 pounds to kg" is a unit conversion, not this).
 * "usd to inr" is one dollar; "dollar rate" and "euro rate today" are one unit in rupees.
 */
export function parseCurrency(raw: string): CurrencyRequest | null {
  const q = (raw || "").trim().replace(/^(?:what\s+is|what's|how\s+much\s+is|convert)\s+/i, "").replace(/\?+$/, "").trim();
  if (!q || q.length > 70) return null;
  let m: RegExpExecArray | null;
  const pair = (a: string, b: string, amount: number): CurrencyRequest | null => {
    const from = currencyOf(a), to = currencyOf(b);
    return from && to && from.code !== to.code ? { amount, from, to } : null;
  };
  let r: CurrencyRequest | null = null;
  // "$100 to inr", "₹5000 in dollars"
  if ((m = new RegExp(`^${SYMBOLS}\\s*${NUM}\\s+${JOIN}\\s+(.+)$`, "i").exec(q)) && (r = pair(m[1], m[3], Number(m[2].replace(/,/g, ""))))) return r;
  // "100 usd to inr", "100 dollars in rupees"
  if ((m = new RegExp(`^${NUM}\\s*([a-z$£€₹][a-z .]*?)\\s+${JOIN}\\s+(.+)$`, "i").exec(q)) && (r = pair(m[2], m[3], Number(m[1].replace(/,/g, ""))))) return r;
  // "usd to inr"
  if ((m = new RegExp(`^([a-z][a-z .]*?)\\s+${JOIN}\\s+([a-z][a-z .]*)$`, "i").exec(q)) && (r = pair(m[1], m[2], 1))) return r;
  // "dollar rate", "euro rate today", "pound price in india"
  if ((m = /^(?:today'?s?\s+)?(usd|dollar|euro|eur|pound|gbp|sterling|yen|dirham|aed)\s+(?:rate|price|value)(?:\s+today|\s+in\s+(?:inr|india|rupees?))?$/i.exec(q)) && (r = pair(m[1], "inr", 1))) return r;
  return null;
}

export interface CurrencyResult {
  amount: number;
  from: Currency;
  to: Currency;
  result: number;
  /** one unit of `from` in `to` */
  rate: number;
  date: string;
  source: string;
}

/** The sum, from the rates: amount / rate(from) * rate(to). Null when a rate is missing. */
export function convertCurrency(req: CurrencyRequest, rates: Rates): CurrencyResult | null {
  const rf = req.from.code === "USD" ? 1 : rates.rates[req.from.code];
  const rt = req.to.code === "USD" ? 1 : rates.rates[req.to.code];
  if (!rf || !rt || !Number.isFinite(rf) || !Number.isFinite(rt)) return null;
  const rate = rt / rf;
  return { amount: req.amount, from: req.from, to: req.to, result: req.amount * rate, rate, date: rates.date, source: rates.source };
}

/** What the server route returns is checked before it is used: rates must be positive numbers. */
export function validRates(x: unknown): x is Rates {
  const r = x as Rates;
  return !!r && r.base === "USD" && typeof r.date === "string" && typeof r.source === "string" && !!r.rates && typeof r.rates === "object" && typeof r.rates.INR === "number" && r.rates.INR > 0 && Object.values(r.rates).every((v) => typeof v === "number" && v > 0 && Number.isFinite(v));
}

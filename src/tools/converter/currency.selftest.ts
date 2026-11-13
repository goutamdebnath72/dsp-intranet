// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/converter/currency.selftest.ts
import { readFileSync } from "node:fs";
import { parseCurrency, convertCurrency, currencyOf, validRates, CURRENCIES, type Rates } from "./currency";
import { parseConversion } from "./units";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const rates: Rates = { base: "USD", date: "2026-11-11", source: "test", rates: { INR: 93.69, EUR: 0.89871, GBP: 0.75149, AED: 3.6725, JPY: 150 } };
const pc = (q: string) => { const x = parseCurrency(q); return x ? `${x.amount} ${x.from.code}>${x.to.code}` : null; };

ok("a code to a code", pc("100 usd to inr") === "100 USD>INR" && pc("5000 inr in usd") === "5000 INR>USD" && pc("250 eur to gbp") === "250 EUR>GBP");
ok("words: dollar, rupee, pound, euro, dirham", pc("100 dollars in rupees") === "100 USD>INR" && pc("1 pound in rupees") === "1 GBP>INR" && pc("2 euros to inr") === "2 EUR>INR" && pc("10 dirhams to rupees") === "10 AED>INR");
ok("symbols", pc("$100 to inr") === "100 USD>INR" && pc("₹5000 in dollars") === "5000 INR>USD" && pc("£20 to inr") === "20 GBP>INR" && pc("€50 in rupees") === "50 EUR>INR" && pc("Rs 1,00,000 in usd") === "100000 INR>USD");
ok("no amount means one unit", pc("usd to inr") === "1 USD>INR" && pc("euro to rupees") === "1 EUR>INR");
ok("'dollar rate' and 'euro rate today' mean one unit in rupees", pc("dollar rate") === "1 USD>INR" && pc("euro rate today") === "1 EUR>INR" && pc("today's pound price") === "1 GBP>INR" && pc("usd rate in india") === "1 USD>INR");
ok("'what is' and a trailing ?", pc("what is 100 usd in inr?") === "100 USD>INR");
ok("the same currency on both sides is nothing", pc("100 usd to usd") === null && pc("5 inr to rupees") === null);
ok("a unit conversion is not a currency question, and the reverse", pc("5 pounds to kg") === null && parseConversion("5 pounds to kg")?.kind === "convert" && parseConversion("100 usd to inr") === null);
ok("a sentence, a word that is not a currency, a bare number: nothing", ["who is in charge of blast furnace", "5 foo to bar", "100", "rate of interest", "dollar", "gift card amount in rupees", "holiday list to inr"].every((q) => parseCurrency(q) === null), JSON.stringify(["who is in charge of blast furnace", "5 foo to bar", "100", "rate of interest", "dollar", "gift card amount in rupees"].map((q) => parseCurrency(q))));
ok("the sum from the rates", (() => { const r = convertCurrency(parseCurrency("100 usd to inr")!, rates)!; return Math.abs(r.result - 9369) < 1e-6 && Math.abs(r.rate - 93.69) < 1e-9 && r.date === "2026-11-11"; })());
ok("a cross rate goes through the dollar", (() => { const r = convertCurrency(parseCurrency("1 gbp to inr")!, rates)!; return Math.abs(r.result - 93.69 / 0.75149) < 1e-6; })() && (() => { const r = convertCurrency(parseCurrency("1 eur to gbp")!, rates)!; return Math.abs(r.result - 0.75149 / 0.89871) < 1e-9; })());
ok("a missing rate gives nothing, not a wrong number", convertCurrency(parseCurrency("1 qar to inr")!, rates) === null);
ok("the rates the route returns are checked before use", validRates(rates) && !validRates({ ...rates, rates: { INR: -1 } }) && !validRates({ ...rates, rates: { EUR: 0.9 } }) && !validRates({ ...rates, base: "EUR" }) && !validRates(null) && !validRates({ ...rates, rates: { INR: 93, X: NaN } }));
ok("the table has no clashing words", (() => { const seen = new Map<string, string>(); let bad = ""; for (const c of CURRENCIES) for (const a of c.aliases) { const k = a.toLowerCase(); if (seen.has(k) && seen.get(k) !== c.code) bad += `${k} `; seen.set(k, c.code); } return !bad; })() && currencyOf("Rs.")?.code === "INR" && currencyOf("Dollars")?.code === "USD");
const route = readFileSync("src/app/api/tools/rates/route.ts", "utf8");
ok("the route reads nothing from the user and says so", !/request|req\b|searchParams|cookies|headers\(\)/.test(route.replace(/headers: \{ Accept/g, "").replace(/\/\/.*$/gm, "")) && /export async function GET\(\)/.test(route));

console.log(`currency selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/tools/intent.selftest.ts
// Which utility a line means, whatever the words: arbitrary, capitalised, misspelt and long lines for every utility, ordinary searches that must NOT become a utility, and the AI step (with a stand-in AI): what
// leaves, what comes back, and what is never sent.
import { readFileSync } from "node:fs";
import { detectTool } from "./detect";
import { askWhichUtility, buildPrompt, parseAiAnswer } from "./intentAi";
import { catalogForAi, clearIntent, distance, informative, INTENTS, looksLikeSentence, maskForAi, rankIntents, similarity, stem, worthAsking } from "./intent";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

// a line is HANDLED when the box would open the right utility without the AI: an exact reader (detectTool) or a clear intent
const topicOfHit = (q: string): string | null => {
  const h = detectTool(q);
  if (!h) return null;
  return h.kind === "form" ? h.form : h.kind === "live" ? h.topic : null;
};
const handledBy = (q: string): string | null => topicOfHit(q) ?? clearIntent(q)?.id ?? null;

// ---- every utility, in the words of someone who has not read the manual
const WANT: Record<string, string[]> = {
  gold: ["PLEASE TELL ME THE CURRENT GOLD PRICE IN KOLKATA SIR", "aaj sona ka bhav kya hai", "today silver price per kg", "TODAY GOLD RATE 22 CARAT", "gold rates in india please", "what is price of gold now"],
  markets: ["I WANT TO KNOW STOCK MARKET TODAY", "how is sensex doing", "NIFTY TODAY LIVE", "sail share price now", "which shares gained most today", "bse nse index today"],
  fuel: ["pettrol prise today", "WHAT IS THE PRICE OF DIESEL TODAY", "lpg cylinder price kolkata", "petrol diesel rate", "how much is cng per kg", "FUEL PRICES IN INDIA"],
  news: ["tell me news", "SHOW ME TODAY'S HEADLINES", "latest headlines please", "i want to read newspaper", "hindi samachar", "business news today"],
  sports: ["cricket score", "IPL NEWS TODAY", "football news", "latest hockey news", "SPORTS HEADLINES", "olympics news please"],
  weather: ["KOLKATA WEATHER TOMORROW WILL IT RAIN", "durgapur weather today", "WILL IT RAIN IN DURGAPUR TODAY", "forecast for the week", "mausam kaisa hai", "temperature today and humidity"],
  flights: ["which flights are there from andal airport", "FLIGHTS FROM DURGAPUR TO DELHI", "andal airport flight timing", "airline timings durgapur", "flight to bengaluru from andal airport", "AIRPORT FLIGHT SCHEDULE"],
  railway: ["trains from durgapur to howrah timing", "TRAIN TIMETABLE FOR DURGAPUR STATION", "asansol railway trains list", "which trains stop at durgapur", "train fare from durgapur to patna", "RAILWAY STATION TRAINS TODAY"],
  aicpi: ["dearness allowance increase this month", "WHAT IS THE DA PERCENTAGE NOW", "aicpi index for this month", "inflation rate in india", "da hike announcement index", "CONSUMER PRICE INDEX LATEST"],
  pincode: ["pin code of durgapur", "WHICH WARD DO I LIVE IN", "postal code durgapur post office", "assembly constituency of durgapur", "police station area durgapur thana", "DMC WARD LIST"],
  steel: ["price of tmt bars", "STEEL PRICES THIS MONTH", "sail steel production", "tata steel results quarter", "how much hr coil price", "BILLET AND JOIST PRODUCTS"],
  dsphistory: ["when was durgapur steel plant started", "STORY OF DURGAPUR STEEL PLANT", "who built dsp", "history of sail", "heads of durgapur steel plant", "WHO WAS THE FIRST GENERAL MANAGER OF DSP"],
  pf: ["how much will i get after retirement from provident fund", "WHAT WILL BE MY FINAL PF AMOUNT WHEN I RETIRE", "pf corpus at superannuation", "epf balance maturity", "MY PROVIDENT FUND AFTER RETIREMENT", "vpf effect on my retirement fund", "PF LOAN REPAYMENT PER MONTH", "emi of my refundable pf loan", "WHAT WILL BE THE INSTALMENT OF A PF LOAN OF 5 LAKH"],
  gratuity: ["how much gratuity will i get", "GRATUITY AMOUNT AT RETIREMENT", "calculate my gratuity please", "gratuity for 30 years service", "retirement gratuity payable", "WHAT IS MY GRATUITY"],
  encashment: ["encash my earned leave", "LEAVE ENCASHMENT AMOUNT", "el encashment calculation", "half pay leave encashment money", "HOW MUCH FOR ENCASHING 300 DAYS LEAVE", "leave encash calculator"],
  dates: ["how many days between my joining and retirement", "my age if born 1985", "WHAT DAY WAS 15 AUGUST 1947", "date after 90 days from today", "WHEN WILL I RETIRE IF BORN IN 1975", "age calculator from birth date"],
  converter: ["how to convert dollars to rupees", "convert 5 km to miles", "WHAT IS 1 BIGHA IN SQUARE FEET", "unit converter please", "CELSIUS TO FAHRENHEIT", "euro rate in rupees today"],
  calc: ["open the calculator please", "I NEED A SCIENTIFIC CALCULATOR", "calculator for maths", "show me calculator", "BASIC CALCULATOR ONLINE", "need to do some calculation"],
  tyre: ["how to read tyre size", "TYRE SIZE MEANING", "what does 205/55 R16 mean", "tyre marking decode", "TIRE SPECIFICATION GUIDE", "wheel tyre size chart"],
  rim: ["wheel rim marking meaning", "WHAT IS 8Jx20 RIM", "rim size reader", "how to read alloy wheel marking"],
  ev: ["EV CHARGING HOW LONG", "electric car charging time", "how long to charge electric vehicle battery", "DC FAST CHARGER TIME FOR EV", "battery charging kwh time ev"],
  vin: ["decode my vehicle chassis number", "VIN NUMBER MEANING", "vehicle identification number reader", "what does chassis number tell", "VIN DECODER"],
  bh: ["bharat series number plate", "BH SERIES VEHICLE REGISTRATION RULES", "who is eligible for bh number plate", "how to apply for bh plate", "all india vehicle registration bh"],
};
let handled = 0, total = 0;
const missed: string[] = [];
const wrong: string[] = [];
for (const [id, lines] of Object.entries(WANT)) {
  for (const l of lines) {
    total++;
    const h = handledBy(l);
    // the tyre reader also holds the wheel (rim) marking guide (its own design: "wheel size" opens it), so a rim line may open it
    if (h === id || (id === "rim" && h === "tyre")) handled++;
    else if (h) wrong.push(`${l} -> ${h} (wanted ${id})`);
    else missed.push(`${id}: ${l}`);
  }
}
ok("no line of the corpus opens the WRONG utility, by an exact reader or a clear intent", wrong.length === 0, wrong.join(" | "));
ok(`at least 90% of the ${total} arbitrary lines open the right utility with no AI at all (the rest go to the AI step)`, handled / total >= 0.9, `${handled}/${total}; missed: ${missed.join(" | ")}`);
ok("the corpus covers every utility that has an intent", INTENTS.every((e) => (WANT[e.id] ?? []).length >= 4), INTENTS.filter((e) => (WANT[e.id] ?? []).length < 4).map((e) => e.id).join());

// ---- ordinary searches must never become a utility (people, departments, circulars, announcements)
const SEARCH = [
  "rakesh ojha", "ojha", "D000896", "circular on gold loan", "circular gold price revision", "leave policy circular 2025", "transfer order for engineers", "office order regarding promotion", "new pay scale for executives",
  "holiday list 2026", "canteen timings notice", "safety circular blast furnace", "medical reimbursement policy", "who is the head of c&it department", "list of employees in sinter plant", "contract workers wages circular",
  "annual increment order 2025", "training programme schedule november", "dearness allowance circular for non executives", "pf loan sanction rules circular", "gratuity rules circular for employees", "leave encashment policy circular",
  "tyre purchase order for dumpers", "ev policy circular", "vehicle allotment order", "steel plant modernisation circular", "bonus circular", "contact number of hr department", "tender notice for fuel supply", "weather related safety instructions circular",
  "durgapur township water supply schedule", "travel allowance circular", "LTC rules for executives", "reservation policy circular", "newsletter december", "gold coin presentation retirement", "hello", "loan", "leave", "history",
];
const hijacked = SEARCH.filter((l) => clearIntent(l) !== null);
ok("none of the 40 ordinary searches (names, ids, departments, circular titles, one-word lines) is taken for a utility by the clear-intent step", hijacked.length === 0, hijacked.join(" | "));

// ---- the parts
ok("a plural, an ending, a slip of spelling and a long beginning all meet the word: prices/price, charging/charge, pettrol/petrol, calculation/calculate; unrelated words do not", stem("prices") === stem("price") && similarity("prices", "price") >= 0.9 && similarity("pettrol", "petrol") === 0.8 && similarity("calculation", "calculate") >= 0.65 && similarity("circular", "calculator") === 0 && distance("kitten", "sitting", 2) === 3);
ok("fillers, politeness, places and numbers carry no weight: only what is WANTED is read", informative("PLEASE TELL ME THE CURRENT GOLD PRICE IN KOLKATA SIR 2026").join() === "gold,price");
ok("a rare word counts for more than a common one: 'gold' alone is stronger than 'price' alone", (rankIntents("gold")[0]?.strength ?? 0) > (rankIntents("price")[0]?.strength ?? 0));
ok("a line with a word the topic does not know is less sure of it: 'gold price' is surer of gold than 'gold price revision circular'", (rankIntents("gold price")[0]?.confidence ?? 0) > (rankIntents("gold price revision circular")[0]?.confidence ?? 1));
ok("two topics equally near make no clear intent ('gold loan' is the gold card and the loan form alike)", clearIntent("gold loan") === null && rankIntents("gold loan").length >= 2);
ok("a line of one word, or one word and fillers, is left to the exact readers and the search", clearIntent("loan") === null && clearIntent("please loan") === null && clearIntent("tell me news")?.id === "news");
ok("the AI is asked only about a sentence that cannot be a name or an ID: a person's name (even of three words), a person by number, a question that is a document search is not excluded but a name is", worthAsking("WHAT WILL COME TO MY ACCOUNT WHEN I LEAVE SERVICE") && !worthAsking("Rakesh Kumar Ojha") && !worthAsking("D000896 2584") && !worthAsking("D000896") && !worthAsking("gold rate") && worthAsking("how much money after retirement"));
ok("a sentence is three words or more", looksLikeSentence("tell me news") && !looksLikeSentence("gold rate"));

// ---- what may leave for the AI
ok("long digit runs, phone numbers and e-mail addresses are blanked before a line leaves; short numbers stay", maskForAi("my loan 3600000 and call 9830012345 or mail a.b@sail.in about emi") === "my loan [number] and call [number] or mail [email] about emi" && maskForAi("emi of 20 lakh for 15 years")?.includes("20") === true);
ok("an ID query, a line that is too short or too long is never sent", maskForAi("D000896") === null && maskForAi("2584") === null && maskForAi("hi") === null && maskForAi("x".repeat(301)) === null && maskForAi("D000896 2584") === null);
async function main() {
const sent: string[] = [];
const fake = (reply: string) => async (p: string) => { sent.push(p); return reply; };
ok("the prompt carries the list of utilities (every id), the blanked line, the 'none' rule, and nothing of the user but the line", await (async () => { sent.length = 0; await askWhichUtility("what will come to my account when i leave service 9830012345", fake('{"id":"none","confidence":0.1}')); const p = sent[0] ?? ""; return INTENTS.every((e) => p.includes(`- ${e.id} | ${e.title}`)) && p.includes("[number]") && !p.includes("9830012345") && /Answer "none"/.test(p) && p === buildPrompt("what will come to my account when i leave service [number]") && p.includes(catalogForAi()); })());
ok("an ID query is not sent at all: the AI is not even called", await (async () => { sent.length = 0; const r = await askWhichUtility("D000896 2584", fake('{"id":"pf","confidence":0.9}')); return r === null && sent.length === 0; })());
ok("the AI's reply is checked: a real id with a confidence is a pick; none, an unknown id, a missing or non-numeric confidence, prose and broken JSON are not", parseAiAnswer('{"id":"pf","confidence":0.9}')?.id === "pf" && parseAiAnswer('```json\n{"id":"gold","confidence":0.75}\n```')?.id === "gold" && parseAiAnswer('{"id":"none","confidence":0.9}') === null && parseAiAnswer('{"id":"hack","confidence":0.9}') === null && parseAiAnswer('{"id":"pf"}') === null && parseAiAnswer('{"id":"pf","confidence":"high"}') === null && parseAiAnswer("pf") === null && parseAiAnswer("{bad") === null && parseAiAnswer("") === null && parseAiAnswer('{"id":"pf","confidence":7}')?.confidence === 1);
ok("an AI that fails or hangs gives no answer, not an error", await askWhichUtility("a sentence about something", async () => { throw new Error("down"); }) === null);

// ---- the route and the client
const route = readFileSync("src/app/api/tools/intent/route.ts", "utf8").replace(/\/\/.*$/gm, "");
const client = readFileSync("src/lib/tools/intentClient.ts", "utf8").replace(/\/\/.*$/gm, "");
ok("the route needs a signed-in user, can be switched off (TOOL_INTENT_AI=off) or has no key, limits a person to 12 a minute, remembers a line for an hour, blanks the line first, and logs nothing of it", /getSessionTicket/.test(route) && /TOOL_INTENT_AI/.test(route) && /GEMINI_API_KEY/.test(route) && /mine\.length >= 12/.test(route) && /HOUR/.test(route) && /maskForAi\(line\)/.test(route) && !/console\./.test(route));
ok("the browser sends only the one line, never throws, and acts on a pick from a confidence of 0.6", /body: JSON\.stringify\(\{ line \}\)/.test(client) && /catch/.test(client) && /AI_MIN_CONFIDENCE/.test(client) && !/localStorage|sessionStorage|document\.cookie/.test(client));

console.log(`intent: ${pass} passed, ${fail} failed (${handled}/${total} lines handled without the AI)`);
process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

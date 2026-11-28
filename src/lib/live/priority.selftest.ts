// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/priority.selftest.ts
// The PRIORITY DESK: the death of a renowned person, a big accident and a diplomatic visit on the three language tabs, one story in one language only, and a record of the market on the Business tab.
// Real headlines are those of the papers' feeds of 13 and 27 Nov 2026; the ones marked (made up) I wrote to cover what that day's news did not have.
import { DateTime } from "luxon";
import { accidentOf, assignDesk, deadCount, demiseOf, isMajor, massacreOf, nameKeys, priorityOf, recordMove, sameEvent, scopeOf, skeleton, visitOf, type DeskItem } from "./priority";
import { BreakingWatch, WATCH_EVERY_MS } from "./newsWatch";
import { BUSINESS_SOURCES, buildNews, buildTab, NEWS_SOURCES, PRIORITY_CAP, SOURCES_OF } from "./news";
import { RECORD_SEARCHES } from "./records";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const kindScope = (t: string) => { const f = priorityOf(t); return f ? `${f.kind}:${f.scope}` : null; };

// ---- a demise of a renowned person, and where
const D: Array<[string, string]> = [
  ["প্রয়াত রাজ্যের প্রাক্তন মন্ত্রী উজ্জ্বল বিশ্বাস, ভর্তি ছিলেন কলকাতার হাসপাতালে, মমতা তুললেন রাজনৈতিক প্রতিহিংসার অভিযোগ", "demise:wb"],
  ["C.S. Karnan, controversial former High Court judge, passes away in Chennai", "demise:india"],
  ["BJP MP Ramrao Sakharam Wadkute dies of cardiac arrest, PM offers condolences", "demise:india"],
  ["‘আকস্মিক মৃত্যু’ আমেরিকায় নিযুক্ত রাশিয়ার রাষ্ট্রদূতের! শোকপ্রকাশ রুশ বিদেশ মন্ত্রকের, কী ভাবে প্রয়াত? এখনও স্পষ্ট নয়", "demise:world"],
  ["Strobe Talbott, one of the architects of the turnaround in India-US ties, dies at 80", "demise:india"], // names India, so India's: a limit I state
  ["Legendary Bengali singer passes away in Kolkata, Mamata mourns (made up)", "demise:wb"],
  ["Veteran Hollywood actor dies at 91, tributes pour in from London to Los Angeles (made up)", "demise:world"],
  ["वरिष्ठ अभिनेता का निधन, पूर्व मुख्यमंत्री ने जताया शोक (made up)", "demise:india"],
  ["दिग्गज कवि का कोलकाता में निधन, साहित्य जगत में शोक (made up)", "demise:wb"],
  ["প্রয়াত কিংবদন্তি সঙ্গীতশিল্পী, শোকপ্রকাশ মুখ্যমন্ত্রীর (made up)", "demise:india"],
  ["Former ISRO chairman passes away in Bengaluru (made up)", "demise:india"],
];
ok("the death of a renowned person is found, in the three languages, and put in West Bengal, India or the world by the places it names", D.every(([t, w]) => kindScope(t) === w), D.filter(([t, w]) => kindScope(t) !== w).map(([t]) => `${kindScope(t)} ${t.slice(0, 50)}`).join(" | "));
const NOT_D = [
  "Youth dies after assault over firecracker dispute in Pune’s Viman Nagar: Police", "20-year-old undergraduate student dies by suicide at IIT Roorkee", "She died a ‘foreigner’ in Assam, her family escapes fate after 4-year fight",
  "Ohio woman dies after selling 62-acre farm for $350,000; court decides heirs", "Woman, 71, found dead at Raigad home; jewellery worth ₹3.5 lakh missing", "Dead star's two rings of shattered planets offer glimpse of Sun's future",
  "Man dies in road accident near Durgapur (made up)", "Death toll in Manipur hooch tragedy rises to 17", "Hero dies in the last scene of the film, fans mourn (made up)", "Court awards death penalty to killer of former minister (made up)",
  "ममता के बागी ऋतब्रत बंगाल में नेता प्रतिपक्ष नहीं रहेंगे: कलकत्ता हाईकोर्ट ने नियुक्ति रद्द की", "খবর হটকে- জীতে-জী অন্তিম সংস্কারের বুকিং (made up)",
];
ok("a death that is not a renowned person's stays an ordinary story: an ordinary man, a student, a suicide, a death toll, a film, a death penalty, 'will no longer remain' (नहीं रहेंगे)", NOT_D.every((t) => demiseOf(t) === null), NOT_D.filter((t) => demiseOf(t)).join(" | "));

// ---- a big accident, in West Bengal or India only
const A: Array<[string, string]> = [
  ["Four, including three children, killed as fire guts 25 houses in Arunachal’s Kurung Kumey", "accident:india"],
  ["Three killed as speeding SUV hits people changing tyre on Delhi-Mumbai Expressway in Alwar", "accident:india"],
  ["5 workers critically burnt as hot furnace dust falls on them at Chhattisgarh steel plant", "accident:india"],
  ["Bhilai Steel Plant gas leak tragedy: Four out of 8 injured discharged from the hospital", "accident:india"],
  ["Manipur sets up probe in Chandel hooch tragedy as toll rises to 17", "accident:india"],
  ["पुणे में बस-स्टॉप पर ट्रक ने छात्रों को रौंदा, VIDEO:3 की मौत; 6 घायल, टक्कर के बाद बैलेंस बिगड़ा", "accident:india"],
  ["এক দিনে শহরে তিন দুর্ঘটনা, মৃত্যু তিন জনের", "accident:india"],
  ["Blast at Durgapur steel plant injures two workers (made up)", "accident:wb"],
  ["Six killed as bus overturns near Siliguri (made up)", "accident:wb"],
  ["হাওড়ায় ভয়াবহ অগ্নিকাণ্ড, মৃত ৪ (made up)", "accident:wb"],
  ["बोकारो स्टील प्लांट में विस्फोट, 4 मजदूरों की मौत (made up)", "accident:india"],
];
ok("a big accident is found: three or more dead, a word of disaster with a death, or any accident at a steel plant; in West Bengal first, else India", A.every(([t, w]) => kindScope(t) === w), A.filter(([t, w]) => kindScope(t) !== w).map(([t]) => `${kindScope(t)} ${t.slice(0, 50)}`).join(" | "));
const NOT_A = [

  "মিশরে ব্যস্ত রাস্তায় তেলট্যাঙ্কার উল্টে গিয়ে আগুন! পুড়ল একের পর এক গাড়ি, মৃত্যু ৩১ জনের, আহত ২১",
  "11 killed as vehicle plunges into river in Pakistan-occupied Kashmir", "Bus crash in Kenya kills 20 (made up)", "Nasa asteroid crash site reached by European probe to assess deflection",
  "Kerala HC issues notice to minor driver in Cheranalloor car crash case in plea by victim’s family", "Woman shot dead, man injured in gunfight between suspected militants in Manipur", "Sensex crash: investors lose Rs 5 lakh crore (made up)",
  "Speeding SUV On Fire After 6-Vehicle Chain-Reaction Crash In Mumbai", "A bus overturned and two people were hurt near Asansol (made up)",
];
ok("not covered: an accident abroad (Egypt, Kenya, Pakistan-occupied Kashmir, space), a small one, a crime, a market 'crash'", NOT_A.every((t) => accidentOf(t) === null), NOT_A.filter((t) => accidentOf(t)).join(" | "));
ok("where: Bengal names (English, Hindi, Bengali) make West Bengal; a foreign name and no Indian one makes the world; Pakistan-occupied Kashmir is not India", scopeOf("Kolkata fire") === "wb" && scopeOf("कोलकाता में आग") === "wb" && scopeOf("কলকাতায় আগুন") === "wb" && scopeOf("Fire in Delhi") === "india" && scopeOf("Fire in London") === "world" && scopeOf("Strike in Gaza and Delhi") === "india" && scopeOf("Blast in Pakistan-occupied Kashmir") === "world" && scopeOf("Accident at the US embassy") === "world");
ok("the number of dead: digits, words, Hindi and Bengali digits and words, 'toll rises to 17', thousands with a comma", deadCount("3 killed as bus falls") === 3 && deadCount("Four, including three children, killed as fire guts 25 houses") === 4 && deadCount("बस हादसे में 5 की मौत") === 5 && deadCount("मृतकों की संख्या ७ हुई") === 7 && deadCount("৩ জনের মৃত্যু") === 3 && deadCount("তিন জনের মৃত্যু") === 3 && deadCount("toll rises to 17") === 17 && deadCount("Fire at plant: 25 houses razed") === 0 && deadCount("Two killed, 1,200 evacuated") === 2);

// ---- the same news in three scripts: names in sound
ok("a name is the same in the three scripts: Dharmendra, धर्मेंद्र, ধর্মেন্দ্র; Chatterjee, चटर्जी; Soumitra, सौमित्र, সৌমিত্র; Bokaro, बोकारो, বোকারো", new Set([skeleton("Dharmendra"), skeleton("धर्मेंद्र"), skeleton("ধর্মেন্দ্র")]).size === 1 && skeleton("Chatterjee") === skeleton("चटर्जी") && new Set([skeleton("Soumitra"), skeleton("सौमित्र"), skeleton("সৌমিত্র")]).size === 1 && new Set([skeleton("Bokaro"), skeleton("बोकारो"), skeleton("বোকারো")]).size === 1);
ok("names of a headline: the capitalised Latin words and every Hindi or Bengali word, as skeletons of three consonants or more; the words of every headline (days, 'dies', 'minister') are not names", nameKeys("Veteran actor Dharmendra dies in Mumbai on Monday").includes(skeleton("Dharmendra")) && !nameKeys("Veteran actor Dharmendra dies in Mumbai on Monday").includes(skeleton("Monday")) && !nameKeys("Veteran actor Dharmendra dies").includes(skeleton("Veteran")));

const T0 = DateTime.fromISO("2026-11-27T08:00:00Z");
const it = (lang: "en" | "hi" | "bn", title: string, hoursAgo: number, source = "P"): DeskItem => ({ title, link: `https://${lang}.example/${encodeURIComponent(title).slice(0, 30)}`, publishedAt: T0.minus({ hours: hoursAgo }).toISO()!, source, summary: "", lang, flag: priorityOf(title)! });
const en1 = it("en", "Veteran actor Dharmendra dies in Mumbai, PM condoles", 5, "The Hindu"), hi1 = it("hi", "दिग्गज अभिनेता धर्मेंद्र का निधन, पीएम मोदी ने जताया शोक", 6, "दैनिक भास्कर"), bn1 = it("bn", "প্রয়াত অভিনেতা ধর্মেন্দ্র, শোকপ্রকাশ প্রধানমন্ত্রীর", 7, "Anandabazar Patrika");
const other = it("en", "Former cricketer Bishan Soni passes away in Delhi", 3, "Hindustan Times");
const own = assignDesk([en1, hi1, bn1, other]);
ok("the death of an eminent person told by three papers in three languages is MAJOR: it stands in every one of the three tabs, each with its own language's report (the Bengali the earliest, 7 hours ago); another, lesser death stays in its one tab", own.bn.length === 1 && own.bn[0].title.startsWith("প্রয়াত অভিনেতা ধর্মেন্দ্র") && own.hi.length === 1 && own.hi[0].title.startsWith("दिग्गज अभिनेता धर्मेंद्र") && own.en.length === 2 && own.en.some((m) => m.title.includes("Dharmendra")) && own.en.some((m) => m.title.includes("Bishan Soni")), `${own.en.length}/${own.hi.length}/${own.bn.length}`);
const twoPapers = [it("en", "Veteran actor Dharmendra dies in Mumbai, PM condoles", 9, "The Hindu"), { ...hi1, source: "The Hindu" }];
ok("a death told by only two papers is not major: it stands ONCE, in the tab of the language that arrived first (English, 9 hours ago); the Hindi report of it is left out", (() => { const x = assignDesk(twoPapers); return x.en.length === 1 && x.hi.length === 0 && x.bn.length === 0 && !isMajor(twoPapers); })());
const bhEn = it("en", "Blast at Bokaro Steel Plant kills 4 workers", 4, "The Telegraph"), bhHi = it("hi", "बोकारो स्टील प्लांट में विस्फोट, 4 मजदूरों की मौत", 3, "दैनिक जागरण"), bhBn = it("bn", "বোকারো স্টিল প্লান্টে বিস্ফোরণ, মৃত ৪ শ্রমিক", 2, "Sangbad Pratidin");
ok("an accident told in three scripts is one story as well (the name of the place, and the same number of dead)", (() => { const x = assignDesk([bhEn, bhHi, bhBn]); return x.en.length === 1 && x.hi.length === 0 && x.bn.length === 0; })());
ok("two different deaths on one day are never made one, nor a death and an accident", (() => { const a = it("en", "Former cricketer Raj Mehta passes away in Mumbai", 4), b = it("hi", "दिग्गज गायिका लता सेन का निधन", 3), c = it("bn", "প্রয়াত সাহিত্যিক সুনীল বসু", 2); const x = assignDesk([a, b, c]); return x.en.length === 1 && x.hi.length === 1 && x.bn.length === 1; })() && !sameEvent(en1, bhEn, new Map()));
ok("the same death of two days apart is not the same story (36 hours)", !sameEvent(en1, { ...hi1, publishedAt: T0.minus({ hours: 80 }).toISO()! }, new Map(nameKeys(en1.title).map((k) => [k, 1]))));
ok("the block is in the order West Bengal, India, the world, the newest first inside a scope", (() => { const w = it("en", "Former minister dies in Kolkata", 9), i1 = it("en", "Veteran actor dies in Mumbai", 2), i2 = it("en", "Noted poet passes away in Delhi", 5), wd = it("en", "Hollywood legend dies in Los Angeles", 1), w2 = it("en", "Noted singer passes away in Siliguri", 4); const x = assignDesk([w, i1, i2, wd, w2]).en.map((m) => m.title); return x.join("|") === ["Noted singer passes away in Siliguri", "Former minister dies in Kolkata", "Veteran actor dies in Mumbai", "Noted poet passes away in Delhi", "Hollywood legend dies in Los Angeles"].join("|"); })());

// ---- the language tabs, from feeds in the real format
const rss = (rows: Array<[string, number]>) => `<rss><channel><title>x</title>${rows.map(([t, h], k) => `<item><title>${t}</title><link>https://news.example/${k}-${encodeURIComponent(t).slice(0, 24)}</link><pubDate>${T0.minus({ hours: h }).toRFC2822()}</pubDate></item>`).join("")}</channel></rss>`;
const feeds = (lang: "en" | "hi" | "bn", rows: Array<[string, number]>): Array<string | null> => NEWS_SOURCES[lang].map((_s, k) => (k === 0 ? rss(rows) : null));
const EN: Array<[string, number]> = [["Budget session of Parliament to begin on Monday", 1], ["Veteran actor Dharmendra dies in Mumbai, PM condoles", 5], ["Three killed as bus hits truck in Alwar", 3], ["Former minister Kalyan Roy passes away in Kolkata", 8], ["Tata Steel results beat estimates", 2], ["Metro services hit in Kolkata", 4]];
const HI: Array<[string, number]> = [["संसद का बजट सत्र सोमवार से", 1], ["दिग्गज अभिनेता धर्मेंद्र का निधन, पीएम मोदी ने जताया शोक", 6], ["बोकारो स्टील प्लांट में विस्फोट, 4 मजदूरों की मौत", 2], ["चुनाव आयोग की बैठक आज", 3]];
const BN: Array<[string, number]> = [["প্রয়াত অভিনেতা ধর্মেন্দ্র, শোকপ্রকাশ প্রধানমন্ত্রীর", 7], ["কলকাতায় মেট্রো বিভ্রাট", 4], ["বোকারো স্টিল প্লান্টে বিস্ফোরণ, মৃত ৪ শ্রমিক", 1]];
const by = { en: feeds("en", EN), hi: feeds("hi", HI), bn: feeds("bn", BN) };
const en = buildTab("en", by, T0), hi = buildTab("hi", by, T0), bn = buildTab("bn", by, T0);
const titles = (d: { items: Array<{ title: string }> }) => d.items.map((i) => i.title);
ok("the death of an eminent person told in three languages stands in all three tabs (it is major), each with its own report and flagged; the Bengali tab opens with it, in Bengali", bn.items[0].title.startsWith("প্রয়াত অভিনেতা") && bn.items[0].flag?.kind === "demise" && titles(en).some((t) => /Dharmendra/.test(t)) && titles(hi).some((t) => /धर्मेंद्र/.test(t)) && [en, hi, bn].every((d) => d.items.filter((i) => /Dharmendra|धर्मेंद्र|ধর্মেন্দ্র/.test(i.title)).length === 1));
ok("the English tab opens with West Bengal's death (Kalyan Roy, Kolkata), then India's accident (Alwar, 3 killed) and India's other death (Dharmendra, major), newest first in the scope; all flagged, then the ordinary list in time order", en.items[0].title.includes("Kalyan Roy") && en.items[0].flag?.scope === "wb" && en.items[1].title.includes("Alwar") && en.items[1].flag?.kind === "accident" && en.items[2].title.includes("Dharmendra") && en.items.slice(3).every((i) => !i.flag) && en.items.slice(3).every((i, k, a) => k === 0 || i.publishedAt <= a[k - 1].publishedAt));
ok("the steel plant's accident is told in Hindi and Bengali: it stands ONCE, in the language that had it first (Bengali, 1 hour ago... no: Hindi, 2 hours ago, arrived before it) and not in the other", (() => { const inHi = titles(hi).filter((t) => /बोकारो/.test(t)).length, inBn = titles(bn).filter((t) => /বোকারো/.test(t)).length; return inHi + inBn === 1 && inHi === 1; })());
ok("an ordinary headline of a tab that is not priority stays in its own tab's list", titles(en).includes("Budget session of Parliament to begin on Monday") && titles(hi).includes("संसद का बजट सत्र सोमवार से") && titles(bn).includes("কলকাতায় মেট্রো বিভ্রাট"));
ok("the priority block holds at most PRIORITY_CAP stories", PRIORITY_CAP === 8 && buildTab("en", { ...by, en: feeds("en", Array.from({ length: 12 }, (_, k) => [`Former minister of state number${k} Sharma${"abcdefghijkl"[k]} dies in Delhi`, k + 1] as [string, number])) }, T0).items.filter((i) => i.flag).length === 8);
let threw = false; try { buildTab("hi", { en: by.en, hi: [null, null, null, null, null], bn: by.bn }, T0); } catch { threw = true; }
ok("when none of a tab's own feeds answers it is an error, whatever the other languages carry", threw);

// ---- the business tab: a record of the market, gold, silver or the rupee
const R_YES = ["Sensex hits record high, Nifty above 27,000", "Rupee hits record low of 95 per dollar", "Gold prices hit all-time high of Rs 1.4 lakh per 10 grams", "Silver surges to record high", "Sensex crashes 1,200 points, biggest single-day fall since 2020", "Dow closes at record high", "Nifty Bank logs fresh all-time high"];
const R_NO = ["Nifty eyes fresh record high: what to watch Friday?", "Nifty All-Time High Still Within Reach! Market Expert Says Crude Oil Is The Key Trigger", "Angel One stock nears record high in weak market", "Gold price today: MCX gold rate jumps but still 31% down from record high", "S&P 500 Futures Liquidity Hits Record Low", "NSE Becomes World’s Third Largest Listed Exchange Operator As Shares Hit Record High", "Record High Stocks: Fresh Peaks Across Sectors", "India's record foodgrain production this year", "Bitcoin hits record high", "Virat Kohli hits record century in the Test"];
ok("a record of the market, gold, silver or the rupee that HAPPENED is found; a hope, a question, 'still below', a single company's stock, trading volume, futures and a cricket record are not", R_YES.every((t) => recordMove(t)?.kind === "record") && R_NO.every((t) => recordMove(t) === null), `${R_YES.filter((t) => !recordMove(t)).join(" | ")} || ${R_NO.filter((t) => recordMove(t)).join(" | ")}`);
const NOW_B = DateTime.fromISO("2026-11-13T08:00:00Z");
const g = (rows: Array<[string, string, string]>) => `<rss><channel><title>x</title>${rows.map(([title, paper, at]) => `<item><title>${title} - ${paper}</title><link>https://news.google.com/rss/articles/${encodeURIComponent(title).slice(0, 20)}${paper}</link><pubDate>${at}</pubDate></item>`).join("")}</channel></rss>`;
const etFeed = `<rss><channel><item><title>RBI keeps repo rate unchanged</title><link>https://economictimes.indiatimes.com/b</link><pubDate>Fri, 13 Nov 2026 06:30:00 GMT</pubDate></item><item><title>Rupee falls to record low of 96 per dollar as oil jumps</title><link>https://economictimes.indiatimes.com/r</link><pubDate>Fri, 13 Nov 2026 07:10:00 GMT</pubDate></item></channel></rss>`;
const rec = g([["Sensex hits record high, Nifty crosses 27,000", "Paper A", "Fri, 13 Nov 2026 06:00:00 GMT"], ["Sensex hits record high; Nifty crosses 27,000 for first time", "Paper B", "Fri, 13 Nov 2026 06:05:00 GMT"], ["Gold hits record high in a small paper's claim", "Paper C", "Fri, 13 Nov 2026 05:00:00 GMT"], ["Nifty eyes fresh record high: what to watch", "Paper D", "Fri, 13 Nov 2026 05:30:00 GMT"], ["Silver hits all-time high, up 4% in a day", "Paper E", "Mon, 09 Nov 2026 05:30:00 GMT"]]);
const recTexts = RECORD_SEARCHES.map((_s, j) => (j === 0 ? rec : null));
const biz = buildNews("biz", [etFeed, fx("rss-mint-companies.xml"), null, null, ...recTexts], NOW_B);
const flagged = biz.items.filter((i) => i.flag);
ok("the Business tab opens with the RECORDS (the rupee's from the Economic Times' own feed, the Sensex's carried by two papers), flagged, newest first; a paper's lone claim (gold), a guess (Nifty eyes), and a record of four days ago (silver) are left out", flagged.map((i) => i.flag!.kind).join() === "record,record" && flagged[0].title.startsWith("Rupee falls to record low") && flagged[1].title.startsWith("Sensex hits record high") && (flagged[1].also?.length ?? 0) >= 1 && !biz.items.some((i) => /Gold hits|Nifty eyes|Silver hits/.test(i.title)), flagged.map((i) => i.title).join(" | "));
ok("the records stand first and the papers' own stories follow, none of them repeated (the rupee's record is not also an ordinary story)", biz.items.slice(0, 2).every((i) => i.flag) && biz.items.slice(2).every((i) => !i.flag) && biz.items.filter((i) => /Rupee falls to record low/.test(i.title)).length === 1 && biz.items.some((i) => /RBI keeps repo rate/.test(i.title)));
ok("share-price news of every other kind stays on the Business tab", buildNews("biz", [`<rss><channel><item><title>Tata Steel shares fall 3% as brokerages cut target price</title><link>https://economictimes.indiatimes.com/s</link><pubDate>Fri, 13 Nov 2026 07:10:00 GMT</pubDate></item><item><title>Sensex, Nifty end lower; HDFC Bank share price slips</title><link>https://economictimes.indiatimes.com/t</link><pubDate>Fri, 13 Nov 2026 07:05:00 GMT</pubDate></item></channel></rss>`, null, null, null, ...recTexts.map(() => null)], NOW_B).items.length === 2);
ok("the Business tab's sources are the four papers, then the record searches (fixed addresses of Google News and Bing News)", SOURCES_OF("biz").slice(0, 4).every((s, k) => s === BUSINESS_SOURCES[k]) && SOURCES_OF("biz").length === 4 + RECORD_SEARCHES.length && RECORD_SEARCHES.every((s) => /^https:\/\/(news\.google\.com\/rss\/search|www\.bing\.com\/news\/search)\?/.test(s.url)));
ok("when no record search answers, the engines are named as not answering and the papers' own stories still show", (() => { const x = buildNews("biz", [etFeed, null, null, null, ...recTexts.map(() => null)], NOW_B); return x.failed.includes("Google News") && x.failed.includes("Bing News") && x.used.join() === "The Economic Times" && x.items.length === 2; })());
import { readFileSync } from "node:fs";
function fx(n: string) { return readFileSync(`src/lib/live/fixtures/${n}`, "utf8"); }


// ---- a diplomatic visit: the Prime Minister abroad, a foreign leader in India (the headlines are made up in the papers' manner, in the three languages; the last test runs the rule over a real morning's feeds)
const VISITS: Array<[string, "india" | "world"]> = [
  ["PM Modi leaves for Moscow on two-day visit", "world"], ["Modi, Putin hold talks at Kremlin, sign defence pact", "world"], ["PM Modi to attend G20 summit in Johannesburg", "world"], ["Modi arrives in Tokyo for annual summit with Japan PM", "world"],
  ["PM Modi leaves Delhi for Moscow", "world"], ["Modi to visit Saudi Arabia, Kuwait next week", "world"], ["PM Modi meets Australian PM Albanese on sidelines of summit", "world"],
  ["Putin to visit India next month for annual summit", "india"], ["Japan PM arrives in Delhi on state visit", "india"], ["French President Macron lands in Jaipur on India visit", "india"], ["Saudi crown prince on two-day visit to India", "india"],
  ["US Secretary of State to visit India this week", "india"], ["German Chancellor meets PM Modi in Delhi, India-Germany sign pacts", "india"], ["Sri Lankan President holds talks with PM Modi in New Delhi", "india"],
  ["प्रधानमंत्री मोदी रूस दौरे पर रवाना, पुतिन से करेंगे मुलाकात", "world"], ["पीएम मोदी जापान पहुंचे, शिखर सम्मेलन में लेंगे हिस्सा", "world"], ["रूसी राष्ट्रपति पुतिन भारत दौरे पर, दिल्ली पहुंचे", "india"], ["जर्मन चांसलर का भारत दौरा, मोदी से मुलाकात", "india"],
  ["মোদির রাশিয়া সফর, পুতিনের সঙ্গে বৈঠক", "world"], ["প্রধানমন্ত্রী মোদি জাপান সফরে রওনা", "world"], ["রুশ প্রেসিডেন্ট পুতিনের ভারত সফর, দিল্লি পৌঁছলেন", "india"], ["জাপানের প্রধানমন্ত্রী ভারত সফরে, মোদির সঙ্গে বৈঠক", "india"],
];
ok("a diplomatic visit is told in the three languages: the Prime Minister abroad (scope world), a foreign leader or delegation in India (scope india)", VISITS.every(([t, sc]) => { const f = visitOf(t); return !!f && f.kind === "visit" && f.scope === sc && kindScope(t) === `visit:${sc}`; }), JSON.stringify(VISITS.filter(([t, sc]) => visitOf(t)?.scope !== sc).map((x) => x[0])));
const NOT_VISITS = [
  "PM Modi addresses rally in Bihar, slams Pakistan", "PM Modi visits Kargil, meets jawans on Diwali", "PM Modi inaugurates temple in Ayodhya", "Nirav Modi extradition: UK court hearing in London", "President Murmu visits India Gate to pay tribute", "President Murmu to visit Delhi University convocation",
  "PM Modi meets Australia cricket team after World Cup win", "Modi government to introduce bill in Parliament", "Trump visits Japan, meets emperor", "Putin visits China for summit with Xi", "UK PM to visit Germany next week", "Chancellor of Oxford visits India Today studio",
  "German Chancellor dials PM Modi, holds talks on trade, defence", "PM Modi speaks to Trump over phone", "PM Modi holds video call with Japan PM", "Messi to visit India for concert", "PM Modi meets students in Delhi", "PM Modi talks tough on Pakistan", "PM Modi leaves party meeting early", "Modi leaves for Varanasi, to address rally",
  "मोदी सरकार ने पेश किया बजट", "पीएम मोदी ने बिहार में रैली को किया संबोधित, पाकिस्तान पर बोला हमला", "पीएम मोदी ने ट्रंप से फोन पर की बात", "মোদির জনসভায় ভিড়, বিজেপির প্রচার", "প্রধানমন্ত্রী মোদি বিহারে নির্বাচনী সভায়",
];
ok("what is not a diplomatic visit stays ordinary: a domestic rally, border post or temple, a phone or video call, a foreign visit that does not involve India's Prime Minister or India, a cricket team, Nirav Modi, India Gate, a domestic visitor", NOT_VISITS.every((t) => visitOf(t) === null), JSON.stringify(NOT_VISITS.filter((t) => visitOf(t) !== null)));
ok("a death or an accident is still itself even when a visit is named (a demise comes first), and a visit does not take a death's place", kindScope("Veteran actor dies in Mumbai, PM Modi condoles") === "demise:india" && kindScope("Putin to visit India next month") === "visit:india");
// one visit, told in three languages, stands in one tab only: the language it arrived in first
const vEn = it("en", "Putin to visit India next month for annual summit, talks with PM Modi", 5, "The Hindu"), vHi = it("hi", "पुतिन भारत दौरे पर आएंगे अगले महीने, मोदी से करेंगे वार्ता", 4, "दैनिक भास्कर"), vBn = it("bn", "পুতিনের ভারত সফর আগামী মাসে, মোদির সঙ্গে বৈঠক", 3, "Anandabazar Patrika");
const visitDesk = assignDesk([vEn, vHi, vBn].map((x) => ({ ...x, flag: priorityOf(x.title)! })));
ok("one visit told in English, Hindi and Bengali is shown once: in the English tab, where it arrived first", visitDesk.en.length === 1 && visitDesk.hi.length === 0 && visitDesk.bn.length === 0 && visitDesk.en[0].flag.kind === "visit", JSON.stringify([visitDesk.en.length, visitDesk.hi.length, visitDesk.bn.length]));
ok("two different visits are two stories", (() => { const a = { ...it("en", "Putin to visit India next month", 3), flag: priorityOf("Putin to visit India next month")! }, b = { ...it("hi", "जापानी प्रधानमंत्री भारत दौरे पर, दिल्ली पहुंचे", 2), flag: priorityOf("जापानी प्रधानमंत्री भारत दौरे पर, दिल्ली पहुंचे")! }; const x = assignDesk([a, b]); return x.en.length === 1 && x.hi.length === 1; })());


// ---- a massacre: anywhere in the world, with a large toll
const MASSACRES: Array<[string, "wb" | "india" | "world"]> = [
  ["Gunmen open fire at market in Peshawar, 32 killed", "world"], ["Suicide bombing at mosque in Kabul kills 41", "world"], ["Terror attack in Pahalgam: 26 tourists killed", "india"], ["Air strike on hospital in Gaza kills 55, officials say", "world"],
  ["Mass shooting at school in Texas leaves 19 dead", "world"], ["Militants kill 15 villagers in Manipur attack", "india"], ["Communal violence in Murshidabad: 12 killed", "wb"],
  ["पेशावर में बाजार पर गोलीबारी, 32 की मौत", "world"], ["गाजा में हवाई हमला, 55 लोगों की मौत", "world"], ["काबुल की मस्जिद में आत्मघाती हमला, 41 मरे", "world"],
  ["পেশোয়ারে বাজারে গুলিবর্ষণ, মৃত ৩২", "world"], ["গাজায় বিমান হামলায় নিহত ৫৫", "world"], ["মুর্শিদাবাদে দাঙ্গায় নিহত ১২", "wb"],
];
ok("a mass killing with a large toll (10 or more dead) is a MASSACRE, wherever in the world, in the three languages; its scope is where it happened", MASSACRES.every(([t, sc]) => { const f = massacreOf(t); return !!f && f.kind === "massacre" && f.scope === sc && priorityOf(t)?.kind === "massacre"; }), JSON.stringify(MASSACRES.filter(([t, sc]) => massacreOf(t)?.scope !== sc).map((x) => x[0])));
const NOT_MASSACRES = ["Gunman kills 3 in robbery in Delhi", "Air strike kills 6 militants, army says", "Film about the massacre of 1984 released, 12 awards", "Bus falls into gorge, 14 killed", "Shooting game sells 20 million copies", "Cricket: India beat Australia by 10 wickets, the attack was lethal", "Riots film trailer out", "5 killed in clashes at border"];
ok("what is not a mass killing is not a massacre: fewer than ten dead, a film or a game, an accident (which stays an accident)", NOT_MASSACRES.every((t) => massacreOf(t) === null), JSON.stringify(NOT_MASSACRES.filter((t) => massacreOf(t) !== null)) + " " + kindScope("Bus falls into gorge, 14 killed"));
ok("an accident is still an accident and a massacre a massacre (a bomb blast attack is not an accident)", kindScope("Bus falls into gorge, 14 killed") === "accident:india" && kindScope("Terror attack in Pahalgam: 26 tourists killed") === "massacre:india");

// ---- major news: the death of an eminent person, a huge loss of life: in every tab that carried it
const mk = (lang: "en" | "hi" | "bn", title: string, h: number, source: string) => it(lang, title, h, source);
const hugeEn = mk("en", "Gunmen open fire at market in Peshawar, 32 killed", 5, "BBC News India"), hugeHi = mk("hi", "पेशावर में बाजार पर गोलीबारी, 32 की मौत", 4, "दैनिक जागरण");
const smallEn = mk("en", "Gunmen open fire at market in Peshawar, 12 killed", 5, "BBC News India"), smallHi = mk("hi", "पेशावर में बाजार पर गोलीबारी, 12 की मौत", 4, "दैनिक जागरण");
ok("a huge massacre (25 or more dead) told in two languages by two papers stands in BOTH tabs (major by its toll); a smaller one (12 dead) stands once, where it arrived first", (() => { const a = assignDesk([hugeEn, hugeHi]), b = assignDesk([smallEn, smallHi]); return isMajor([hugeEn, hugeHi]) && a.en.length === 1 && a.hi.length === 1 && !isMajor([smallEn, smallHi]) && b.en.length === 1 && b.hi.length === 0; })());
const exEn = mk("en", "Former Prime Minister passes away at 92, nation mourns", 6, "The Hindu"), exHi = mk("hi", "पूर्व प्रधानमंत्री का निधन, देश में शोक", 5, "दैनिक भास्कर"), exBn = mk("bn", "প্রাক্তন প্রধানমন্ত্রী প্রয়াত, শোকের ছায়া", 4, "Sangbad Pratidin");
ok("the death of a former Prime Minister is major whatever the number of papers: in every tab that carried it; a PM who only CONDOLES (the actor's death) does not make a death major", (() => { const x = assignDesk([exEn, exHi]); return isMajor([exEn, exHi]) && x.en.length === 1 && x.hi.length === 1 && x.bn.length === 0 && assignDesk([exEn, exHi, exBn]).bn.length === 1 && !isMajor([en1, { ...hi1, source: "The Hindu" }]); })());
ok("a story carried by six or more papers in two or more languages is major, whatever its kind (a visit that every paper tells)", (() => { const a = { ...vEn, also: ["NDTV", "TOI", "HT", "IE", "BBC"] }; const b = vHi; return isMajor([a, b]) && !isMajor([vEn, vHi]); })());
ok("a major story shows in a language only once even when that language has several reports of it (its earliest, naming the other papers)", (() => { const a2 = { ...mk("en", "Gunmen open fire at market in Peshawar, 32 killed", 3, "NDTV"), }; const x = assignDesk([hugeEn, a2, hugeHi]); return x.en.length === 1 && x.hi.length === 1 && (x.en[0].also ?? []).includes("NDTV"); })());

// ---- the breaking-news watch: a new priority headline breaks the 30-minute rule
{
  const w = new BreakingWatch();
  ok("the watch looks every three minutes, not oftener", w.due(1_000_000) && !w.due(1_000_000 + 60_000) && !w.due(1_000_000 + WATCH_EVERY_MS - 1) && w.due(1_000_000 + WATCH_EVERY_MS));
  const quiet = ["Budget session of Parliament to begin on Monday", "Tata Steel results beat estimates"];
  ok("the first look only learns what is there (nothing is 'new' at the start), even when priority headlines are among them", new BreakingWatch().look([...quiet, "Veteran actor dies in Mumbai"]).length === 0);
  const w2 = new BreakingWatch(); w2.look([...quiet, "Veteran actor dies in Mumbai"]);
  ok("after that, a new death, massacre, accident or visit is reported as new once; an ordinary headline, or one already seen, is not", w2.look([...quiet, "Veteran actor dies in Mumbai", "Gunmen open fire at market in Peshawar, 32 killed", "Putin to visit India next month", "Weather today: clear skies"]).length === 2 && w2.look(["Gunmen open fire at market in Peshawar, 32 killed", "Noted poet passes away in Delhi"]).join("|") === "Noted poet passes away in Delhi" && w2.look(quiet).length === 0);
}

console.log(`priority selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/dsphistory/DspHistoryCard.selftest.tsx
// The DSP story card as it is drawn on each tab, and the words that open it (and the ones that must not).
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { DspHistoryCard } from "./DspHistoryCard";
import { readLang } from "./ui";
import { detectTool } from "../../lib/tools/detect";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const h = (el: React.ReactElement) => renderToStaticMarkup(el);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const text = (s: string) => s.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&ldquo;|&rdquo;/g, '"').replace(/\s+/g, " ");

// ---- tab 1: the story
const story = h(<DspHistoryCard />);
const st = text(story);
ok("the card opens on the story tab with five tabs: The story, Who made it, First products, Heads of DSP, SAIL & units", count(story, /role="tab"/g) === 5 && /role="tab"[^>]*aria-selected="true"[^>]*>[\s\S]*?The story/.test(story) && />Who made it</.test(story) && />First products</.test(story) && />Heads of DSP</.test(story) && />SAIL &amp; units</.test(story));
ok("the five key dates are drawn (October 1956, January 1957, December 26, 1959, April 24, 1960, January 24, 1973) and the eight facts, each with its source", count(story, /data-key-dates/g) === 1 && ["October 1956", "January 1957", "December 26, 1959", "April 24, 1960", "January 24, 1973"].every((d) => st.includes(d)) && count(story, /data-facts/g) === 1 && /Technology came from/.test(st) && /Britain/.test(st));
ok("the timeline has all 21 entries, each dated and sourced; eleven have SAIL's photograph", count(story, /data-event="/g) === 21 && count(story, /data-timeline/g) === 1 && count(story, /<figure[^>]*data-photo="/g) === 11 && count(story, /data-sources/g) >= 21);
ok("the Queen's visit, Nehru at the Section Mill and the Wheel Plant, Dr Roy at the Merchant Mill and the President at the blast furnace are in it with their dates", ["Queen Elizabeth II visits", "Pandit Nehru commissions the Section Mill", "Pandit Nehru inaugurates the Wheel Plant", "Dr B C Roy commissions the Merchant Mill", "President Rajendra Prasad inaugurates Blast Furnace No. 1"].every((t) => st.includes(t)) && ["February 18, 1961", "January 24, 1962", "January 19, 1962", "December 26, 1959"].every((d) => st.includes(d)));
ok("where the sources differ the card says so (a note on the Coates mission, the blast furnace, the Merchant Mill, Shastri's title) and the picture filter button is there", count(story, /data-differ/g) === 4 && /The sources differ/.test(st) && /December 29, 1959/.test(st) && /data-pictures-only/.test(story));

// ---- tab 2: who made it
const makers = h(<DspHistoryCard initialTab="makers" />);
const mt = text(makers);
ok("seven parts: the idea, Britain, Dr Roy, Nehru, the Queen, the President, the site", count(makers, /data-maker="/g) === 7 && ["How the idea began", "Technology from Britain", "Dr Bidhan Chandra Roy", "Pandit Jawaharlal Nehru", "Queen Elizabeth II, February 1961", "President Rajendra Prasad, December 26, 1959", "The site and the city"].every((t) => mt.includes(t)));
ok("the Queen's night at 'Rani Kuthi' (Suite No. 1), the helicopter from Panagarh, Swaran Singh, and that the exact day is not in the sources", /Rani Kuthi/.test(mt) && /Suite No\. 1/.test(mt) && /Panagarh/.test(mt) && /Swaran Singh/.test(mt) && /the exact day is not in the sources/.test(mt));
ok("Dr Roy's and Nehru's pictures are shown (Merchant Mill 1962; Section Mill 1961 and Wheel Plant 1962) and the Queen's two (with Mr Niyogi; at the Durgapur Club)", ["royMerchant", "nehruSection", "nehruWheel", "queenNiyogi", "queenClub", "coates", "bf1", "panorama"].every((id) => makers.includes(`data-photo="${id}"`)));
ok("Britain's part: Sir Eric Coates, ISCON of 13 companies, the contract of October 1956; the Niyogi of the site and the General Manager are kept apart", /Sir Eric Coates/.test(mt) && /ISCON/.test(mt) && /October 1956/.test(mt) && /does not say they are the same person/.test(mt));

// ---- tab 3: first products
const first = h(<DspHistoryCard initialTab="first" />);
const ft = text(first);
ok("six first products from pig iron to the early mix of bars and sections, each with its date and source, and the Merchant Mill's 1961-or-1962 difference is shown", count(first, /data-first-item/g) === 6 && /Pig iron/.test(ft) && /Steel, in ingots/.test(ft) && /Structurals/.test(ft) && /Railway wheels and axles/.test(ft) && /The manual says 1961/.test(ft));
ok("what nobody wrote down is said: DSP's own tonnes for 1959-62 are in no source; Hindustan Steel's 0.158 MT and 1.6 MT are given as all the plants together", /data-first-unknown/.test(first) && /not in any source/.test(ft) && /0\.158 MT/.test(ft));

// ---- tab 4: the heads
const heads = h(<DspHistoryCard initialTab="heads" />);
const hd = text(heads);
ok("five eras with their titles and the eighteen heads in order, from K K Sen to Surajit Mishra", count(heads, /data-era="/g) === 5 && count(heads, /<article[^>]*data-head="/g) === 18 && ["General Manager", "Director-in-Charge", "Managing Director", "Chief Executive Officer", "Director In-charge"].every((t) => hd.includes(t)) && hd.indexOf("K K Sen") < hd.indexOf("Major General B P Wadhera") && hd.indexOf("Major General B P Wadhera") < hd.indexOf("Surajit Mishra"));
ok("five of them have a picture from SAIL (Sen, Niyogi, Bell, Wadhera, Mishra) and thirteen show initials", count(heads, /data-head-photo="/g) === 5 && count(heads, /data-head-initials/g) === 13);
ok("each head says on what its entry rests: SAIL record, SAIL report, Annual report, Press report or Memoir (four from the memoir), and the note says how the memoir is used", count(heads, /data-basis/g) === 18 && count(heads, /Memoir<\/span>/g) === 4 && /data-heads-basis/.test(heads) && /a memoir by a former Hindustan Steel and SAIL officer/.test(hd));
ok("the gaps are drawn as gaps (four) and none is filled with a name", count(heads, /data-head-gap/g) === 4 && /no further names were found/.test(hd) && /November 2009 and P K Singh's in May 2012/.test(hd));
ok("the dated heads: P K Bajaj from November 1, 2009, P K Singh May 2012 to December 2015, A K Rath March 2016, B P Singh April 19, 2022, Surajit Mishra July 15, 2025", ["from November 1, 2009", "May 2012 to December 2015", "from March 2016", "April 19, 2022 to January 2025", "from July 15, 2025"].every((t) => hd.includes(t)));

// ---- tab 5: SAIL and its units
const sail = h(<DspHistoryCard initialTab="sail" />);
const sl = text(sail);
ok("the foundation of SAIL (Hindustan Steel January 19, 1954; SAIL January 24, 1973) and nine units, Durgapur marked 'this plant'", /data-sail-story/.test(sail) && sl.includes("January 19, 1954") && sl.includes("January 24, 1973") && count(sail, /<article[^>]*data-unit="/g) === 9 && count(sail, /this plant/g) === 1);
ok("the country each plant came from: Britain (DSP), Germany (RSP), the USSR (BSP and BSL)", count(sail, /data-partner/g) >= 4 && /Britain/.test(sl) && /Germany/.test(sl) && (sl.match(/USSR/g) ?? []).length >= 2);
ok("SAIL's other bodies are listed with their manual pages", /data-other-bodies/.test(sail) && /Management Training Institute/.test(sl) && /second largest mining outfit/.test(sl) && /62,000/.test(sl));

// ---- every picture shown is a real file; the look; the units
const all = [story, makers, first, heads, sail];
const srcs = [...new Set(all.flatMap((x) => [...x.matchAll(/src="(\/dsp-history\/[^"]+)"/g)].map((m) => m[1])))];
ok("every picture on the card is a file that exists (the paths are /dsp-history/...)", srcs.length >= 12 && srcs.every((p) => existsSync(`public${p}`)), srcs.join());
ok("every picture has alt text and says whose photograph it is (SAIL)", all.every((x) => [...x.matchAll(/<img[^>]*>/g)].every((m) => /alt="[^"]{15,}"/.test(m[0]))) && all.some((x) => /Photograph: SAIL/.test(x)));
ok("no tab has a question-mark badge or Bengali letters, no 'lakh', no 'Mt'", all.every((x) => !/>\?</.test(x) && !/[ঀ-৿]/.test(x)) && all.every((x) => !/lakh/i.test(text(x)) && !/\bMt\b/.test(text(x))));
ok("the card uses only the text sizes that have a rule in the search window's stylesheet (xs to 4xl and 9, 10, 11, 13, 15, 17, 28 px) and no fixed leading", all.every((x) => !/text-\[(?!9px|10px|11px|13px|15px|17px|28px)\d/.test(x)) && !/leading-\[/.test(readFileSync("src/tools/dsphistory/DspHistoryCard.tsx", "utf8")));
ok("the card has colour (gradients on the key dates, the eras and the units): it is not black and white", count(story, /bg-gradient-to-/g) > 8 && count(heads, /bg-gradient-to-/g) >= 5 && count(sail, /bg-gradient-to-/g) >= 9);

// ---- the words
const said = (q: string) => { const t = detectTool(q) as (Record<string, unknown> & { kind: string }) | null; return t && t.kind === "live" ? `${t.topic}:${t.lang ?? ""}` : t ? t.kind : "nothing"; };
ok("'dsp history', 'history of dsp', 'durgapur steel plant history', 'dsp story' open the story tab", ["dsp history", "history of dsp", "durgapur steel plant history", "history of durgapur steel plant", "dsp story"].every((q) => said(q) === "dsphistory:story|"), ["dsp history", "history of dsp", "dsp story"].map(said).join());
ok("'heads of dsp', 'dsp heads', 'former heads of dsp', 'dsp chief executives', 'dsp general managers', 'heads of durgapur steel plant' open the heads tab", ["heads of dsp", "dsp heads", "former heads of dsp", "past heads of dsp", "dsp chief executives", "dsp general managers", "dsp managing directors", "heads of durgapur steel plant"].every((q) => said(q) === "dsphistory:heads|"), ["heads of dsp", "dsp heads", "dsp chief executives"].map(said).join());
ok("'queen elizabeth durgapur', 'nehru durgapur', 'bc roy durgapur', 'who built dsp', 'dsp foundation' open the who-made-it tab; 'dsp first products' the first-products tab", ["queen elizabeth durgapur", "queen durgapur", "nehru durgapur", "bc roy durgapur", "bidhan chandra roy durgapur", "who built dsp", "dsp foundation", "dsp founded"].every((q) => said(q) === "dsphistory:makers|") && said("dsp first products") === "dsphistory:first|", ["queen elizabeth durgapur", "who built dsp", "dsp first products"].map(said).join());
ok("'sail history', 'history of sail', 'sail foundation', 'foundation of sail', 'sail units' open the SAIL tab", ["sail history", "history of sail", "sail foundation", "foundation of sail", "sail units"].every((q) => said(q) === "dsphistory:sail|"), ["sail history", "sail units"].map(said).join());
ok("other lines are not this card: 'dsp', 'history', 'queen', 'nehru', 'who is the head of dsp', 'head of dsp', 'dsp ceo', 'durgapur pin code', 'steel prices', 'sail steel', 'dsp products'", ["dsp", "history", "queen", "nehru", "who is the head of dsp", "head of dsp", "dsp ceo", "durgapur pin code", "steel prices", "sail steel", "dsp products", "durgapur steel"].every((q) => !said(q).startsWith("dsphistory:")), ["dsp", "history", "who is the head of dsp", "dsp ceo"].map(said).join());
ok("readLang reads the tab and falls back to the story", readLang("heads|") === "heads" && readLang("makers|") === "makers" && readLang("first|") === "first" && readLang("sail|") === "sail" && readLang(undefined) === "story" && readLang("nonsense|") === "story");

console.log(`DspHistoryCard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

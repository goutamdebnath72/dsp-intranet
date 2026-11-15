// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/pincode/PincodeCard.selftest.tsx
// The Durgapur areas card as it is drawn on each tab, and the words that open it (and the names that must not).
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PincodeCard } from "./PincodeCard";
import { readLang } from "./ui";
import { detectTool } from "../../lib/tools/detect";
import { SEATS, pinStyle } from "./pincode";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const h = (el: React.ReactElement) => renderToStaticMarkup(el);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

// ---- tab 1: PIN codes
const pins = h(<PincodeCard />);
ok("the card opens on the PIN codes, with three tabs", /role="tab"[^>]*aria-selected="true"[^>]*>[\s\S]*?PIN codes/.test(pins) && />DMC wards</.test(pins) && />Assembly seats</.test(pins));
ok("the Steel Plant lens is at the top: the plant's own PIN 713203 and the source of it", /data-dsp-lens/.test(pins) && /data-dsp-pin[^>]*>713203</.test(pins) && /environmentclearance\.nic\.in/.test(pins) && /Through the lens of the Steel Plant/.test(pins));
ok("all 19 PIN codes of the city are drawn (713201 to 713219), then the two Kanksa codes", count(pins, /data-pin-card="7132\d\d"/g) === 19 && count(pins, /data-pin-card="713148"/g) === 1 && count(pins, /data-pin-card="713169"/g) === 1);
ok("exactly three cards carry the DSP mark (713203, 713204, 713205) and the others do not", count(pins, /data-dsp="true"/g) === 3 && /data-pin-card="713203"[^>]*data-dsp="true"/.test(pins) && /data-pin-card="713204"[^>]*data-dsp="true"/.test(pins) && /data-pin-card="713205"[^>]*data-dsp="true"/.test(pins) && /data-pin-card="713201"[^>]*data-dsp="false"/.test(pins));
ok("each PIN card has its own colour (the rail and the dot), the same colour the chips of other tabs use", pinStyle("713203").dot !== pinStyle("713204").dot && pins.includes(pinStyle("713203").rail) && pins.includes(pinStyle("713203").dot));
ok("the post offices are listed with their kind (HO, SO, BO), the head office Durgapur is there, and Durgapur RS says 'no delivery'", />Durgapur<\/span><span[^>]*title="Head office"[^>]*>HO</.test(pins) && />Durgapur Steel Project</.test(pins) && /no delivery/.test(pins));
ok("a PIN card names the wards that use it, as buttons (ward 29 for 713211)", /data-pin-card="713211"[\s\S]*?data-ward-chip="29"/.test(pins) && /Wards that use this PIN/.test(pins));
ok("there is a search box, and a line that says how many PIN codes there are", /aria-label="Find a PIN code or a post office"|Find a PIN code or a post office/.test(pins) && /19 PIN codes, 713201 to 713219/.test(pins));
ok("the sources, the date and the 'may be re-drawn' note are at the foot", /data-sources/.test(pins) && /India Post/.test(pins) && /draft electoral roll 2026/.test(pins) && /Prepared 2026-11-15/.test(pins) && /43 to 53/.test(pins));
ok("the PIN tab opened with a PIN searched shows only that PIN", count(h(<PincodeCard initialQuery="713203" />), /data-pin-card="/g) === 1);

// ---- tab 2: wards
const wards = h(<PincodeCard initialTab="wards" />);
ok("the wards tab draws all 43 wards, each with its seat, in the order 1 to 43", count(wards, /data-ward-card="\d+"/g) === 43 && /data-ward-card="1"/.test(wards) && /data-ward-card="43"/.test(wards) && count(wards, /data-seat="purba"/g) >= 16 && count(wards, /data-seat="paschim"/g) >= 27);
ok("a collapsed ward shows a preview of its areas and a button with the number of areas", /and \d+ more/.test(wards) && /aria-expanded="false"/.test(wards) && !/data-area/.test(wards));
const w22 = h(<PincodeCard initialTab="wards" initialQuery="ward 22" />);
ok("opened on 'ward 22': one ward, already open, its areas grouped under the PINs 713216, 713209 and 713205 with the English names", count(w22, /data-ward-card="/g) === 1 && /data-ward-card="22"/.test(w22) && /aria-expanded="true"/.test(w22) && count(w22, /data-area/g) > 20 && /aria-label="Areas with PIN 713216"/.test(w22) && /aria-label="Areas with PIN 713209"/.test(w22) && /aria-label="Areas with PIN 713205"/.test(w22) && !/lang="bn"/.test(w22));
const sag = h(<PincodeCard initialTab="wards" initialQuery="sagarbhanga" />);
ok("searching an area opens the wards that have it, with only the matching areas, and says 'found'", count(sag, /data-ward-card="/g) >= 2 && /areas? found/.test(sag) && /data-ward-card="29"/.test(sag));
const none = h(<PincodeCard initialTab="wards" initialQuery="zzzzqq" />);
ok("a search with no result says so, in words", /No ward or area matches that/.test(none) && !/data-ward-card/.test(none));
ok("the seat filter is a tab list with the seat colours, and the English-is-a-transliteration note is shown", /aria-label="Show the wards of"/.test(wards) && wards.includes(SEATS.purba.color) && /written out from the Election Commission/.test(wards) && !/lang="bn"/.test(wards));

// ---- tab 3: seats
const seats = h(<PincodeCard initialTab="seats" />);
ok("the seats tab has the two seats, with their numbers 276 and 277 and their names in English only", /data-seat-panel="purba"/.test(seats) && /data-seat-panel="paschim"/.test(seats) && /No\. 276/.test(seats) && /No\. 277/.test(seats) && /Durgapur Purba/.test(seats) && /Durgapur Paschim/.test(seats) && !/lang="bn"/.test(seats) && !/দুর্গাপুর/.test(seats));
ok("each seat shows its wards as buttons: 16 for Purba (1-10, 23-28) and 27 for Paschim (11-22, 29-43), with the ranges written out", count(seats, /data-ward-chip="\d+"/g) === 43 && /Wards 1–10, 23–28/.test(seats) && /Wards 11–22, 29–43/.test(seats));
ok("the three gram panchayats of Kanksa are under Durgapur Purba only", /data-panchayat="amlajora"/.test(seats) && /data-panchayat="gopalpur"/.test(seats) && /data-panchayat="molandighi"/.test(seats) && count(seats, /data-panchayat=/g) === 3 && /Amlajora/.test(seats) && !/আমলাজোড়া/.test(seats));
ok("the Lok Sabha seat is named: No. 39 Bardhaman-Durgapur", /No\. 39 Bardhaman-Durgapur/.test(seats));
ok("the numbers of each seat's panel are drawn: wards, polling areas, PIN codes (Paschim 27 wards, 306 polling areas)", /data-seat-panel="paschim"[\s\S]*?>27<[\s\S]*?>306</.test(seats));

// ---- the words that open it
const said = (q: string) => { const t = detectTool(q) as (Record<string, unknown> & { kind: string }) | null; return t && t.kind === "live" ? `${t.topic}:${t.lang ?? ""}` : t ? t.kind : "nothing"; };
ok("'pin code', 'durgapur pin code', 'pincode', 'post office' open the PIN tab", ["pin code", "durgapur pin code", "pincode", "post office", "pin"].every((q) => said(q) === "pincode:pins|"), ["pin code", "durgapur pin code", "pincode", "post office"].map(said).join());
ok("'pin 713203' opens the PIN tab with that PIN; a ward number from 1 to 43 opens that ward ('ward 1', 'ward 43')", said("pin 713203") === "pincode:pins|713203" && said("ward 22") === "pincode:wards|ward 22" && said("ward 1") === "pincode:wards|ward 1" && said("ward 43") === "pincode:wards|ward 43");
ok("'dmc wards', 'wards', 'ward' open the wards tab; the seats' words open the seats tab", ["dmc wards", "wards", "ward", "dmc"].every((q) => said(q).startsWith("pincode:wards|")) && ["durgapur purba", "durgapur paschim", "vidhan sabha", "legislative seats", "assembly seats", "assembly seat", "durgapur assembly seats", "constituency", "assembly constituency"].every((q) => said(q) === "pincode:seats|"));
ok("a person's name is never taken for the card: 'purba', 'purba mitra', 'paschim' and 'durgapur' alone are not it", ["purba", "purba mitra", "paschim", "durgapur", "ward boy", "sagar pin"].every((q) => !said(q).startsWith("pincode")), ["purba", "purba mitra", "paschim", "durgapur", "ward boy"].map(said).join());
ok("an ordinary sentence is not taken for it, nor a ward number out of range", ["assembly election duty circular", "ward 44", "pin the circular on the board", "how many wards are in the hospital"].every((q) => !said(q).startsWith("pincode")), ["ward 44", "pin the circular on the board"].map(said).join());
ok("readLang reads 'tab|search' and falls back to the PIN tab", JSON.stringify(readLang("wards|ward 22")) === JSON.stringify({ tab: "wards", query: "ward 22" }) && readLang("seats|").tab === "seats" && readLang(undefined).tab === "pins" && readLang("nonsense").tab === "pins");

// ---- the rules of the code
const code = ["PincodeCard.tsx", "pincode.ts", "topic.ts", "ui.tsx"].map((f) => readFileSync(`src/tools/pincode/${f}`, "utf8")).join("\n");
ok("no 'new Date(' (dates go through Luxon) and no fetch (the data is a file)", !/new Date\(/.test(code) && !/\bfetch\(/.test(code));
ok("the card uses only the text sizes that have a rule in the search window's stylesheet (xs to 4xl and 9, 10, 11, 13, 15, 17, 28 px) and no fixed leading", !/text-\[(?!9px|10px|11px|13px|15px|17px|28px)[0-9.]+(?:px|rem)\]/.test(code) && !/\bleading-(?:[0-9]+|\[)/.test(code));

// ---- "Bengal Ambuja" is "Ambuja"
const amb = h(<PincodeCard initialTab="wards" initialQuery="bengal ambuja" />);
ok("a search for 'Bengal Ambuja' in the wards tab finds the Ambuja areas and writes 'also Bengal Ambuja' right after the word Ambuja, in a badge", count(amb, /data-area/g) >= 1 && count(amb, /data-alias/g) === count(amb, /data-area/g) && /Ambuja(?:<!-- -->)? <span[^>]*data-alias[^>]*>also Bengal Ambuja<\/span>(?:<!-- -->)? Residential Complex/.test(amb), String(count(amb, /data-area/g)));

// ---- one cross in the search box, and no question marks
const typed = h(<PincodeCard initialTab="wards" initialQuery="ward 18" />), empty = h(<PincodeCard initialTab="wards" />);
ok("a search with text has our one clear button (red on hover and focus), the browser's own cross is switched off, and an empty search has none", count(typed, /aria-label="Clear the search"/g) === 1 && /hover:text-rose-600/.test(typed) && /focus-visible:ring-2/.test(typed) && /search-cancel-button\]:appearance-none/.test(typed) && count(empty, /aria-label="Clear the search"/g) === 0);
ok("no area carries a question mark, in any tab", ![h(<PincodeCard />), empty, typed, h(<PincodeCard initialTab="seats" />)].some((x) => />\?</.test(x) || /to be confirmed/.test(x)));

// ---- a PIN on a ward or panchayat card jumps to its group in the long list
const noNested = (x: string) => !/<button(?:(?!<\/button>)[\s\S])*<button/.test(x);
ok("the PINs on a ward card are buttons that jump to the PIN's group (every group is marked data-pin-group), and the card has no button inside a button", count(w22, /<button[^>]*data-pin="\d{6}"[^>]*title="Jump to the areas with PIN \d{6}"/g) === 3 && count(w22, /data-pin-group="\d{6}"/g) === 3 && noNested(w22));
ok("the PINs on the three gram panchayat cards (4 + 2 + 1) are buttons that jump, and no button sits inside another", count(seats, /<button[^>]*data-pin="\d{6}"[^>]*title="Jump to the areas with PIN/g) === 7 && noNested(seats));

console.log(`PincodeCard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

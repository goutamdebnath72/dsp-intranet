// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/pincode/pincode.selftest.ts
// The data and the logic of the Durgapur areas card. The data is read from the Election Commission's draft roll 2026 and from India Post, so these checks are the ones that can be proved from the data itself:
// the wards found on the pages are exactly those of the Delimitation Commission's order, every PIN a ward uses is a real post-office PIN, and nothing is half-filled.
import { PANCHAYATS, POST_OFFICES, WARDS, DATA_DATE } from "./data";
import { ALIASES, DURGAPUR_PINS, KANKSA_PINS, LOK_SABHA, ORDER_PANCHAYATS, ORDER_WARDS, SEATS, groupByPin, withAliases, isDspPin, isSailPin, officesOf, panchayatsOfPin, parseWardQuery, pinHue, pinStyle, rangesText, searchAreas, searchPins, searchWards, tokensOf, wardOf, wardsOfPin, wardsOfSeat } from "./pincode";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const BN = /[ঀ-৿]/;

// ---- the PIN codes (India Post)
ok("19 PIN codes exist in the 7132xx series, 713201 to 713219, and none outside", DURGAPUR_PINS.length === 19 && DURGAPUR_PINS[0] === "713201" && DURGAPUR_PINS[18] === "713219" && DURGAPUR_PINS.every((p, i) => p === String(713201 + i)));
ok("the two Kanksa codes of the rolls are there, outside the series", KANKSA_PINS.join() === "713148,713169");
ok("every PIN has at least one post office with a name, a kind and a block text", Object.entries(POST_OFFICES).every(([, os]) => os.length > 0 && os.every((o) => o.name.length > 1 && "HSB".includes(o.kind))));
ok("713201 has the head office Durgapur, first in its list, and Durgapur RS is the one that does not deliver", officesOf("713201")[0].name === "Durgapur" && officesOf("713201")[0].kind === "H" && officesOf("713201").some((o) => o.name === "Durgapur RS" && !o.delivers));
ok("the Steel Plant lens: 713203 (Steel Project), 713204 (Steel Town West) and 713205 (Steel Town East) carry a post office named for the plant, and no other PIN of the city does", ["713203", "713204", "713205"].every(isDspPin) && DURGAPUR_PINS.filter(isDspPin).length === 3 && isSailPin("713208") && !isSailPin("713203"));

// ---- the colours
const hues = [...DURGAPUR_PINS, ...KANKSA_PINS].map(pinHue);
let minGap = 360;
for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) { const d = Math.abs(hues[i] - hues[j]); minGap = Math.min(minGap, d, 360 - d); }
ok("no two PIN codes have a colour within 15 degrees of each other (21 codes), and consecutive PINs are at least 90 degrees apart", minGap >= 15 && Math.min(...DURGAPUR_PINS.slice(1).map((p, i) => { const d = Math.abs(pinHue(p) - pinHue(DURGAPUR_PINS[i])); return Math.min(d, 360 - d); })) >= 90, String(minGap));
ok("a colour is a set of five hsl() strings and the same PIN always gives the same one", /^hsl\(\d+ /.test(pinStyle("713203").dot) && JSON.stringify(pinStyle("713203")) === JSON.stringify(pinStyle("713203")) && pinStyle("713203").dot !== pinStyle("713204").dot);

// ---- the wards (the roll)
ok("43 wards, 1 to 43, each once", WARDS.length === 43 && WARDS.every((w, i) => w.ward === i + 1));
ok("the wards the pages gave for Durgapur Purba are exactly those of the Delimitation Commission's order: 1-10 and 23-28", JSON.stringify(wardsOfSeat("purba").map((w) => w.ward)) === JSON.stringify(ORDER_WARDS.purba) && rangesText(ORDER_WARDS.purba) === "1–10, 23–28");
ok("...and for Durgapur Paschim: 11-22 and 29-43", JSON.stringify(wardsOfSeat("paschim").map((w) => w.ward)) === JSON.stringify(ORDER_WARDS.paschim) && rangesText(ORDER_WARDS.paschim) === "11–22, 29–43");
ok("the seats have the numbers 276 and 277, and sit in the Lok Sabha seat 39 Bardhaman-Durgapur", SEATS.purba.no === 276 && SEATS.paschim.no === 277 && LOK_SABHA.no === 39);
const sum = (l: ReadonlyArray<{ parts: number }>) => l.reduce((a, b) => a + b.parts, 0);
ok("every polling area of the roll is counted once: 306 for Paschim, 212 for the wards of Purba and 79 for the three gram panchayats (291 in all)", sum(wardsOfSeat("paschim")) === 306 && sum(wardsOfSeat("purba")) === 212 && sum(PANCHAYATS) === 79);
ok("the PIN counts of a ward add up to its polling areas, and every PIN a ward or panchayat uses is a PIN with post offices", [...WARDS, ...PANCHAYATS].every((w) => w.pins.reduce((a, p) => a + p[1], 0) === w.parts && w.pins.every((p) => POST_OFFICES[p[0]])));
ok("every ward has areas, each area has its Bengali (with Bengali letters), its English (Latin letters) and a PIN the ward uses; no area is the roll's '999' line", WARDS.every((w) => w.areas.length > 0 && w.areas.every((a) => BN.test(a[0]) && /[A-Za-z]/.test(a[1]) && w.pins.some((p) => p[0] === a[2]) && !/^999/.test(a[0]) && !/999-/.test(a[0]))));
ok("the three gram panchayats are Amlajora, Gopalpur and Molandighi, as in the order, with 27, 31 and 21 polling areas", JSON.stringify(PANCHAYATS.map((g) => g.en).sort()) === JSON.stringify([...ORDER_PANCHAYATS].sort()) && PANCHAYATS.find((g) => g.en === "Amlajora")?.parts === 27 && PANCHAYATS.find((g) => g.en === "Gopalpur")?.parts === 31 && PANCHAYATS.find((g) => g.en === "Molandighi")?.parts === 21);
ok("the data carries its date", /^\d{4}-\d{2}-\d{2}$/.test(DATA_DATE));

// ---- facts that were checked by eye on the roll pages
ok("ward 11 (Kuruiya) is PIN 713203 only; ward 29 (Sagarbhanga) is 713211 only; ward 22 has 713216 first (19 areas), then 713209 and 713205", wardOf(11)?.pins.length === 1 && wardOf(11)?.pins[0][0] === "713203" && wardOf(29)?.pins[0][0] === "713211" && wardOf(29)?.pins.length === 1 && JSON.stringify(wardOf(22)?.pins.map((p) => p[0])) === JSON.stringify(["713216", "713209", "713205"]) && wardOf(22)?.pins[0][1] === 19);
ok("ward 28 has 19 polling areas and PIN 713219 first (part 212 was read by eye)", wardOf(28)?.parts === 18 + 1 && wardOf(28)?.pins[0][0] === "713219" && wardOf(28)!.pins.find((p) => p[0] === "713219")![1] === 11);
ok("wardsOfPin: 713211 is only ward 29; 713203 is used by wards 11, 12, 13, 14, 16 and 34 (and no other)", JSON.stringify(wardsOfPin("713211").map((w) => w.ward)) === "[29]" && JSON.stringify(wardsOfPin("713203").map((w) => w.ward)) === "[11,12,13,14,16,34]", JSON.stringify(wardsOfPin("713203").map((w) => w.ward)));
ok("the Kanksa codes belong to the panchayats: 713169 is Amlajora (Shilampur), 713148 is Gopalpur", panchayatsOfPin("713169").some((g) => g.en === "Amlajora") && panchayatsOfPin("713148").some((g) => g.en === "Gopalpur"));

// ---- the searches
ok("tokens are lower-case words without punctuation", JSON.stringify(tokensOf("Ward-22, Sagar Bhanga!")) === JSON.stringify(["ward", "22", "sagar", "bhanga"]));
ok("'ward 22' and 'ward22' are ward 22; a seat, a PIN and a word are told apart", JSON.stringify(parseWardQuery("ward 22")) === JSON.stringify({ wards: [22], seats: [], pins: [], words: [] }) && parseWardQuery("ward22").wards[0] === 22 && parseWardQuery("purba 713204").seats[0] === "purba" && parseWardQuery("purba 713204").pins[0] === "713204" && parseWardQuery("sagarbhanga colony").words.length === 2);
ok("an empty search keeps all 43 wards with all their areas", searchWards(WARDS, "").length === 43 && searchWards(WARDS, "").every((r) => !r.filtered));
ok("'ward 22' finds only ward 22; 'purba' finds the 16 wards of the seat; 'paschim' 27", searchWards(WARDS, "ward 22").map((r) => r.ward.ward).join() === "22" && searchWards(WARDS, "purba").length === 16 && searchWards(WARDS, "paschim").length === 27);
ok("a PIN finds the wards that use it: 713211 is ward 29 only; two PINs at once find the wards that have both", searchWards(WARDS, "713211").map((r) => r.ward.ward).join() === "29" && searchWards(WARDS, "713216").every((r) => r.ward.pins.some((p) => p[0] === "713216")));
// ---- names used for the same place: "Bengal Ambuja" is "Ambuja"
const amb = searchWards(WARDS, "ambuja"), bamb = searchWards(WARDS, "bengal ambuja"), bamb2 = searchWards(WARDS, "Bengal-Ambuja residential");
ok("a search for 'Bengal Ambuja' finds exactly what 'Ambuja' finds (the roll writes 'Ambuja Residential Complex')", amb.length >= 1 && JSON.stringify(bamb.map((r) => [r.ward.ward, r.areas.length])) === JSON.stringify(amb.map((r) => [r.ward.ward, r.areas.length])) && bamb2.length >= 1 && bamb.every((r) => r.areas.every((a) => /ambuja/i.test(a[1]))));
ok("the other name is written right after the word Ambuja inside the long area name, and nowhere else; one entry in the table", ALIASES.length === 1 && JSON.stringify(withAliases("Indian Oil Staff Quarters and Ambuja Residential Complex (Second Phase) ADDA Plot")) === JSON.stringify(["Indian Oil Staff Quarters and ", { word: "Ambuja", alias: "Bengal Ambuja" }, " Residential Complex (Second Phase) ADDA Plot"]) && withAliases("Bengal Ambuja Complex").length === 1 && withAliases("Sagarbhanga Colony").join() === "Sagarbhanga Colony");
const sag = searchWards(WARDS, "sagarbhanga");
ok("a word finds the wards with that area, in English, and shows only the matching areas", sag.length >= 2 && sag.some((r) => r.ward.ward === 29) && sag.every((r) => r.filtered && r.areas.every((a) => a[1].toLowerCase().includes("sagarbhanga") || a[0].includes("sagarbhanga"))), sag.map((r) => r.ward.ward).join());
ok("a Bengali word finds the same", searchWards(WARDS, "সাগরভাঙ্গা").some((r) => r.ward.ward === 29));
ok("words and a ward number together narrow it: 'ward 29 colony' keeps ward 29 only", searchWards(WARDS, "ward 29 colony").every((r) => r.ward.ward === 29) && searchWards(WARDS, "ward 29 colony").length === 1);
ok("nothing found gives nothing", searchWards(WARDS, "zzzzqq").length === 0 && searchPins(DURGAPUR_PINS, "zzzzqq").length === 0);
ok("PIN search: all 19 for nothing; '713203' finds that one; 'steel project' finds 713203 with that office only; 'steel town' finds 713204 and 713205", searchPins(DURGAPUR_PINS, "").length === 19 && searchPins(DURGAPUR_PINS, "713203").length === 1 && searchPins(DURGAPUR_PINS, "steel project")[0].pin === "713203" && searchPins(DURGAPUR_PINS, "steel project")[0].offices.every((o) => /steel project/i.test(o.name)) && searchPins(DURGAPUR_PINS, "steel town").map((r) => r.pin).join() === "713204,713205");
ok("searchAreas filters a list by words, English or Bengali, and returns it whole for none", searchAreas(wardOf(29)!.areas, "").length === wardOf(29)!.areas.length && searchAreas(wardOf(29)!.areas, "colony").length > 0 && searchAreas(wardOf(29)!.areas, "colony").length < wardOf(29)!.areas.length + 1);
const g = groupByPin(wardOf(22)!.areas, wardOf(22)!.pins);
ok("areas grouped by PIN come in the order of the ward's PINs (the biggest first) and lose none", g[0].pin === "713216" && g.reduce((a, x) => a + x.areas.length, 0) === wardOf(22)!.areas.length);
ok("rangesText joins runs", rangesText([3, 1, 2, 5, 7, 8]) === "1–3, 5, 7–8" && rangesText([]) === "");

console.log(`pincode: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/bh/bh.selftest.ts
// (The marks below are samples; none of them is a real person's vehicle.)
import { BH_BANDS, BH_FUELS, BH_GROUPS, BH_LETTERS, BH_SAMPLES, bhTax, inGroups, letterSetNumber, looksLikeBh, parseBhShape, readBh, type BhTax } from "./bh";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const rd = (q: string, y = 2026) => { const r = readBh(q, y); return r.ok ? r : null; };
const tax = (p: number, f: "petrol" | "diesel" | "electric" = "petrol") => { const t = bhTax(p, f); return "error" in t ? null : (t as BhTax); };

// the shape of a mark
ok("a mark is read with spaces, hyphens, none, or small letters", ["26 BH 1234 AA", "26BH1234AA", "26-bh-1234-aa", "26 bh 1234 aa"].every((q) => parseBhShape(q)?.yy === "26" && parseBhShape(q)?.number === "1234" && parseBhShape(q)?.letters === "AA"));
ok("one letter is allowed (the series starts with A, B, C...), three are not, and an ordinary mark is not a BH mark", parseBhShape("22 BH 0007 C")?.letters === "C" && parseBhShape("26 BH 1234 AAA") === null && parseBhShape("WB 74 AB 1234") === null && parseBhShape("26 BH 123 AA") === null && parseBhShape("26 BH 12345 AA") === null && parseBhShape("2 BH 1234 AA") === null);
ok("looksLikeBh is for a short line only, and the samples are all BH marks", looksLikeBh("26 BH 1234 AA") && !looksLikeBh("bh series") && !looksLikeBh("26 BH 1234 AA is my number and I want to know more about it") && BH_SAMPLES.every((s) => looksLikeBh(s.text)));

// the letters
ok("the letters are A to Z without I and O: 24 letters", BH_LETTERS.length === 24 && !BH_LETTERS.includes("I") && !BH_LETTERS.includes("O"));
ok("the sets run A..Z (1-24) then AA..ZZ (25-600): A is 1, Z is 24, AA is 25, AB is 26, ZZ is 600, 600 in all; I and O have no place", letterSetNumber("A")?.n === 1 && letterSetNumber("Z")?.n === 24 && letterSetNumber("AA")?.n === 25 && letterSetNumber("AB")?.n === 26 && letterSetNumber("ZZ")?.n === 600 && letterSetNumber("ZZ")?.of === 600 && letterSetNumber("AI") === null && letterSetNumber("O") === null);

// reading a mark
const a = rd("26 BH 1234 AA");
ok("a mark is read in four parts: year, series, number, letters", !!a && a.parts.map((p) => p.id).join() === "year,series,number,letters" && a.parts.map((p) => p.text).join("|") === "26|BH|1234|AA" && a.shown === "26 BH 1234 AA");
ok("the year is 2026 and is the year of registration, not of making", !!a && /2026/.test(a.parts[0].detail) && /not the year in which the vehicle was made/.test(a.parts[0].detail));
ok("BH replaces the State code; the number is random so none can be chosen; the letters are a counter, not a vehicle-category code", !!a && /replaces the State code/.test(a.parts[1].detail) && /generated at random/.test(a.parts[2].detail) && /no fancy or VIP/.test(a.parts[2].detail) && /counter/.test(a.parts[3].detail) && /not a code for the kind of vehicle/.test(a.parts[3].detail) && /set 25 of the 600/.test(a.parts[3].detail));
ok("the facts: registered 2026, valid in every State and UT, letter set, tax every two years", !!a && a.facts.map((f) => f.value).join("|") === "2026|every State and UT|25 of 600|every two years");
ok("a good mark has no warning", !!a && a.warnings.length === 0);
ok("a year before the series began is a warning, and the rest is still read", (() => { const x = rd("19 BH 1234 AA"); return !!x && x.warnings.length === 1 && /began on 15 September 2021/.test(x.warnings[0]) && x.parts.length === 4; })());
ok("2021 is allowed (the series began that September); a year not yet come is a warning", rd("21 BH 1234 AA")?.warnings.length === 0 && /has not come yet/.test(rd("29 BH 1234 AA")?.warnings[0] ?? ""));
ok("0000 is noted, because the rule says 0001 to 9999 and one note says 0000", /0001 to 9999/.test(rd("26 BH 0000 AA")?.notes.join(" ") ?? "") && !/0001 to 9999/.test(a?.notes.join(" ") ?? ""));
const bad = (q: string) => { const r = readBh(q, 2026); return r.ok ? null : r.issues.join(" "); };
ok("I and O in the letters are refused, naming the digit they look like", /I \(it looks like the digit 1\)/.test(bad("26 BH 1234 AI") ?? "") && /O \(it looks like the digit 0\)/.test(bad("26 BH 1234 OA") ?? "") && /never include I or O/.test(bad("26 BH 1234 AI") ?? ""));
ok("a line that is not shaped like a mark says what a mark looks like; nothing typed says nothing", /two digits.*BH.*four digits/.test(bad("26 BH 12 AA") ?? "") && (() => { const r = readBh("", 2026); return !r.ok && !r.typed && r.issues.length === 0; })());

// who is eligible
ok("the Ministry's groups are eligible: defence, Central, State/UT, Central PSU, State PSU, private with offices in four or more States", ["defence", "central", "state", "cpsu", "spsu", "private4"].every((id) => BH_GROUPS.find((g) => g.id === id)?.eligible === true));
ok("a private firm with fewer than four States, the self-employed and the retired are not in the list", ["private3", "self", "retired"].every((id) => BH_GROUPS.find((g) => g.id === id)?.eligible === false));
ok("the private firm's proof is Form 60 signed and sealed; the others show the identity card; the refused have no proof", /Form 60/.test(BH_GROUPS.find((g) => g.id === "private4")!.proof) && BH_GROUPS.filter((g) => g.eligible && g.id !== "private4").every((g) => /identity card/.test(g.proof)) && BH_GROUPS.filter((g) => !g.eligible).every((g) => g.proof === ""));

// the tax: the rule's own words are the bands and the formula 1.25 x 2 / 15, rounded up
ok("the bands are 8%, 10% and 12%; diesel two points more, electric two points less", BH_BANDS.map((b) => b.base).join() === "8,10,12" && BH_FUELS.map((f) => f.adjust).join() === "0,2,-2");
ok("Rs 8,00,000 petrol: 8% band, the tax for two years is Rs 10,667 (8,00,000 x 8% x 1.25 x 2 / 15 = 10,666.67, rounded up)", tax(800000)?.twoYear === 10667 && tax(800000)?.rate === 8 && tax(800000)?.band === 0);
ok("Rs 12,00,000 petrol: 10% band, Rs 20,000", tax(1200000)?.twoYear === 20000 && tax(1200000)?.rate === 10 && tax(1200000)?.band === 1);
ok("Rs 15,00,000 petrol, Rs 25,00,000 petrol: Rs 25,000 and Rs 50,000", tax(1500000)?.twoYear === 25000 && tax(2500000)?.twoYear === 50000 && tax(2500000)?.rate === 12);
ok("diesel adds two points, electric takes two off: Rs 8,00,000 diesel 10% = Rs 13,334 (13,333.33 rounded up), electric 6% = Rs 8,000", tax(800000, "diesel")?.rate === 10 && tax(800000, "diesel")?.twoYear === 13334 && tax(800000, "electric")?.rate === 6 && tax(800000, "electric")?.twoYear === 8000);
ok("the price is of the band by the words of the rule: below 10 lakh is the first, 10 to 20 lakh (both ends in) the middle, above 20 lakh the last", tax(999999)?.band === 0 && tax(1000000)?.band === 1 && tax(2000000)?.band === 1 && tax(2000001)?.band === 2);
ok("it is always the one-sixth: the tax is the price x rate / 600, rounded up, for many prices", [123457, 456789, 999999, 1000001, 1999999, 3141593, 87654321].every((p) => (["petrol", "diesel", "electric"] as const).every((f) => { const t = tax(p, f)!; return t.twoYear === Math.ceil(p * t.rate / 600 - 1e-9) && t.twoYear >= p * t.rate / 600 - 1e-9 && t.twoYear < p * t.rate / 600 + 1; })));
ok("from the 14th year the tax is yearly, half of the two-year tax, rounded up; the first 14 years are seven payments", tax(1200000)?.annual === 10000 && tax(800000)?.annual === 5334 && tax(1200000)?.fourteenYears === 140000);
ok("the steps are in words and end with the tax", (() => { const t = tax(800000)!; return t.steps.length === 4 && /8%/.test(t.steps[0]) && /8,00,000/.test(t.steps[0]) && /1\.25/.test(t.steps[2]) && /₹10,667/.test(t.steps[3]); })());
ok("no price, zero, negative, nonsense and an absurd price are refused with a reason", ["", NaN, 0, -5, Infinity, 1e12].every((p) => { const t = bhTax(p as number, "petrol"); return "error" in t && t.error.length > 10; }));
ok("a price with paise does not move the rupee by a computer's rounding: 8,00,000.50 is still 10,667", tax(800000.5)?.twoYear === 10667);
ok("Indian grouping does not depend on the machine's locale", inGroups(800000) === "8,00,000" && inGroups(12345678) === "1,23,45,678" && inGroups(999) === "999" && inGroups(1000) === "1,000" && inGroups(10667.5) === "10,667.50");

console.log(`bh.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/vin/vin.selftest.ts
// (The numbers below are samples; none of them is a real person's vehicle.)
import { FULL_FORMS, MONTH_CODES, SECTIONS, VIN_SAMPLES, WMIS, YEAR_CODES, checkSteps, looksLikeVin, modelYear, readVin, regionOf, splitVin, yearsFor } from "./vin";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const rd = (q: string, y = 2026) => { const r = readVin(q, y); return r.ok ? r : null; };

// the check digit: the calculation is the standard one (ISO 3779 / 49 CFR 565), proved on numbers whose digit is known
ok("known numbers get their known check digit: 1HGBH41JXMN109186 is X, 5YJSA1DG9DFP14705 is 9, 1M8GDM9AXKP042788 is X, all ones is 1", checkSteps("1HGBH41JXMN109186").digit === "X" && checkSteps("5YJSA1DG9DFP14705").digit === "9" && checkSteps("1M8GDM9AXKP042788").digit === "X" && checkSteps("11111111111111111").digit === "1");
{ const c = checkSteps("1HGBH41JXMN109186");
  ok("the steps are shown: 17 positions, position 9 has weight 0, the sum modulo 11 is the digit (10 is X)", c.steps.length === 17 && c.steps[8].weight === 0 && c.steps[0].weight === 8 && c.steps[16].weight === 2 && c.sum % 11 === c.remainder && c.remainder === 10 && c.digit === "X" && c.steps[1].value === 8 && c.steps[2].value === 7); }
ok("the year codes: A 2010 (1980), K 2019 (1989), T 2026, Y 2030 (2000), 1 2031 (2001), 9 2039 (2009); never I O Q U Z 0", YEAR_CODES.length === 30 && yearsFor("A")?.join() === "1980,2010" && yearsFor("K")?.join() === "1989,2019" && yearsFor("T")?.join() === "1996,2026" && yearsFor("Y")?.join() === "2000,2030" && yearsFor("1")?.join() === "2001,2031" && yearsFor("9")?.join() === "2009,2039" && ["I", "O", "Q", "U", "Z", "0"].every((c) => yearsFor(c) === null));
ok("the likely year is the latest one that is not later than next year: K is 2019, V is 2027 in 2026 but 1997 in 2024, 3 is 2003", modelYear("K", 2026)?.year === 2019 && modelYear("K", 2026)?.other === 1989 && modelYear("V", 2026)?.year === 2027 && modelYear("V", 2024)?.year === 1997 && modelYear("3", 2026)?.year === 2003 && modelYear("U", 2026) === null);

// a Hyundai made in India (a made-up serial)
const h = rd("MALBM51BLKM000001");
ok("a Hyundai India number is read part by part: country, manufacturer, descriptor, position 9, year, plant, serial", !!h && h.parts.map((p) => p.id).join() === "country,maker,descriptor,check,year,plant,serial" && h.parts.map((p) => p.text).join("|") === "M|AL|BM51B|L|K|M|000001");
ok("M with A is India, MAL is Hyundai Motor India", !!h && /India \(Asia\)/.test(h.parts[0].detail) && /MAL: Hyundai Motor India/.test(h.parts[1].detail) && h.wmi?.maker === "Hyundai Motor India");
ok("position 9 L is a letter: not a check digit, Indian makers use it for their own code", !!h && h.check.state === "none" && /not a check digit/.test(h.parts[3].detail) && /India and Europe use position 9 for their own code/.test(h.parts[3].detail));
ok("K is 2019 (or 1989); the plant letter M is Hyundai's Sriperumbudur plant; the descriptor is the maker's own", !!h && h.year?.year === 2019 && /K stands for 2019/.test(h.parts[4].detail) && /could also be 1989/.test(h.parts[4].detail) && /Sriperumbudur/.test(h.parts[5].detail) && /the maker's own description/.test(h.parts[2].detail));
ok("the facts: 17 characters, India, 2019, check digit not used", !!h && h.facts.map((f) => f.value).join("|") === "17 characters|India · Asia|2019 (or 1989)|not used (a letter)");
ok("the plate may carry Hyundai's month letter after a star: *L is November, the stamped number is 19 characters", (() => { const x = rd("MALBM51BLKM000001*L"); const m = x?.parts.find((p) => p.id === "month"); return !!x && !!m && m.text === "*L" && /L is November/.test(m.detail) && /19 characters/.test(m.detail) && x.vin === "MALBM51BLKM000001"; })());
ok("the month letters of Hyundai: A January ... H August, J September, K October, L November, M December (no I)", MONTH_CODES.A === "January" && MONTH_CODES.H === "August" && MONTH_CODES.J === "September" && MONTH_CODES.L === "November" && MONTH_CODES.M === "December" && !("I" in MONTH_CODES) && Object.keys(MONTH_CODES).length === 12);
ok("an extension on another maker's number is not guessed", (() => { const x = rd("1HGBH41JXMN109186*A"); return !!x && !x.parts.some((p) => p.id === "month") && x.notes.some((n) => /only for Hyundai/.test(n)); })());

// North America: the check digit is calculated
const hn = rd("1HGBH41JXMN109186");
ok("an American number with a right check digit says it is right", !!hn && hn.check.state === "valid" && /a check digit, and it is right/.test(hn.parts[3].detail) && /United States/.test(hn.parts[0].detail) && hn.wmi?.maker === "Honda" && hn.year?.year === 2021);
const wrong = rd("1HGBH41J1MN109186");
ok("a wrong check digit in North America is a probable typing mistake, and says what it should be", !!wrong && wrong.check.state === "mismatch" && wrong.check.calculated === "X" && /must equal X/.test(wrong.parts[3].detail) && /mistyped/.test(wrong.parts[3].detail));
ok("outside North America a digit that does not match is not called an error", (() => { const x = rd("MALBM51B1KM000001"); return !!x && x.check.state === "mismatch" && /not an error by itself/.test(x.parts[3].detail); })());

// what is refused, and why
const bad = (q: string) => { const r = readVin(q, 2026); return r.ok ? null : r.issues.join(" "); };
ok("the wrong length is said: 16 typed, none typed, 11 (before 1981)", /exactly 17 characters; 16 were typed/.test(bad("MALBM51BLKM00000") ?? "") && /Type the 17 characters/.test(bad("") ?? "") && /11 characters/.test(bad("MALBM51BLKM") ?? ""));
ok("I, O and Q are refused with the likely digit: I as 1, O and Q as 0", /I is probably the digit 1/.test(bad("MALBM5IBLKM000001") ?? "") && /O is probably the digit 0/.test(bad("MALBM51BLKMO00001") ?? "") && /Q is probably the digit 0/.test(bad("MALBM51BLKMQ00001") ?? "") && /never used in a VIN/.test(bad("MALBM5IBLKM000001") ?? ""));
ok("a character that is not a letter or digit is refused", /"#"/.test(bad("MALBM51BLKM#00001") ?? "") && /"@"/.test(bad("MALBM51BLKM@00001") ?? ""));
ok("a year code that is never one gives a warning but the rest is still read", (() => { const x = rd("MALBM51BLUM000001"); return !!x && x.year === null && x.warnings.length === 1 && /never a year code/.test(x.warnings[0]) && x.parts.length === 7; })());
ok("an unknown manufacturer code is said to be unknown, not guessed", (() => { const x = rd("MA9BM51BLKM000001"); return !!x && x.wmi === null && /does not have that code in its list/.test(x.parts[1].detail) && /Each maker has its own plant codes/.test(x.parts[5].detail) && !/Sriperumbudur/.test(x.parts[5].detail); })());

// what was typed
ok("spaces, hyphens and lower case are ignored; a word like VIN or chassis number in front is taken off", splitVin("malb m51b lkm 000001").core === "MALBM51BLKM000001" && splitVin("MALBM-51B-LKM-000001").core === "MALBM51BLKM000001" && splitVin("VIN MALBM51BLKM000001").core === "MALBM51BLKM000001" && splitVin("chassis no: MALBM51BLKM000001*L").suffix === "L" && splitVin("what is vin number MALBM51BLKM000001").prefixed === true && splitVin("MALBM51BLKM000001").prefixed === false);
ok("a line is taken for a VIN, as you type, only when it is one: 17 valid characters, letters and digits, a possible year code; or when it says vin", looksLikeVin("MALBM51BLKM000001") && looksLikeVin("malbm51blkm000001") && looksLikeVin("MALBM51BLKM000001*L") && looksLikeVin("vin MALBM51BLKM00000") && !looksLikeVin("MALBM51BLKM00000") && !looksLikeVin("11111111111111111") && !looksLikeVin("ABCDEFGHJKLMNPRST") && !looksLikeVin("MALBM51BLUM000001") && !looksLikeVin("hospital doctors") && !looksLikeVin("12345678901234567") && !looksLikeVin("x".repeat(200)));

// regions and the lists
ok("regions: M is Asia, MA-ME India; 1, 4, 5 United States; J Japan; W Germany; KM South Korea; S UK; Z Italy", regionOf("MAL").region === "Asia" && regionOf("MAL").country === "India" && regionOf("MEE").country === "India" && regionOf("MF1").country === null && regionOf("1HG").country === "United States" && regionOf("5YJ").country === "United States" && regionOf("JHM").country === "Japan" && regionOf("WVW").country === "Germany" && regionOf("KMH").country === "South Korea" && regionOf("SAL").country === "United Kingdom" && regionOf("ZFA").country === "Italy" && regionOf("2HG").country === "Canada" && regionOf("9BW").region === "South America");
ok("the manufacturers of India that are listed are the well-established ones, all MA-ME", ["MAL", "MA3", "MBH", "MAT", "MA1", "MAB", "MAC", "MAJ", "MAK", "MA6", "MCB", "MBJ", "MBR", "MB1", "MCA", "MC2", "MDH", "MD2", "MEE"].every((k) => WMIS[k]?.country === "India" && regionOf(k).country === "India") && WMIS.MAL.maker === "Hyundai Motor India" && WMIS.MA3.maker === "Maruti Suzuki" && WMIS.MAT.maker === "Tata Motors");
ok("the full forms: VIN, WMI, VDS, VIS, the two ISO standards, SAE", FULL_FORMS.map((f) => f.abbr).join() === "VIN,WMI,VDS,VIS,ISO 3779,ISO 3780,SAE" && FULL_FORMS[0].full === "Vehicle Identification Number" && FULL_FORMS[1].full === "World Manufacturer Identifier" && FULL_FORMS[2].full === "Vehicle Descriptor Section");
ok("the three sections cover positions 1 to 17 without a gap or an overlap", SECTIONS.map((s) => `${s.from}-${s.to}`).join() === "1-3,4-9,10-17" && SECTIONS.every((s, i, a) => i === 0 || s.from === a[i - 1].to + 1));
ok("the samples are all readable, and none is the owner's vehicle (serial 000001 or textbook examples)", VIN_SAMPLES.every((s) => readVin(s.vin, 2026).ok && looksLikeVin(s.vin)) && VIN_SAMPLES[0].vin.endsWith("000001"));

console.log(`vin selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

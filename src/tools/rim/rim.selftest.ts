// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/rim/rim.selftest.ts
import { FIT_TERMS, parseRim, readRim, rimForTyre, rimWidthsFor, tyreWidthsFor } from "./rim";
import { parseTyre } from "@/tools/tyre/tyre";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const r = parseRim("8Jx20");
ok("8Jx20 is read: 8 inches wide, flange J, one-piece drop-centre, 20 inches", !!r && r.width === 8 && r.flange === "J" && r.build === "x" && r.diameter === 20 && r.offset === null && r.pcd === null && r.bore === null);
const rd = r ? readRim(r) : null;
ok("the four parts, in order: width, flange profile, build, diameter", !!rd && rd.rows.map((x) => x.meaning).join() === "Rim width,Flange profile,Build,Rim diameter" && rd.rows.map((x) => x.part).join() === "8,J,x,20");
ok("the width is 203.2 mm, measured between the inner faces of the flanges and not from the outer edges", !!rd && /8 inches \(203\.2 mm\) wide, measured between the inner faces of the rim flanges/.test(rd.rows[0].detail) && /not from the outer edges of the metal/.test(rd.rows[0].detail));
ok("J is the standard contour of modern cars, SUVs and crossovers", !!rd && /rim lip that holds the tyre bead/.test(rd.rows[1].detail) && /J is the standard contour on modern passenger cars, SUVs and crossovers/.test(rd.rows[1].detail));
ok("x is a one-piece drop-centre wheel (the tyre goes on and off without taking the wheel apart)", !!rd && /one-piece wheel with a drop centre/.test(rd.rows[2].detail) && /without taking the wheel apart/.test(rd.rows[2].detail));
ok("20 is the diameter across the bead seat, 508 mm, and the tyre must end R20", !!rd && /20 inches \(508 mm\), measured across the bead seat/.test(rd.rows[3].detail) && /ending R20/.test(rd.rows[3].detail) && rd.facts.some((f) => f.label === "Tyre size must end in" && f.value === "R20"));
ok("the tyre widths that suit an 8-inch rim are 225-255 mm, 235-245 mm sitting best", !!rd && rd.tyre.min === 225 && rd.tyre.max === 255 && rd.tyre.bestMin === 235 && rd.tyre.bestMax === 245 && rd.facts.some((f) => f.label === "Tyre widths that suit it" && f.value === "225–255 mm"));
ok("the notes say the maker's approved rim width decides, and that offset, bolt pattern and centre bore must match too", !!rd && /approved rim width for the exact tyre decides/.test(rd.notes[0]) && /offset, the bolt pattern and the centre bore must also match the hub/.test(rd.notes[1]));

// other spellings
const a = parseRim("6.5J x 16"), b = parseRim("7j×17"), c = parseRim("alloy wheel size 7Jx17 ET45 5x114.3 CB67.1"), d = parseRim("9.5JJx21 ET 30"), e = parseRim("rim 8x20"), f = parseRim("5.5-15");
ok("6.5J x 16 and 7j×17 (spaces, lower case, a multiplication sign) are read", a?.width === 6.5 && a.diameter === 16 && a.flange === "J" && b?.width === 7 && b.diameter === 17);
ok("offset, bolt pattern and centre bore are read when typed", c?.offset === 45 && c.pcd?.bolts === 5 && c.pcd.circle === 114.3 && c.bore === 67.1 && c.width === 7);
ok("JJ is a flange letter and 'ET 30' with a space is read", d?.flange === "JJ" && d.width === 9.5 && d.diameter === 21 && d.offset === 30);
ok("a bare 8x20 is left alone unless a word like wheel or rim comes with it", parseRim("8x20") === null && e?.width === 8 && e.flange === "");
ok("a dash stands for a multi-piece wheel", parseRim("5.5J-15")?.build === "-" && f === null);
const full = c ? readRim(c) : null;
ok("with every part typed there is a row for each: offset (positive pulls the wheel in), bolt pattern, centre bore", !!full && full.rows.map((x) => x.meaning).join() === "Rim width,Flange profile,Build,Rim diameter,Offset,Bolt pattern,Centre bore" && /45 mm outside the centre line.*inward/.test(full.rows[4].detail) && /5 bolts on a circle 114\.3 mm across/.test(full.rows[5].detail) && /67\.1 mm.*centring ring/.test(full.rows[6].detail));
ok("a negative offset pushes the wheel out, zero is on the centre line", /pushes the wheel outward/.test(readRim(parseRim("9Jx18 ET-10")!).rows[4].detail) && /exactly on the centre line/.test(readRim(parseRim("8Jx18 ET0")!).rows[4].detail));
ok("a multi-piece marking says so, a missing flange letter is mentioned", /multi-piece wheel/.test(readRim(parseRim("5.5J-15")!).rows[2].detail) && /No flange letter was typed/.test(readRim(parseRim("rim size 8x20")!).notes[0]));

// not wheel markings
ok("ordinary text and tyre sizes are not wheel markings", ["", "gold rate", "205/55 R16 91V", "8 x 20", "2*3", "hello 8Jx20 world", "8Jx20 junk", "J x 20", "99Jx20", "8Jx5", "8Jx40"].every((x) => parseRim(x) === null));
ok("a very long line is refused at once", parseRim("8Jx20 " + "ET35 ".repeat(100)) === null);

// the guide for the tyre widths
ok("20 mm of tyre width more or less for each inch of rim width", tyreWidthsFor(7).min === 205 && tyreWidthsFor(7).max === 235 && tyreWidthsFor(9).min === 245 && tyreWidthsFor(9).max === 275 && tyreWidthsFor(6.5).min === 195 && tyreWidthsFor(6.5).max === 225);
ok("and the other way: 205 mm tyres suit rims of about 5.5 to 7 inches, 255 mm tyres 8 to 9.5", rimWidthsFor(205).lo === 5.5 && rimWidthsFor(205).hi === 7 && rimWidthsFor(255).lo === 8 && rimWidthsFor(255).hi === 9.5);
const t = parseTyre("255/50 R20 109V");
ok("a tyre asks the wheel for its diameter and a range of widths", !!t && rimForTyre(t).diameter === 20 && rimForTyre(t).lo === 8 && rimForTyre(t).hi === 9.5);
ok("the three fit terms are explained: offset, bolt pattern, centre bore", FIT_TERMS.map((x) => x.term).join() === "ET,PCD,CB" && FIT_TERMS.every((x) => x.meaning.length > 40));

console.log(`rim selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/search/nameHint/nameHint.selftest.ts
// "LOOKS LIKE A NAME": one to four words that read as an Indian name earn the hint that Enter searches people (nameHint.ts). Checked with a small fixture of the plant's name words (no database), on the
// built-in lists, and on the wiring (the search bar, the data route, the hook, the switch).
import { readFileSync } from "node:fs";
import { buildPlantVocab, detectNameHint, type PlantVocab } from "./nameHint";
import { FIRST_NAMES, HONORIFICS, NAME_ENDINGS, SURNAMES } from "./indianNames";
import { NAME_HINT_MODE, nameHintSources } from "./config";
import { foldToken } from "@/lib/employees/namePredicate";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const src = (p: string) => readFileSync(p, "utf8");

const plant = buildPlantVocab(["RAKESH", "OJHA", "GOUTAM", "DEBNATH", "KUMAR", "GOSWAMI", "RUPAK", "PRADIP", "DAS", "SANDEEP", "SHAHID", "MOHAMMAD", "ABHIJIT", "CHATTERJEE", "MAJUMDAR", "SUBRATA", "KOLKATA", "TRAIN", "ROY"]);
const both = { useBuiltin: true, plant };
const builtinOnly = { useBuiltin: true, plant: null };
const plantOnly = { useBuiltin: false, plant };
const h = (line: string, s: { useBuiltin: boolean; plant: PlantVocab | null } = both) => detectNameHint(line, s);

// ---- what reads as a name
ok("one word of the plant's names, alone", h("rakesh")?.basis === "plant" && h("rakesh")?.wordCount === 1 && h("ojha")?.basis === "plant");
ok("two, three, four words together", h("rakesh ojha")?.wordCount === 2 && h("pradip kumar das")?.wordCount === 3 && h("rakesh kumar das ojha")?.wordCount === 4);
ok("capitals and small letters alike", h("RAKESH OJHA")?.words.join() === "RAKESH,OJHA" && h("Rakesh Ojha")?.words.join() === "RAKESH,OJHA");
ok("another spelling of the same sound is the same name (Gautam = Goutam, Sandip = Sandeep, Mazumdar = Majumdar)", h("gautam debnath")?.basis === "plant" && h("sandip")?.basis === "plant" && h("mazumdar", plantOnly)?.basis === "plant");
ok("initials and an honorific are left out: 'G D Kumar', 'Mr Rakesh Ojha', 'Dr. Anita Sharma'", h("g d kumar")?.words.join() === "KUMAR" && h("mr rakesh ojha")?.words.join() === "RAKESH,OJHA" && h("dr. anita sharma", builtinOnly)?.words.join() === "ANITA,SHARMA");
ok("two initials written together (SK, MD) count as initials", h("sk rakesh")?.words.join() === "RAKESH");
ok("a courtesy word after the name is ignored (sir, madam, ji)", h("rakesh ojha sir")?.words.join() === "RAKESH,OJHA" && h("anita ji", builtinOnly)?.words.join() === "ANITA");
ok("a compound name written as one word (Ajaykumar, Gopinath) reads as a name from the built-in endings", h("ajaykumar", builtinOnly)?.basis === "builtin" && h("gopinath", builtinOnly)?.basis === "builtin");
ok("the built-in list alone knows the common names (Amit, Sharma, Banerjee) and the plant words alone know the plant's", h("amit sharma", builtinOnly)?.basis === "builtin" && h("rakesh", plantOnly)?.basis === "plant" && h("amit sharma", plantOnly) === null);

// ---- the basis told on the screen
ok("the basis is the WEAKEST among the words: plant + built-in = built-in", h("rakesh sharma")?.basis === "builtin" && h("rakesh ojha")?.basis === "plant");
const sim = h("rupak gosyami");
ok("a spelling one slip from a real word, with a silent W or Y, says which word it took it for (Gosyami -> Goswami) and is 'similar'", sim?.basis === "similar" && sim?.similarTo?.took === "GOSWAMI" && sim?.similarTo?.typed === "GOSYAMI", JSON.stringify(sim));

// ---- what must NOT read as a name
const never = ["gold price", "pf loan", "holiday list", "train to howrah", "weather kolkata", "who is the head of c&it", "salary slip", "mediclaim", "hello", "bonus", "emergency", "people", "person", "ahead", "before", "metal", "total", "xyz abc", "constructor", "__proto__", "valueOf"];
for (const l of never) ok(`not a name: "${l}"`, h(l) === null, JSON.stringify(h(l)));
ok("a number, a ticket, a P.No., a symbol, a question mark are never a name", ["498880", "9434792593", "D123456", "rakesh@sail.in", "rakesh ojha?", "rakesh/ojha", "rakesh 2"].every((l) => h(l) === null));
ok("more than four words, an empty line, one letter, an honorific alone, initials alone are not a name", h("rakesh kumar das ojha singh") === null && h("") === null && h("a") === null && h("mr") === null && h("g d") === null && h("sk md") === null);
ok("the words of commands are never names even if a vocabulary holds them", detectNameHint("train", { useBuiltin: true, plant }) === null && detectNameHint("kolkata", { useBuiltin: true, plant }) === null);
ok("a line of 61 characters or more is not read", h("rakesh ".repeat(9)) === null);

// ---- speed: a keystroke costs far less than a millisecond
const t0 = process.hrtime.bigint();
for (let i = 0; i < 2000; i++) { h("rakesh ojha"); h("gold price"); h("rupak gosyami"); }
const per = Number(process.hrtime.bigint() - t0) / 1e6 / 6000;
ok(`a check costs under a millisecond (measured ${per.toFixed(3)} ms)`, per < 1, String(per));

// ---- the fix that was needed on the way: the phonetic code must not throw on a word every object already has
ok("foldToken takes 'constructor' and '__proto__' as words", typeof foldToken("constructor", false) === "string" && typeof foldToken("__proto__", true) === "string");

// ---- the built-in lists
const lettersOnly = (a: string[]) => a.every((w) => /^[A-Z]+$/.test(w));
ok("the built-in lists are upper-case letters only, and big enough to matter", lettersOnly(FIRST_NAMES) && lettersOnly(SURNAMES) && lettersOnly(HONORIFICS) && lettersOnly(NAME_ENDINGS) && new Set(FIRST_NAMES).size > 400 && new Set(SURNAMES).size > 180);
ok("no honorific is listed as a name, and no ending that also ends ordinary English words (pal, dev, deb, deep, lal)", !FIRST_NAMES.some((w) => HONORIFICS.includes(w)) && !SURNAMES.some((w) => HONORIFICS.includes(w)) && !["PAL", "DEV", "DEB", "DEEP", "LAL"].some((e) => NAME_ENDINGS.includes(e)));

// ---- the switch
ok("the switch has four settings; 'both' uses both sources, 'builtin' fetches nothing, 'plant' uses no built-in names, 'off' uses neither", JSON.stringify(nameHintSources("both")) === '{"useBuiltin":true,"usePlant":true}' && JSON.stringify(nameHintSources("builtin")) === '{"useBuiltin":true,"usePlant":false}' && JSON.stringify(nameHintSources("plant")) === '{"useBuiltin":false,"usePlant":true}' && JSON.stringify(nameHintSources("off")) === '{"useBuiltin":false,"usePlant":false}');
ok("the shipped setting is one of the four", ["both", "builtin", "plant", "off"].includes(NAME_HINT_MODE));

// ---- the wiring
const omni = src("src/components/OmnibarModal.tsx");
ok("the search bar shows the hint only when no command, utility, management page or executive mode has the line, and the line has not been searched yet", /NAME_HINT_MODE === "off" \|\| !q \|\| mode === "intellectual" \|\| toolForm \|\| routed \|\| clearHit \|\| hubTyped \|\| \(submittedQuery \|\| ""\)\.trim\(\) === q \|\| detectTool\(q\)/.test(omni) && /nameHint && !clearHit && !understanding/.test(omni));
ok("the plant's words are fetched only when the box is open and the setting uses them", /useNameVocab\(isOpen && nameSources\.usePlant\)/.test(omni) && /enabled \? "\/api\/employees\/name-words" : null/.test(src("src/hooks/useNameVocab.ts")));
const route = src("src/app/api/employees/name-words/route.ts");
ok("the data route returns the words only (nothing about any person), is limited per address and cached for ten minutes", /NextResponse\.json\(\{ words \}/.test(route) && /createLimiter/.test(route) && /max-age=600/.test(route) && !/ticket|sailPNo|contactNo|email/i.test(route.replace(/\/\/.*$/gm, "")));
console.log(`nameHint selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

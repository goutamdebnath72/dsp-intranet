// src/lib/search/termFamilies.selftest.ts: npx tsx --tsconfig tsconfig.selftest.json src/lib/search/termFamilies.selftest.ts
import { readFileSync } from "node:fs";
import { FAMILIES, termFamilyAdditions, termFamilyTsTerms, withTermFamilies } from "./termFamilies";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("FAIL", n); } };
const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

ok("a word of the family brings the other three", same(termFamilyAdditions("biometric attendance circular"), ["face recognition", "RFID", "BAMS"]));
ok("face recognition (also facial recognition, face-recognition) brings the others", same(termFamilyAdditions("face recognition attendance system"), ["biometric", "RFID", "BAMS"]) && same(termFamilyAdditions("Facial Recognition"), ["biometric", "RFID", "BAMS"]) && same(termFamilyAdditions("face-recognition"), ["biometric", "RFID", "BAMS"]));
ok("RFID and BAMS each bring the others, in any case", same(termFamilyAdditions("RFID card printing"), ["biometric", "face recognition", "BAMS"]) && same(termFamilyAdditions("how do I log in to bams"), ["biometric", "face recognition", "RFID"]));
ok("biometrics (plural) is the same word", same(termFamilyAdditions("biometrics"), ["face recognition", "RFID", "BAMS"]));
ok("a question that already uses several only gets the missing ones", same(termFamilyAdditions("biometric or RFID attendance"), ["face recognition", "BAMS"]) && termFamilyAdditions("biometric, face recognition, RFID and BAMS").length === 0);
ok("a question with no family word is not touched", termFamilyAdditions("gift card amount for employees").length === 0 && withTermFamilies("gift card amount") === "gift card amount" && termFamilyTsTerms("gift card amount").length === 0);
ok("part of another word is not a family word (bamsa, rfidx, biometricx are not)", termFamilyAdditions("bamsa rfidx").length === 0);
ok("the typed words stay in the embedding text: both sides are kept", /^face recognition attendance \(also called: biometric, RFID, BAMS\)$/.test(withTermFamilies("face recognition attendance")));
ok("the text-search pieces are valid tsquery fragments (words, or a phrase joined by <->)", termFamilyTsTerms("RFID card").every((t) => /^(?:[a-z]+|\([a-z]+ <-> [a-z]+\))$/.test(t)) && termFamilyTsTerms("RFID card").includes("(face <-> recognition)"));
ok("every term of every family finds itself (the pattern matches its own text)", FAMILIES.every((f) => f.terms.every((t) => t.re.test(t.text))));
ok("no word belongs to two families (a word's family must be one)", (() => { const seen = new Set<string>(); for (const f of FAMILIES) for (const t of f.terms) { if (seen.has(t.text)) return false; seen.add(t.text); } return true; })());

// the places that use it
const src = (p: string) => readFileSync(p, "utf8");
ok("the embedding of every search question is made from the question and its family words", /withTermFamilies\(text\)/.test(src("src/lib/ai/geminiEmbedding.ts")));
ok("the circulars' word search adds the family words", /termFamilyTsTerms\(/.test(src("src/lib/search/semanticPolicySearch.ts")));
ok("the announcements' word search adds the family words, and the coverage test of the typed words is untouched", /termFamilyTsTerms\(/.test(src("src/lib/search/announcementSemanticSearch.ts")) && /return tokens\.length === 1 && n === 1 && tokens\[0\]\.length >= 4;/.test(src("src/lib/search/announcementSemanticSearch.ts")));
ok("the content search's per-word rescue adds them", /termFamilyAdditions\(/.test(src("src/lib/search/semanticContentSearch.ts")));
console.log(`termFamilies selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

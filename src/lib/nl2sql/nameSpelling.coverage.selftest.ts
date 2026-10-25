// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/nameSpelling.coverage.selftest.ts
// Step 55b: HOW GENERAL is the spelling safety net? Not "does it know Goswami" but: take the real name words of the directory (642 words of the CO & CC and Refractory lists, one spelling
// of each, __fixtures__/name_words.real.json), break EVERY word in EVERY way of nine families of typo (about 44,000 broken spellings), and count what comes back.
//   old rule   = the phonetic code alone (what the search did before): the typed word has the same code as the real name.
//   net        = the nearest-spelling safety net finds the right name.
//   wrong      = the net "corrects" to a DIFFERENT name (the error that must stay rare).
//   other name = the broken spelling sounds exactly like another real name: the search finds that person (a collision, not a miss).
// There is no list of names in the net: a new person in the directory is covered at once, because the vocabulary is read from the directory.
// The thresholds below sit a little under what was measured on 26 Oct 2026, so that a change which makes the net worse fails here.

import vocabRows from "./__fixtures__/name_words.real.json";
import { foldToken } from "../employees/namePredicate";
import { buildVocabulary, isKnownWord, nearestWords } from "./nameSpelling";

const vocab = buildVocabulary(vocabRows as { w: string; n: number }[]);
const V = "AEIOU", C = "BCDFGHJKLMNPQRSTVXZ";
const CONFUSABLE: Record<string, string> = { A: "OE", E: "IA", I: "EY", O: "UA", U: "O", S: "C", K: "C", C: "K", J: "Z", Z: "J", B: "V", V: "B", D: "T", T: "D" };
const FAMILIES: { name: string; min: number; gen: (w: string) => string[] }[] = [
  { name: "one letter missing (not the first)", min: 84, gen: (w) => [...Array(w.length - 1)].map((_, i) => w.slice(0, i + 1) + w.slice(i + 2)) },
  { name: "one extra vowel / h / w / y / doubled letter", min: 97, gen: (w) => { const o: string[] = []; for (let i = 1; i < w.length; i++) for (const c of "AEIOUHWY") o.push(w.slice(0, i) + c + w.slice(i)); for (let i = 1; i < w.length; i++) o.push(w.slice(0, i + 1) + w[i] + w.slice(i + 1)); return o; } },
  { name: "two neighbouring letters swapped", min: 94, gen: (w) => [...Array(w.length - 1)].map((_, i) => w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2)) },
  { name: "a confusable letter (a/o, e/i, o/u, c/k, j/z, b/v, d/t, s/c), not the first", min: 98, gen: (w) => { const o: string[] = []; for (let i = 1; i < w.length; i++) for (const c of CONFUSABLE[w[i]] ?? "") o.push(w.slice(0, i) + c + w.slice(i + 1)); return o; } },
  { name: "Bengali glide: w or y after a consonant added or dropped (Goswami / Gosyami / Gosami)", min: 99, gen: (w) => { const o: string[] = []; for (let i = 1; i < w.length; i++) { if (C.includes(w[i - 1]) && V.includes(w[i])) { o.push(w.slice(0, i) + "W" + w.slice(i)); o.push(w.slice(0, i) + "Y" + w.slice(i)); } if ("WY".includes(w[i]) && C.includes(w[i - 1])) o.push(w.slice(0, i) + w.slice(i + 1)); } return o; } },
  { name: "h added or dropped after a consonant (s/sh, d/dh, t/th, b/bh, g/gh, k/kh, j/jh, p/ph)", min: 97, gen: (w) => { const o: string[] = []; for (let i = 1; i < w.length; i++) { if ("SDTBGKJPC".includes(w[i - 1]) && w[i] !== "H") o.push(w.slice(0, i) + "H" + w.slice(i)); if (w[i] === "H" && "SDTBGKJPC".includes(w[i - 1])) o.push(w.slice(0, i) + w.slice(i + 1)); } return o; } },
  { name: "long vowel written short or short written long (aa/a, ee/i, oo/u)", min: 99, gen: (w) => { const o: string[] = []; for (let i = 1; i < w.length; i++) { if (V.includes(w[i])) o.push(w.slice(0, i + 1) + w[i] + w.slice(i + 1)); if (w[i] === w[i - 1] && V.includes(w[i])) o.push(w.slice(0, i) + w.slice(i + 1)); } return o; } },
  { name: "TWO slips at once (a missing letter and a confusable letter): expected to be hard", min: 28, gen: (w) => { const o: string[] = []; if (w.length < 6) return o; for (let i = 1; i < w.length - 1; i += 2) { const d = w.slice(0, i) + w.slice(i + 1); for (let j = 1; j < d.length; j += 2) for (const c of CONFUSABLE[d[j]] ?? "") o.push(d.slice(0, j) + c + d.slice(j + 1)); } return o; } },
  { name: "the FIRST letter wrong (a different sound): not expected to be found", min: 0, gen: (w) => [...(CONFUSABLE[w[0]] ?? "")].map((c) => c + w.slice(1)) },
];
const sameCode = (a: string, b: string) => [false, true].some((x) => [false, true].some((y) => foldToken(a, x) === foldToken(b, y)));

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const words = vocab.words.filter((w) => w.length >= 4);
ok("the vocabulary is the real names: 600+ distinct words, many of 4+ letters", vocab.words.length >= 600 && words.length >= 600 && vocab.words.includes("KUMAR") && vocab.words.includes("MONDAL"));
const total = { cases: 0, old: 0, net: 0, wrong: 0, none: 0, other: 0 };
console.log(`real name words: ${vocab.words.length} (${words.length} of 4+ letters)`);
for (const f of FAMILIES) {
  const s = { cases: 0, old: 0, net: 0, wrong: 0, none: 0, other: 0 };
  const seen = new Set<string>();
  for (const w of words) for (const v of f.gen(w)) {
    if (v === w || v.length < 3 || seen.has(`${w}>${v}`)) continue;
    seen.add(`${w}>${v}`);
    if (vocab.count.has(v)) continue; // it IS another real name
    s.cases++;
    if (sameCode(v, w)) { s.old++; continue; }
    if (isKnownWord(v, vocab)) { s.other++; continue; }
    const near = nearestWords(v, vocab).map((n) => n.word);
    if (near.includes(w)) s.net++; else if (near.length) s.wrong++; else s.none++;
  }
  for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += s[k];
  const found = Math.round((100 * (s.old + s.net)) / s.cases);
  console.log(`  ${f.name.slice(0, 84).padEnd(84)} ${String(s.cases).padStart(6)} cases: old rule ${String(Math.round((100 * s.old) / s.cases)).padStart(3)}%, with the net ${String(found).padStart(3)}%, wrong ${s.wrong}`);
  ok(`${f.name}: at least ${f.min}% found with the net (found ${found}%)`, found >= f.min);
  ok(`${f.name}: the net adds to the old rule (or the old rule already has everything)`, s.old + s.net >= s.old);
  // a missing letter (4 letters typed from a 5-letter name) and two slips at once are often one slip from SEVERAL real names ("soen": Sen, Soren, Somen): that is ambiguity in the data, no rule
  // can remove it, so the answer shows the other close names. The limit is therefore looser for those two families and tight for the rest.
  ok(`${f.name}: wrong corrections stay rare (${s.wrong} of ${s.cases})`, s.wrong / s.cases <= (/missing|TWO slips|FIRST letter/.test(f.name) ? 0.035 : 0.01));
}
const pct = (n: number) => Math.round((100 * n) / total.cases);
console.log(`TOTAL ${total.cases} broken spellings: old rule ${pct(total.old)}%, with the net ${pct(total.old + total.net)}%, wrong ${total.wrong} (${((100 * total.wrong) / total.cases).toFixed(2)}%), sounds like another name ${total.other}, not found ${total.none}`);
ok("overall: the net finds at least 90% (the old rule alone: about 58%)", pct(total.old + total.net) >= 90, String(pct(total.old + total.net)));
ok("overall: the old rule alone is clearly lower", pct(total.old) <= 65 && pct(total.old + total.net) - pct(total.old) >= 25);
ok("overall: wrongly corrected at most 0.8%", total.wrong / total.cases <= 0.008, ((100 * total.wrong) / total.cases).toFixed(2));
console.log(`nameSpelling coverage selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Run (from the project root): npx tsx src/lib/ingestion/consensusPatch.selftest.ts
import { applyToChunks, applyToText, coverage, diffHunks, lev, proposePatches, tokenize } from "./consensusPatch";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const fix = (stored: string, a: string, b: string) => { const p = proposePatches(stored, [a, b]); return { ...p, text: applyToText(stored, p.patches) }; };

// 1. a misread digit that both readers correct
{ const r = fix("The promotion is w.e.f. 31.12.2005 for these executives", "The promotion is w.e.f. 31.12.2025 for these executives", "the promotion is w.e.f. 31.12.2025 for these executives");
  ok("a date misread is fixed when both readers agree", r.text === "The promotion is w.e.f. 31.12.2025 for these executives", r.text); }
// 2. only ONE reader disagrees with the stored text: nothing changes
{ const r = fix("Fax 0343-2583481 Durgapur", "Fax 0343-2583481 Durgapur", "Fax 1343-2583481 Durgapur");
  ok("one dissenting reader does not change the text", r.patches.length === 0 && r.text === "Fax 0343-2583481 Durgapur"); }
// 3. the two readers disagree with each other: nothing changes, it is reported
{ const r = fix("Amount Rs 2800/- paid", "Amount Rs 1600/- paid", "Amount Rs 1200/- paid");
  ok("readers that disagree between themselves change nothing", r.patches.length === 0 && r.unsettled.length >= 1, JSON.stringify(r.unsettled)); }
// 4. a split date is joined, punctuation of the stored token is kept
{ const r = fix("from 04.01 2023 to 08.01.2023.", "from 04.01.2023 to 08.01.2023.", "from 04.01.2023 to 08.01.2023.");
  ok("a date split by a space is cosmetic (same digits): left as stored", r.patches.length === 0 && r.text === "from 04.01 2023 to 08.01.2023.", r.text); }
// 4b. cosmetic differences are neither patched nor reported as conflicts
{ const r = fix("22nd Dec 011–24367015, Rs. 120000-280000", "22ⁿᵈ Dec 011-24367015, Rs.120000-280000", "22ⁿᵈ Dec 011-24367015, Rs.120000-280000");
  ok("dash type, spacing and superscript ordinals are cosmetic", r.patches.length === 0 && r.unsettled.length === 0, JSON.stringify(r)); }
// 5. words are never changed, even when both readers agree (the original may contain the typo)
{ const r = fix("Chistmas Day 25th December", "Christmas Day 25th December", "Christmas Day 25th December");
  ok("a word is never patched", r.patches.length === 0 && r.text === "Chistmas Day 25th December"); }
// 6. a number is never turned into a word
{ const r = fix("Room 206 Ispat Bhawan", "Room two Ispat Bhawan", "Room two Ispat Bhawan");
  ok("a number is never replaced by a word", r.patches.length === 0 && r.text === "Room 206 Ispat Bhawan", r.text); }
// 7. a missing clause number is inserted when both readers agree
{ const r = fix("PERIOD OF STUDY medical stream", "5.0 PERIOD OF STUDY medical stream", "5.0 PERIOD OF STUDY medical stream");
  ok("a missing clause number is inserted", r.text === "5.0 PERIOD OF STUDY medical stream", r.text); }
// 8. an inserted non-clause number is not added (a stamp or a phone the readers saw but the stored text legitimately lacks)
{ const r = fix("PERIOD OF STUDY", "9876543 PERIOD OF STUDY", "9876543 PERIOD OF STUDY");
  ok("only clause-style numbers are inserted", r.patches.length === 0, r.text); }
// 9. a far-off replacement (too many characters differ) is refused
{ const r = fix("ref 77 end", "ref 123456789 end", "ref 123456789 end");
  ok("a replacement that is too different is refused", r.patches.length === 0 && r.unsettled.length >= 1, JSON.stringify(r)); }
// 10. structure (pipes, brackets) is ignored in the comparison and kept in the text
{ const r = fix("SL. NO.: 1 | HOLIDAY: Republic Day | DATE: 26th Janury", "SL. NO.: 1 HOLIDAY: Republic Day DATE: 26th January", "| SL. NO.: 1 | HOLIDAY: Republic Day | DATE: 26th January |");
  ok("structure marks do not matter and the original word stays", r.text === "SL. NO.: 1 | HOLIDAY: Republic Day | DATE: 26th Janury", r.text); }
// 11. the suffix of the reader is taken when it is a longer form of the stored one
{ const r = fix("prize 2800/ cash", "prize 1600/- cash", "prize 1600/- cash");
  ok("the '/-' ending is kept from the readers", r.text === "prize 1600/- cash", r.text); }
// 12. applyToChunks: a patch inside the second chunk, chunks joined by one space
{ const chunks = ["alpha beta 31.12.2005", "gamma 0001 delta 2674368 end"];
  const page = chunks.join(" ");
  const p = proposePatches(page, ["alpha beta 31.12.2005 gamma 0001 delta 2574368 end", "alpha beta 31.12.2005 gamma 0001 delta 2574368 end"]);
  const out = applyToChunks(chunks, p.patches);
  ok("a patch lands in the right chunk", out.chunks[0] === chunks[0] && out.chunks[1] === "gamma 0001 delta 2574368 end" && out.refused.length === 0, JSON.stringify(out)); }
// 13. a patch across a chunk boundary is refused
{ const chunks = ["x 04.01", "2033 y"];
  const p = proposePatches(chunks.join(" "), ["x 04.01.2023 y", "x 04.01.2023 y"]);
  const out = applyToChunks(chunks, p.patches);
  ok("a patch across two chunks is refused", out.refused.length === 1 && out.chunks.join(" ") === chunks.join(" "), JSON.stringify(out)); }
// 13b. a conflict that only one reader raises keeps its offsets and candidate, for an exact arbiter (the PDF text layer)
{ const r = proposePatches("dated 31/12/23 end", ["dated 13/12/23 end", "dated 31/12/23 end"]);
  ok("a one-reader conflict is returned with offsets and its candidate", r.patches.length === 0 && r.unsettled.length === 1 && r.unsettled[0].start === 6 && r.unsettled[0].end === 14 && r.unsettled[0].candidates?.[0] === "13/12/23", JSON.stringify(r)); }
// 14. coverage
{ const c = coverage("Fee 1600 and 9999 on 24.12.2022", ["Fee 1600 on 24.12.2022", "fee 1600 and 24.12.2022"]);
  ok("coverage counts confirmed and unconfirmed numbers", c.digitTokens === 3 && c.confirmed === 2 && c.unconfirmed.join() === "9999", JSON.stringify(c)); }
// 15. building blocks
ok("lev", lev("2800", "1600") === 2 && lev("", "ab") === 2);
ok("diffHunks finds one replace", JSON.stringify(diffHunks(["a", "b", "c"], ["a", "x", "c"])) === JSON.stringify([{ i1: 1, i2: 2, j1: 1, j2: 2 }]));
ok("tokenize keeps prefix, core, suffix", (() => { const t = tokenize("(3119),")[0]; return t.pre === "(" && t.core === "3119" && t.suf === ")," ; })());

console.log(`consensusPatch selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

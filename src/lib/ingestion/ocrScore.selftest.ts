// Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/ocrScore.selftest.ts
import { agreement, hasNumber, scoreText, type Truth } from "./ocrScore";
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };

ok("a number stands alone", hasNumber("WORKS 3350.00 20995.30 808", "808") && !hasNumber("WORKS 1808", "808") && !hasNumber("WORKS 8081", "808"));
ok("commas are ignored", hasNumber("amount Rs.15,000/-", "15000") && hasNumber("amount 15000", "15,000") && !hasNumber("Rs. 5,000", "15,000"));
ok("a decimal is not found inside a longer one", hasNumber("52.00", "52.00") && !hasNumber("152.00", "52.00") && !hasNumber("52.001", "52.00"));
ok("a number made of words and spaces", hasNumber("at 10 00 AM sharp", "10 00") && hasNumber("at 10  00 AM", "10 00") && !hasNumber("at 70 00 AM", "10 00"));
ok("a code with letters", hasNumber("Policy :- 0315054224P110856231", "0315054224P110856231") && !hasNumber("0315054224P11085623", "0315054224P110856231"));
ok("a date with dots or dashes", hasNumber("w.e.f 01.01.2024 dated", "01.01.2024") && hasNumber("दिनांक : 03-08-2026", "03-08-2026"));
ok("an ordinal", hasNumber("on 5th December", "5th") && !hasNumber("on 15th December", "5th"));

const truth: Truth = { id: "t", numbers: ["808", "740", "20995.30"], phrases: ["Daily Wages", "Non-works area"], together: [["WORKS", "808"], ["PROJECTS", "740"]], forbidden: ["27000]"] };
const good = "Daily Wages\nArea: WORKS | TOTAL: 20995.30 | Wages Per Day: 808\nArea: PROJECTS | Wages Per Day: 740\nNon-works area: later";
let s = scoreText(good, truth);
ok("a perfect reading scores everything", s.numbersFound === 3 && s.phrasesFound === 2 && s.togetherFound === 2 && s.forbiddenFound.length === 0 && s.garbage === 0, JSON.stringify(s));
const bad = "Daily Wages\nWORKS 3350.00] 13478.00 20995.30\nPROJECTS 27000] 000] 1924530\nNon works area";
s = scoreText(bad, truth);
ok("the damaged reading of 17 Oct loses the daily wages", s.numbersFound === 1 && s.missingNumbers.join() === "808,740", JSON.stringify(s.missingNumbers));
ok("...fails to bind any label to its value", s.togetherFound === 0 && s.missingTogether.length === 2);
ok("...contains a forbidden reading", s.forbiddenFound.join() === "27000]");
ok("...and grid-line garbage next to digits is counted", s.garbage >= 3, String(s.garbage));
ok("a CORRECT reading never triggers a forbidden one (3350.00 is not 3350.00])", scoreText("WORKS 3350.00 13478.00 270.00 0.00 19245.30 740", { ...truth, forbidden: ["27000]", "1924530", "3350.00]"] }).forbiddenFound.length === 0);
ok("a forbidden reading is found even in the middle of a line, with other spacing", scoreText("PROJECTS 3350.00]  13478.00", { ...truth, forbidden: ["3350.00] 13478.00"] }).forbiddenFound.length === 1);
ok("a label and value on DIFFERENT lines are not 'together'", scoreText("WORKS\n808", truth).togetherFound === 0);
ok("a phrase is matched ignoring case, spaces and punctuation", scoreText("DAILY  wages ... non works AREA", truth).phrasesFound === 2);
ok("Hindi phrases are matched", scoreText("यह प्रीमियम राशि है", { ...truth, phrases: ["प्रीमियम राशि"], numbers: [], together: [], forbidden: [] }).phrasesFound === 1);
const ag = agreement("808 740", "808 20995.30", ["808", "740", "20995.30", "9999"]);
ok("agreement counts both, one only, neither", ag.both === 1 && ag.onlyA === 1 && ag.onlyB === 1 && ag.neither === 1, JSON.stringify(ag));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

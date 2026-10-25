// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/nameSpelling.selftest.ts
// Step 55b: the spelling safety net. A name word no real name is spelled like is replaced by the nearest real spelling when nobody is found; a known word is never touched; a name that is
// simply not in the directory is never turned into somebody else's.

import { buildVocabulary, candidateWords, correctSql, editDistance, isKnownWord, nameLiteralsIn, nearestWords, spellingKey, spellingNote, spellingRetry, withoutGlides } from "./nameSpelling";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const names = ["GOSWAMI", "RUPAK", "KUMAR", "ROY", "DAS", "SARKAR", "MAJUMDAR", "MAJUMDER", "MUKHERJEE", "BHATTACHARYA", "BANERJEE", "CHAKRABORTY", "TAPAN", "SARAN", "SUNIL", "MOHAMMED", "DEBNATH", "SANJAY", "SANJOY", "KARMAKAR", "KARMAKER", "SINGH", "SINHA", "MONDAL", "MANDAL", "ARUP"];
const vocab = buildVocabulary(names.map((w, i) => ({ w, n: 10 - (i % 5) })));
const best = (t: string) => nearestWords(t, vocab).map((n) => n.word);

// ---- the glide rule: w and y after a consonant and before a vowel are silent
ok("Goswami, Goshami, Gosyami, Gosami share one key", new Set(["GOSWAMI", "GOSHAMI", "GOSYAMI", "GOSAMI"].map(spellingKey)).size === 1, JSON.stringify(["GOSWAMI", "GOSHAMI", "GOSYAMI", "GOSAMI"].map(spellingKey)));
ok("Swapan = Sapan, Biswas = Bishwas = Bisas, Dwijen = Dijen, Sandhya = Sandha", spellingKey("SWAPAN") === spellingKey("SAPAN") && spellingKey("BISWAS") === spellingKey("BISHWAS") && spellingKey("BISWAS") === spellingKey("BISAS") && spellingKey("DWIJEN") === spellingKey("DIJEN") && spellingKey("SANDHYA") === spellingKey("SANDHA"));
ok("a w or y at the start of a word, or before a consonant, is kept: Wasim, Yash, Kumari", withoutGlides("WASIM") === "WASIM" && withoutGlides("YASH") === "YASH" && withoutGlides("SWM") === "SWM");
ok("different names do not share a key: Goswami / Banerjee, Tapan / Saran", spellingKey("GOSWAMI") !== spellingKey("BANERJEE") && spellingKey("TAPAN") !== spellingKey("SARAN"));

// ---- the edit distance: one slip, a swapped pair counts as one
ok("edit distance: equal, one slip, a swap, an insertion", editDistance("RUPAK", "RUPAK") === 0 && editDistance("RUPAK", "RUPAC") === 1 && editDistance("RUPAK", "RUPKA") === 1 && editDistance("RUPK", "RUPAK") === 1 && editDistance("ABC", "") === 3);

// ---- the owner's spellings of Goswami (26 Oct 2026)
for (const t of ["gosyami", "gosami", "goshami", "Gosyami", "GOSYAMI"]) ok(`"${t}" is Goswami`, JSON.stringify(best(t)) === '["GOSWAMI"]', JSON.stringify(best(t)));
ok("'gosamy' (the vowel and the glide both off) is Goswami too", JSON.stringify(best("gosamy")) === '["GOSWAMI"]', JSON.stringify(best("gosamy")));
ok("one slip: 'goswmi' (a letter missing) is Goswami", JSON.stringify(best("goswmi")) === '["GOSWAMI"]');
ok("'rupk' and 'rupka' are Rupak", JSON.stringify(best("rupk")) === '["RUPAK"]' && JSON.stringify(best("rupka")) === '["RUPAK"]');
ok("'goswamy', 'gosvami', 'goswamee' are KNOWN: the phonetic search already finds them, nothing is changed", ["goswamy", "gosvami", "goswamee", "gosswami"].every((t) => isKnownWord(t, vocab) && best(t).length === 0));

// ---- what must NOT be corrected
ok("a real word is never 'improved': every word of the directory is known and has no correction", names.every((w) => isKnownWord(w, vocab) && best(w).length === 0));
ok("a short word is never corrected (fewer than 4 letters)", best("roi").length === 0 && best("das") .length === 0 && best("xyz").length === 0);
ok("a different first sound is a different name: 'swapan' is not 'tapan' or 'saran'", best("swapan").length === 0, JSON.stringify(best("swapan")));
ok("a word far from every name stays as it is: 'abcdefgh', 'zzzzzz', 'quentin'", best("abcdefgh").length === 0 && best("zzzzzz").length === 0 && best("quentin").length === 0);
ok("names that are different families are not merged: 'singh' stays known, 'sinha' stays known, 'banerji' goes to Banerjee only", isKnownWord("singh", vocab) && isKnownWord("sinha", vocab) && best("banerjii").every((w) => w === "BANERJEE"));
ok("a tie keeps both candidates (at most three): 'karmakr' is Karmakar or Karmaker", JSON.stringify(best("karmakr").sort()) === '["KARMAKAR","KARMAKER"]', JSON.stringify(best("karmakr")));

// ---- the everyday typos: a missing letter, swapped letters, and not guessing
ok("a missing letter: 'kuma' is Kumar, 'snjay' is Sanjay, 'majumdr' is Majumdar or Majumder (a tie: both kept)", JSON.stringify(best("kuma")) === '["KUMAR"]' && JSON.stringify(best("snjay")) === '["SANJAY"]' && JSON.stringify(best("majumdr").sort()) === '["MAJUMDAR","MAJUMDER"]', JSON.stringify([best("kuma"), best("snjay"), best("majumdr")]));
ok("'sanjy' sounds like Sanjay AND Sanjoy: it is KNOWN (the phonetic search finds both), so the net leaves it alone", isKnownWord("sanjy", vocab) && best("sanjy").length === 0);
ok("two letters swapped: 'rupka' is Rupak, 'sakrar' is Sarkar, 'goswmai' is Goswami", JSON.stringify(best("rupka")) === '["RUPAK"]' && JSON.stringify(best("sakrar")) === '["SARKAR"]' && JSON.stringify(best("goswmai")) === '["GOSWAMI"]', JSON.stringify([best("rupka"), best("sakrar"), best("goswmai")]));
ok("the first two letters swapped is one slip too: 'raup' is Arup", JSON.stringify(best("raup")) === '["ARUP"]', JSON.stringify(best("raup")));
ok("but any other change of the first letter is a different name: 'sarup' is not 'arup'", !best("sarup").includes("ARUP"));
const crowded = buildVocabulary(["BALAN", "BULAN", "BELAN", "BILAN", "BOLAN"].map((w) => ({ w, n: 1 })));
ok("equally near to MORE than three names: nothing is guessed", nearestWords("bxlan", crowded).length === 0, JSON.stringify(nearestWords("bxlan", crowded)));

// ---- the other close names are shown too (a word one slip from SEVERAL names is a guess: the person sees what else could have been meant)
const vClose = buildVocabulary([{ w: "SOMEN", n: 9 }, { w: "SOREN", n: 4 }, { w: "SOMAN", n: 2 }, { w: "SEN", n: 30 }]);
ok("candidateWords lists everything that could be meant, the best first: 'soen' is SEN, then SOMEN and SOREN", JSON.stringify(candidateWords("soen", vClose).map((n) => n.word)) === '["SEN","SOMEN","SOREN"]', JSON.stringify(candidateWords("soen", vClose).map((n) => n.word)));
ok("...but only the best is searched: nearestWords('soen') is SEN", JSON.stringify(nearestWords("soen", vClose).map((n) => n.word)) === '["SEN"]');
const closeSql = correctSql("SELECT ticket_no FROM nlq.employees WHERE nlq.last_word_like(name_words, name_codes, 'soen')", vClose);
ok("the corrected SQL searches SEN only; SOMEN and SOREN are only named in the note", !!closeSql && closeSql.sql.includes("'SEN'") && !closeSql.sql.includes("SOMEN") && !closeSql.sql.includes("SOREN") && JSON.stringify(closeSql.changes) === '[{"typed":"soen","corrected":["SEN"],"alsoClose":["SOMEN","SOREN"]}]', JSON.stringify(closeSql?.changes));
ok("the note says so: 'also close: Somen or Soren'", !!closeSql && spellingNote(closeSql.changes) === "No name is spelled “Soen” (nearest: Sen; also close: Somen or Soren): showing the nearest real spelling instead.", closeSql ? spellingNote(closeSql.changes) : "");
ok("a tie is searched in full and has nothing 'also close' to add: 'somn' is Somen or Soman", JSON.stringify(correctSql("SELECT 1 WHERE nlq.last_word_like(name_words, name_codes, 'somn')", vClose)?.changes) === '[{"typed":"somn","corrected":["SOMEN","SOMAN"],"alsoClose":[]}]');
ok("an unknown word with only one candidate has nothing 'also close': 'gosyami'", correctSql("SELECT 1 WHERE nlq.last_word_like(name_words, name_codes, 'Gosyami')", vocab)?.changes[0].alsoClose.length === 0);

// ---- the name words inside the model's SQL
const SQL = "SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE nlq.first_word_like(name_words, name_codes, 'Rupak') AND nlq.last_word_like(name_words, name_codes, 'Gosyami') ORDER BY global_seniority_rank";
const lits = nameLiteralsIn(SQL);
ok("the two helper calls are found, with their words", lits.length === 2 && lits[0].literal === "Rupak" && lits[1].literal === "Gosyami" && SQL.slice(lits[1].start, lits[1].end) === lits[1].text);
ok("all three helpers and the exact form are found", nameLiteralsIn("WHERE nlq.word_like(name_words, name_codes, 'a') AND nlq.first_word_like(e.name_words, e.name_codes, 'b') AND nlq.last_word_like(name_words, name_codes, 'c') AND 'D' = ANY(name_words)").map((l) => l.literal).join(",") === "a,b,c,D");
ok("SQL with no name word has nothing to correct", nameLiteralsIn("SELECT count(*) FROM nlq.employees WHERE cohort = 'executive'").length === 0 && correctSql("SELECT 1", vocab) === null);

// ---- the corrected SQL
let fixed = correctSql(SQL, vocab);
ok("'Gosyami' becomes GOSWAMI; 'Rupak' (known) is untouched; the rest of the SQL is the same", !!fixed && fixed.sql === SQL.replace("'Gosyami'", "'GOSWAMI'") && fixed.changes.length === 1 && fixed.changes[0].typed === "Gosyami" && fixed.changes[0].corrected[0] === "GOSWAMI", fixed?.sql);
fixed = correctSql(SQL.replace("'Rupak'", "'Rupk'").replace("'Gosyami'", "'Gosami'"), vocab);
ok("two unknown words are both corrected: 'Rupk' -> RUPAK, 'Gosami' -> GOSWAMI", !!fixed && fixed.sql.includes("first_word_like(name_words, name_codes, 'RUPAK')") && fixed.sql.includes("last_word_like(name_words, name_codes, 'GOSWAMI')") && fixed.changes.length === 2);
fixed = correctSql("SELECT ticket_no FROM nlq.employees WHERE nlq.last_word_like(name_words, name_codes, 'karmakr')", vocab);
ok("a tie becomes an OR of the candidates, each in its own call", !!fixed && /\(nlq\.last_word_like\(name_words, name_codes, 'KARMAK(?:AR|ER)'\) OR nlq\.last_word_like\(name_words, name_codes, 'KARMAK(?:AR|ER)'\)\)/.test(fixed.sql) && fixed.sql.includes("'KARMAKAR'") && fixed.sql.includes("'KARMAKER'"), fixed?.sql);
fixed = correctSql("SELECT ticket_no FROM nlq.employees WHERE 'GOSYAMI' = ANY(name_words)", vocab);
ok("the exact form 'X' = ANY(name_words) is corrected too", !!fixed && fixed.sql === "SELECT ticket_no FROM nlq.employees WHERE 'GOSWAMI' = ANY(name_words)", fixed?.sql);
ok("a known word, a short word and a word with a space are left alone (nothing to correct: null)", correctSql("WHERE nlq.last_word_like(name_words, name_codes, 'Goswami') AND nlq.word_like(name_words, name_codes, 'roy') AND nlq.word_like(name_words, name_codes, 'rupak gosyami')", vocab) === null);
ok("the corrected SQL still has exactly the shape the guard expects (one SELECT, no semicolon or comment)", !!correctSql(SQL, vocab) && !/;|--|\/\*/.test(correctSql(SQL, vocab)!.sql));

// ---- the sentence under the answer
ok("the note names the typed word and the nearest spelling", spellingNote([{ typed: "gosyami", corrected: ["GOSWAMI"], alsoClose: [] }]) === "No name is spelled “Gosyami” (nearest: Goswami): showing the nearest real spelling instead.", spellingNote([{ typed: "gosyami", corrected: ["GOSWAMI"], alsoClose: [] }]));
ok("two words, and a tie", spellingNote([{ typed: "rupk", corrected: ["RUPAK"], alsoClose: [] }, { typed: "karmakr", corrected: ["KARMAKAR", "KARMAKER"], alsoClose: [] }]) === "No name is spelled “Rupk” (nearest: Rupak) or “Karmakr” (nearest: Karmakar or Karmaker): showing the nearest real spellings instead.");

// ---- the second search needs nothing from the database when there is nothing to correct
(async () => {
  const noDb = { withClient: async () => { throw new Error("the database must not be touched"); } } as never;
  ok("no name word in the SQL: no search, no database", (await spellingRetry("SELECT count(*) FROM nlq.employees", noDb)) === null);
  let failed = false;
  try { await spellingRetry(SQL, noDb); } catch { failed = true; }
  ok("a name word in the SQL needs the directory's names: a database failure surfaces (the pipeline then keeps the first answer)", failed);
  console.log(`nameSpelling selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

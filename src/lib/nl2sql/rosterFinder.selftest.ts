// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/nl2sql/rosterFinder.selftest.ts </dev/null
import { planFinder, nameWords, finderUnderstoodAs } from "./rosterFinder";
import { guardSql } from "./guard";
import { stableOrderSql } from "./paging";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };

const p = (i: Parameters<typeof planFinder>[0]) => planFinder(i);
const sqlOf = (i: Parameters<typeof planFinder>[0]) => { const r = p(i); return r.ok ? r.sql : ""; };

ok("a department alone", /WHERE department_id = 12 ORDER BY global_seniority_rank$/.test(sqlOf({ departmentId: 12 })));
ok("a designation alone", /WHERE grade_id = 7 ORDER BY/.test(sqlOf({ gradeId: 7 })));
ok("both are combined with AND", /WHERE department_id = 12 AND grade_id = 7 ORDER BY/.test(sqlOf({ departmentId: 12, gradeId: 7 })));
ok("a name narrows with the phonetic helper, one per word", /nlq\.word_like\(name_words, name_codes, 'roy'\) AND nlq\.word_like\(name_words, name_codes, 'sanjay'\)/.test(sqlOf({ departmentId: 3, name: "Roy Sanjay" })));
ok("nothing picked and nothing typed is refused with a sentence", (() => { const r = p({}); return !r.ok && /Pick a department/.test(r.reason); })());
ok("ids come as numbers or digit strings only; anything else is refused", !p({ departmentId: "1; DROP TABLE x" as unknown as number }).ok && !p({ gradeId: -3 }).ok && !p({ gradeId: 1.5 }).ok && !p({ departmentId: 0 }).ok && p({ departmentId: "12" as unknown as number }).ok);
ok("a name is letters only: quotes, semicolons and comments never reach the SQL", (() => { const s = sqlOf({ name: "o'brien'); DROP TABLE x; --" }); return s.includes("'brien'") && !s.includes(";") && !s.includes("--") && !/DROP/.test(s.replace(/'drop'/i, "")); })());
ok("name words: at most 4, each 2 to 30 letters; Bengali and Hindi letters are kept", nameWords("a b c d e f g h").length === 0 && nameWords("one two three four five six").length === 4 && nameWords("গৌতম").length === 1 && nameWords("x".repeat(31)).length === 0);
ok("every plan passes the real SQL guard and has a stable total order for paging", [{ departmentId: 5 }, { gradeId: 9 }, { departmentId: 5, gradeId: 9, name: "dutta" }].every((i) => { const s = sqlOf(i); return guardSql(s).ok && stableOrderSql(s) !== null; }));
ok("the SQL selects the columns the people cards need", /^SELECT ticket_no, name, designation, department_code, department, global_seniority_rank FROM nlq\.employees/.test(sqlOf({ gradeId: 1 })));
ok("the sentence says what was listed", /Asst\. General Manager in C&IT, in seniority order/.test(finderUnderstoodAs({ gradeTitle: "Asst. General Manager", departmentName: "C&IT" })) && /^Employees in Blast Furnace/.test(finderUnderstoodAs({ departmentName: "Blast Furnace" })) && /name like "roy"/.test(finderUnderstoodAs({ name: "roy" })));
console.log(`rosterFinder: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

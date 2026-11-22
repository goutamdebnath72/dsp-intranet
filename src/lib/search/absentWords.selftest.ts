// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/search/absentWords.selftest.ts </dev/null
import { absentWords, judgeAbsent } from "./absentWords";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };

// the owner's case: "LTC rules": ltc is in no document, rules is
const a = judgeAbsent(["ltc", "rules"], ["ltc"]);
ok("'ltc rules': half the words are in no document -> nothing is shown, the sentence names LTC", a.nothing && !a.partial && /mentions “LTC”/.test(a.sentence) && /choose Everything/.test(a.sentence), a.sentence);
const b = judgeAbsent(["leave", "policy", "xyzzy"], ["xyzzy"]);
ok("one word of three is in no document -> the results stay, with a note", !b.nothing && b.partial && /mentions “xyzzy”; the results below match the rest/.test(b.sentence), b.sentence);
const c = judgeAbsent(["medical", "reimbursement"], []);
ok("every word is somewhere -> nothing is said", !c.nothing && !c.partial && c.sentence === "");
ok("two absent words of two -> nothing is shown, both are named", (() => { const v = judgeAbsent(["ltc", "gaynea"], ["ltc", "gaynea"]); return v.nothing && /“LTC”, “gaynea”/.test(v.sentence); })());
ok("no words, or no absent word, is quiet and never throws", !judgeAbsent([], ["x"]).nothing && !judgeAbsent(["a"], []).nothing);
ok("a repeated word counts once", judgeAbsent(["ltc", "ltc", "rules", "rules"], ["ltc"]).nothing);

(async () => {
  // the lookup: a fake data source that answers like the real query
  const present = new Set(["rules", "leave"]);
  let calls = 0;
  const ds = { query: async (_sql: string, params: unknown[]) => { calls++; return (params[0] as string[]).map((t) => ({ tok: t, present: present.has(t) })); } } as never;
  ok("absentWords names the words that are nowhere", JSON.stringify(await absentWords(ds, ["LTC", "rules", "leave"])) === JSON.stringify(["ltc"]));
  const before = calls;
  await absentWords(ds, ["ltc", "rules"]);
  ok("a word asked again within ten minutes is not asked of the database again", calls === before);
  ok("words shorter than three letters are never judged", (await absentWords(ds, ["of", "to"])).length === 0);
  const broken = { query: async () => { throw new Error("db down"); } } as never;
  ok("when the lookup fails nothing is claimed (the search goes on as it always did)", (await absentWords(broken, ["zzzqqq"])).length === 0);
  let seen = "";
  const spy = { query: async (_s: string, p: unknown[]) => { seen = String((p[0] as string[])[0]); return [{ tok: seen, present: true }]; } } as never;
  await absentWords(spy, ["ab%_cd"]);
  ok("a percent or underscore in a word cannot widen the pattern", seen === "abcd", seen);
  console.log(`absentWords: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/search/nameSearchGate.selftest.ts
// Step 61a: the people name search runs for what can be a name, and not for a sentence (ledger item 32).

import { readFileSync } from "node:fs";
import { looksLikeNameSearch } from "./nameSearchGate";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

// what the name search is FOR (the owner's own kinds of query)
for (const q of ["kumar", "Sanjay Debnath", "mohd anwar ullah", "soumit c&it", "c&it roy", "ray", "BHATTACHARYA", "mazumdar", "koyeli bhattacharya", "sunil kumar das", "490130", "chrd", "cl&d", "dr rajeev kumar", "Roy Chowdhury", "kumar das"])
  ok(`a name or a name and a department: "${q}" runs the name search`, looksLikeNameSearch(q) === true);

// what it is NOT for: the sentences of the owner's log (they were the wasted call, 1.2 to 7 s each)
for (const q of [
  "list the employees of the centre for human resource development", "how many people work in learning and development.", "Type chrd or centre for learning and development.", "list the employees of chrd", "list the employees of CL&D",
  "list the employees of L and D", "list the employees of bhilai chrd", "how many people work in human resource", "list the doctors having post graduate degree on medicine.", "how many doctors are post graduate?", "is dr kunj bihari singh post graduate?",
  "super speciality doctors.", "specialisation of dr rajeev kumar.", "is dr rajeev kumar a MD doctor?", "who is more senior, Mohd Anwar Ullah or Rana Saha", "find the names which end with kumar", "which department has the most executives",
  "how many executives and non-executives work in each section of C&IT", "what is the leave policy for contract workers", "is 24 November 2026 a holiday?", "holiday list 2024", "when is the health check-up of ticket 266288", "who has the health check-up on 5 January 2026",
  "what are the post graduate degrees in engineering", "show me the five most senior executives", "give me the list of doctors", "tell me about mediclaim", "name the PhD holders", "all executives", "any executive in chrd",
])
  ok(`a sentence: "${q.slice(0, 54)}" does NOT run the name search`, looksLikeNameSearch(q) === false);

ok("a question mark is never a name", looksLikeNameSearch("sanjay debnath?") === false);
ok("five words are too many for a name (four are the limit)", looksLikeNameSearch("one two three four five") === false && looksLikeNameSearch("one two three four") === true);
ok("empty, one letter, spaces: no", looksLikeNameSearch("") === false && looksLikeNameSearch("a") === false && looksLikeNameSearch("   ") === false);
ok("'Name' as the first word of a sentence is a command, 'name' inside is not ('kumar name')", looksLikeNameSearch("name the employees") === false && looksLikeNameSearch("kumar name") === true);
ok("a name that merely STARTS like a command word ('Listan', 'Whosan') is still a name", looksLikeNameSearch("Listan Roy") === true && looksLikeNameSearch("Whosan") === true);

// the modal really asks the gate before it starts the name search
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("OmnibarModal starts the name search only when looksLikeNameSearch(query) is true", modal.includes("query.trim().length >= 2 && looksLikeNameSearch(query)") && modal.includes('from "@/lib/search/nameSearchGate"'));
ok("...and the other searches of the Enter key are untouched (triggerSearch(\"semantic\") still runs for every question)", modal.includes('triggerSearch("semantic");'));
console.log(`nameSearchGate selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

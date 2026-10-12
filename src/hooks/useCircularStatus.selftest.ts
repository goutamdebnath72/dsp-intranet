// src/hooks/useCircularStatus.selftest.ts
// Run:  npx tsx src/hooks/useCircularStatus.selftest.ts      (the hook itself needs a browser; this tests the rule it applies)
import { mergeUnread } from "./useCircularStatus";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

check("nothing opened: the server's list as it is", JSON.stringify(mergeUnread([3, 5, 9], new Set())) === "[3,5,9]");
check("a circular just opened is taken out (its read is still being saved: an older server answer must not bring it back)", JSON.stringify(mergeUnread([3, 5, 9], new Set([5]))) === "[3,9]");
check("two just opened", JSON.stringify(mergeUnread([3, 5, 9], new Set([3, 9]))) === "[5]");
check("an id the server does not list is ignored", JSON.stringify(mergeUnread([3], new Set([7]))) === "[3]");
check("everything opened: nothing is new", mergeUnread([3, 5], new Set([3, 5])).length === 0);
check("an empty server list stays empty", mergeUnread([], new Set([1])).length === 0);
const input = [1, 2, 3];
mergeUnread(input, new Set([2]));
check("the server's list itself is never changed", JSON.stringify(input) === "[1,2,3]");

console.log(`\nuseCircularStatus selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

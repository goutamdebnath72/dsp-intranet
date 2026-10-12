// src/hooks/useCircularStatus.selftest.ts
// Run:  npx tsx src/hooks/useCircularStatus.selftest.ts      (the hook itself needs a browser; this tests the rule it applies)
import { initialUnread, mergeUnread, seedFor } from "./useCircularStatus";

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


// what a logged-out visitor sees before the server has answered: the server's list of recent circulars
check("logged out + a list from the server: show that list at once", JSON.stringify(seedFor("unauthenticated", [4, 7], false)) === "[4,7]");
check("...the list handed back is a copy (the server's own array is never changed)", (() => { const seed = [4, 7]; const out = seedFor("unauthenticated", seed, false); out?.push(9); return seed.length === 2; })());
check("logged out + an empty list: nothing new to show", JSON.stringify(seedFor("unauthenticated", [], false)) === "[]");
check("LOGGED IN: never shown early (their list needs their own answer; a wrong number must not flash)", seedFor("authenticated", [4, 7], false) === null);
check("not yet known who is looking: nothing early", seedFor("loading", [4, 7], false) === null);
check("a real answer has already arrived: the early list is never used again", seedFor("unauthenticated", [4, 7], true) === null);
check("no list from the server (it failed, or an old page): nothing early", seedFor("unauthenticated", null, false) === null && seedFor("unauthenticated", undefined, false) === null);


// what the page STARTS with (it is part of the first HTML, before any script runs)
check("no login cookie at all (certainly logged out) + a list: the page starts with that list", JSON.stringify(initialUnread([4, 7], true)) === "[4,7]");
check("a login cookie exists (anyone might be behind it): the page starts with nothing", JSON.stringify(initialUnread([4, 7], false)) === "[]");
check("certainly logged out but no list from the server: nothing", JSON.stringify(initialUnread(null, true)) === "[]" && JSON.stringify(initialUnread(undefined, true)) === "[]");
check("the starting list is a copy", (() => { const seed = [4, 7]; const out = initialUnread(seed, true); out.push(9); return seed.length === 2; })());

console.log(`\nuseCircularStatus selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

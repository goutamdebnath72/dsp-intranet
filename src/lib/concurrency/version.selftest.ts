// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/concurrency/version.selftest.ts
// Step 67b: the version token of a record. Pure.

import { sameVersion, versionOf, versionSecret } from "./version";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const S = "test-secret";

const base = versionOf("employee", [7, "D107659", "RAKESH OJHA", 5, 1, 2, "Sector 2", null, "", true, "9434791111", "r@x.in"], S);
ok("the token is short, URL-safe text of fixed length", /^[A-Za-z0-9_-]{22}$/.test(base));
ok("the same fields give the same token, always", base === versionOf("employee", [7, "D107659", "RAKESH OJHA", 5, 1, 2, "Sector 2", null, "", true, "9434791111", "r@x.in"], S));
ok("a change of ANY one field changes the token", (() => { const f = [7, "D107659", "RAKESH OJHA", 5, 1, 2, "Sector 2", null, "", true, "9434791111", "r@x.in"]; return f.every((_, i) => { const g = [...f]; g[i] = typeof g[i] === "number" ? (g[i] as number) + 1 : g[i] === null ? "x" : g[i] === true ? false : `${g[i]}x`; return versionOf("employee", g, S) !== base; }); })());
ok("the last digits of a mobile number matter (the token notices a changed number the screen only shows masked)", versionOf("employee", ["9434791111"], S) !== versionOf("employee", ["9434791112"], S));
ok("'nothing' and 'an empty text' are different; 5 and '5' are the same (numbers are written as text)", versionOf("e", [null], S) !== versionOf("e", [""], S) && versionOf("e", [undefined], S) === versionOf("e", [null], S) && versionOf("e", [5], S) === versionOf("e", ["5"], S));
ok("the ORDER of the fields matters", versionOf("e", ["a", "b"], S) !== versionOf("e", ["b", "a"], S));
ok("fields cannot be run together to give another record's token ('ab','c' is not 'a','bc')", versionOf("e", ["ab", "c"], S) !== versionOf("e", ["a", "bc"], S));
ok("a token of one kind of record is never another kind's (employee, pax)", versionOf("employee", [1, "x"], S) !== versionOf("pax", [1, "x"], S));
ok("without the server's secret nobody can work a token out: another secret gives another token", versionOf("employee", [1, "x"], "other-secret") !== versionOf("employee", [1, "x"], S));
ok("the token does not contain what it was made from (no field, no mobile number in it)", !versionOf("employee", ["9434791111", "RAKESH"], S).includes("9434791111") && !versionOf("employee", ["9434791111", "RAKESH"], S).includes("RAKESH"));
ok("sameVersion: yes for the same token; no for another, for nothing, for a number, for a token cut short or made longer", sameVersion(base, base) && !sameVersion("x".repeat(22), base) && !sameVersion(undefined, base) && !sameVersion(null, base) && !sameVersion(12345, base) && !sameVersion(base.slice(1), base) && !sameVersion(base + "a", base) && !sameVersion("", base));
const keep = { a: process.env.NEXTAUTH_SECRET, b: process.env.AUTH_SECRET, c: process.env.RECORD_VERSION_SECRET };
delete process.env.NEXTAUTH_SECRET; delete process.env.AUTH_SECRET; delete process.env.RECORD_VERSION_SECRET;
const fallback = versionSecret();
process.env.NEXTAUTH_SECRET = "from-env";
const fromEnv = versionSecret();
if (keep.a === undefined) delete process.env.NEXTAUTH_SECRET; else process.env.NEXTAUTH_SECRET = keep.a;
if (keep.b !== undefined) process.env.AUTH_SECRET = keep.b; if (keep.c !== undefined) process.env.RECORD_VERSION_SECRET = keep.c;
ok("the secret is NextAuth's own (NEXTAUTH_SECRET); with none, a fixed development text, never an empty one", fromEnv === "from-env" && fallback.length > 10);
ok("with the default secret the token works the same way", versionOf("employee", [1, "x"]) === versionOf("employee", [1, "x"]) && versionOf("employee", [1, "x"]) !== versionOf("employee", [2, "x"]));

console.log(`version selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

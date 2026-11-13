// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/buildGuards.selftest.ts
// WHAT THE TYPE CHECK AND THE TESTS DO NOT SEE BUT THE BUILD DOES. Next's compiler (SWC) reads "x as string <= y" as the start of a generic type ("string<...>") and stops the build with "Expression expected",
// while tsc and the test runner accept it. This happened once on 13 Nov 2026 (a build error on the owner's running server), so the pattern is looked for in every source file: a cast followed by < or > must be in brackets,
// "(x as string) <= y".
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk("src").filter((p) => /\.(ts|tsx)$/.test(p) && !p.endsWith("buildGuards.selftest.ts"));
// a cast to a PRIMITIVE type (string, number, boolean, bigint, any, unknown) followed by < or >: those types take no type arguments, so the only way to read it is as a comparison, which SWC does not do
const BAD = /\bas\s+(string|number|boolean|bigint|any|unknown)\s*(<|>)/;
const offenders: string[] = [];
for (const p of files) {
  readFileSync(p, "utf8").split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "").replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
    if (BAD.test(code)) offenders.push(`${p}:${i + 1}: ${line.trim().slice(0, 120)}`);
  });
}
ok("no source file has an unbracketed cast followed by a comparison (the build would stop on it)", offenders.length === 0, offenders.join("\n"));
const sample = (s: string) => BAD.test(s.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""'));
ok("the check catches the mistake that was made, and lets the bracketed form and real generics through", sample("for (; q.toISODate() as string <= next; ) {") && sample("if (a as number > b) {") && !sample("for (; (q.toISODate() as string) <= next; ) {") && !sample("const m = x as Array<number>;") && !sample("const t = y as ReturnType<typeof setTimeout>;") && !sample("const v = z as Extract<ToolHit, { kind: K }>;"));

console.log(`buildGuards: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

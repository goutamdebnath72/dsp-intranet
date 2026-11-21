// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/pdf/plainBytes.selftest.ts
// pdf-parse's old pdf.js fails at random on Node 24 when it is given a Node Buffer; plainBytes() hands it a plain copy (see plainBytes.ts). This checks the helper, that every caller of pdf-parse uses it,
// and that real reads through it succeed (24 of 24), on whatever Node runs the test.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { plainBytes } from "./plainBytes";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const buf = Buffer.from([1, 2, 3, 4, 5]);
const out = plainBytes(buf);
ok("the copy is a plain Uint8Array, not a Buffer, with the same bytes", out instanceof Uint8Array && !Buffer.isBuffer(out) && Array.from(out).join() === "1,2,3,4,5");
out[0] = 99;
ok("it is a copy: changing it leaves the original alone", buf[0] === 1);
ok("an empty input gives an empty copy", plainBytes(Buffer.alloc(0)).length === 0);

// every file that loads pdf-parse reads through plainBytes()
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.selftest\./.test(n) && !/\.d\.ts$/.test(n) ? [p] : []; });
const callers = walk("src").filter((p) => /import\(\s*["']pdf-parse/.test(readFileSync(p, "utf8")));
ok("the places that load pdf-parse are the three known ones (a new one must be added here and use plainBytes)", callers.length === 3 && ["src/app/api/circulars/route.ts", "src/app/api/live/fuel-trend/route.ts", "src/lib/announcements/searchIndex/reader.ts"].every((c) => callers.includes(c)), callers.join(", "));
for (const c of callers) {
  const s = readFileSync(c, "utf8");
  const calls = (s.match(/(parseFn|parse|mod\.default|pdfParse)\(plainBytes\(/g) ?? []).length;
  const raw = (s.match(/(parseFn|mod\.default)\((?!plainBytes)/g) ?? []).length;
  ok(`${c}: every pdf-parse call is given plainBytes(...)`, calls >= 1 && raw === 0, `calls=${calls} raw=${raw}`);
}

// real reads
(async () => {
  const fixture = readFileSync("src/lib/announcements/searchIndex/__fixtures__/true.pdf");
  const mod: any = await import("pdf-parse");
  const parse = mod?.default ?? mod;
  let good = 0; const msgs = new Set<string>();
  for (let i = 0; i < 24; i++) {
    try { const r = await parse(plainBytes(readFileSync("src/lib/announcements/searchIndex/__fixtures__/true.pdf"))); if (r.numpages === 2 && /Internal Committee/.test(r.text)) good++; } catch (e) { msgs.add((e as Error).message); }
  }
  ok("24 reads of the test PDF through plainBytes() all give both pages and the text", good === 24, `${good}/24 ${[...msgs].join(" / ")}`);
  void fixture;
  console.log(`plainBytes selftest (node ${process.version}): ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

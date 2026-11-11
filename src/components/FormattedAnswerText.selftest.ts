// Run with: npx tsx --tsconfig tsconfig.selftest.json src/components/FormattedAnswerText.selftest.ts
import { parseSegments, getBadgeStyle } from "./FormattedAnswerText";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.error(`FAIL: ${name}`, extra); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

// Test 1: C&IT breakdown
{
  const segs = parseSegments(" 18 executives and 7 non-executives.");
  eq("C&IT segments count", segs.length, 5);
  eq("C&IT first metric", segs[1], { type: "metric", num: "18", category: "executives" });
  eq("C&IT second metric", segs[3], { type: "metric", num: "7", category: "non-executives" });
}

// Test 2: Hospital breakdown
{
  const segs = parseSegments(" 40 doctors and 23 non-medical.");
  eq("Hospital segments count", segs.length, 5);
  eq("Hospital first metric", segs[1], { type: "metric", num: "40", category: "doctors" });
  eq("Hospital second metric", segs[3], { type: "metric", num: "23", category: "non-medical" });
}

// Test 3: Compound hospital breakdown
{
  const segs = parseSegments(" 10 executives (6 doctors and 4 non-medical) and 2 non-executives.");
  const metrics = segs.filter((s) => s.type === "metric");
  eq("Compound hospital metric count", metrics.length, 4);
  eq("Compound metrics numbers", metrics.map((m: any) => m.num), ["10", "6", "4", "2"]);
}

// Test 4: Badge styles are distinct
{
  const execStyle = getBadgeStyle("executives");
  const nonExecStyle = getBadgeStyle("non-executives");
  const doctorStyle = getBadgeStyle("doctors");

  ok("exec badge is amber", execStyle.badge.includes("amber"));
  ok("non-exec badge is slate", nonExecStyle.badge.includes("slate"));
  ok("doctor badge is teal", doctorStyle.badge.includes("teal"));
  ok("exec and non-exec badges have different colors", execStyle.badge !== nonExecStyle.badge);
}

// Test 5: Plain text with no metrics
{
  const segs = parseSegments(" no numbers here");
  eq("No metrics", segs, [{ type: "text", value: " no numbers here" }]);
}

console.log(`FormattedAnswerText selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

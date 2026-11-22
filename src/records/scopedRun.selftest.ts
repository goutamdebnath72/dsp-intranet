// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/records/scopedRun.selftest.ts </dev/null
// The fixed selections through the REAL runOmnibar with spying engines: a chosen selection runs only its own paths, on the line made its own; "Everything" runs them all in the old order; a chosen
// selection that finds nothing returns null (the route then says "nothing found under ..." and never goes to the circulars).

import { runOmnibar, type OmnibarDeps } from "@/lib/nl2sql/omnibar";
import type { ScopeId } from "./types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };

const calls: string[] = [];
const payload = (answer: string) => ({ kind: "count" as const, answer });
const mk = (scope: ScopeId, answers: Partial<Record<"pax" | "hospital" | "holiday", string | null>> = {}): OmnibarDeps => ({
  enabled: true,
  scope,
  llm: (async () => { calls.push("model"); throw new Error("model off in this test"); }) as never,
  withClient: (async () => { calls.push("db"); throw new Error("db off in this test"); }) as never,
  holiday: async (q) => { calls.push(`holiday:${q}`); return answers.holiday ? payload(answers.holiday) : null; },
  hospital: async (q) => { calls.push(`hospital:${q}`); return answers.hospital ? payload(answers.hospital) : null; },
  pax: async (q) => { calls.push(`pax:${q}`); return answers.pax ? payload(answers.pax) : null; },
  dates: async () => { calls.push("dates"); return null; },
  managementHub: async (q) => { calls.push(`hub:${q}`); return null; },
  employeeAdmin: async () => { calls.push("employeeAdmin"); return null; },
  legacy: async () => { calls.push("legacy"); return null; },
  verifiedMin: 2,
});
const run = async (scope: ScopeId, q: string, answers?: Parameters<typeof mk>[1]) => { calls.length = 0; const r: any = await runOmnibar(q, "T", mk(scope, answers)).catch(() => null); return { r, calls: [...calls] }; };
const only = (c: string[], ...allowed: string[]) => c.every((x) => allowed.some((a) => x === a || x.startsWith(`${a}:`)));

(async () => {
  // PAX
  let x = await run("pax", "fire service", { pax: "42046" });
  ok("PAX: the line is made its own ('pax number of ...') and the PAX path answers", x.calls.includes("pax:pax number of fire service") && x.r?.answer === "42046");
  ok("PAX: no hospital, holiday, dates, model or database call", only(x.calls, "hub", "employeeAdmin", "pax"), x.calls.join(" | "));
  x = await run("pax", "nothing like this", {});
  ok("PAX: nothing found returns null, and still no model or other path", x.r === null && only(x.calls, "hub", "employeeAdmin", "pax"), `${JSON.stringify(x.r)} ${x.calls.join(" | ")}`);

  // Hospital
  x = await run("hospital", "medicine", { hospital: "Medicine OPD" });
  ok("Hospital: the cue 'opd' is added and only the hospital path runs", x.calls.includes("hospital:medicine opd") && only(x.calls, "hub", "employeeAdmin", "hospital") && x.r?.answer === "Medicine OPD", x.calls.join(" | "));

  // Holidays
  x = await run("holidays", "diwali 2026", { holiday: "Diwali is on ..." });
  ok("Holidays: the line as typed is tried first and answers, so nothing else is tried; only the holiday path runs", x.calls.filter((c) => c.startsWith("holiday:")).join() === "holiday:diwali 2026" && only(x.calls, "hub", "employeeAdmin", "holiday"), x.calls.join(" | "));
  x = await run("holidays", "durga puja 2026", {});
  ok("Holidays: when the line as typed finds nothing, 'when is ...' is tried next, then it gives up (null, no model)", x.calls.filter((c) => c.startsWith("holiday:")).join() === "holiday:durga puja 2026,holiday:when is durga puja 2026" && x.r === null && only(x.calls, "hub", "employeeAdmin", "holiday"), x.calls.join(" | "));

  // Degrees: the real table, no engine of ours is called
  x = await run("degrees", "mtech");
  ok("Degrees: 'mtech' becomes 'what is mtech' and the table of degrees answers it, with no model, database or other path", /postgraduate/i.test(JSON.stringify(x.r ?? {})) && only(x.calls, "hub", "employeeAdmin"), x.calls.join(" | ") + JSON.stringify(x.r)?.slice(0, 120));

  // Degrees: the degrees of the doctors reach the hospital's list of doctors and qualifications, and NOTHING else of the hospital does
  x = await run("degrees", "list the degrees of the doctors", { hospital: "Doctors and their qualifications" });
  ok("Degrees: 'list the degrees of the doctors' is given to the hospital engine as typed, and answered; no other path runs", x.calls.includes("hospital:list the degrees of the doctors") && x.r?.answer === "Doctors and their qualifications" && only(x.calls, "hub", "employeeAdmin", "hospital"), x.calls.join(" | "));
  x = await run("degrees", "is opd open today", { hospital: "must not be asked" });
  ok("Degrees: an OPD question is NOT given to the hospital engine under Degrees", !x.calls.some((c) => c.startsWith("hospital:")), x.calls.join(" | "));
  x = await run("people", "list the degrees of the doctors", { hospital: "must not be asked" });
  ok("People never reaches the hospital engine, even for that line", !x.calls.some((c) => c.startsWith("hospital:")), x.calls.join(" | "));

  // Documents
  x = await run("documents", "leave policy", { pax: "no", hospital: "no", holiday: "no" });
  ok("Documents: no record path runs at all, and nothing is answered here (the route searches the circulars)", x.r === null && only(x.calls, "hub", "employeeAdmin"), x.calls.join(" | "));

  // People
  x = await run("people", "how many dgms in mechanical", { pax: "no", hospital: "no", holiday: "no" });
  ok("People: the PAX, hospital and holiday paths are never tried; the model path is (it fails here, so the old engine is the last resort)", !x.calls.some((c) => /^(pax|hospital|holiday):/.test(c)) && x.calls.includes("legacy") && x.calls.includes("dates"), x.calls.join(" | "));

  // Everything: the old chain, in the old order
  x = await run("auto", "fire service", { pax: "42046" });
  ok("Everything: the PAX path gets the line AS TYPED (no cue added)", x.calls.includes("pax:fire service") && !x.calls.some((c) => c.startsWith("pax:pax number")), x.calls.join(" | "));
  x = await run("auto", "zzz", {});
  const order = x.calls.filter((c) => /^(dates|pax|hospital|holiday)/.test(c)).map((c) => c.split(":")[0]);
  ok("Everything: dates, then PAX, then hospital, then holiday, then the model path (the order it always had)", order.join(">") === "dates>pax>hospital>holiday" && x.calls.includes("legacy") && x.calls.indexOf("holiday:zzz") < x.calls.indexOf("legacy"), x.calls.join(" | "));
  const noScope = await (async () => { calls.length = 0; const d = mk("auto"); delete (d as { scope?: ScopeId }).scope; await runOmnibar("zzz", "T", d).catch(() => null); return [...calls]; })();
  ok("a missing scope behaves exactly as Everything", noScope.join("|") === x.calls.join("|"), noScope.join(" | "));

  // management requests stay reachable under every selection
  for (const s of ["people", "pax", "hospital", "holidays", "degrees", "documents"] as const) {
    x = await run(s, "management");
    ok(`${s}: the management page's own words are still offered to the management responders`, x.calls.some((c) => c.startsWith("hub:")), x.calls.join(" | "));
  }

  console.log(`scopedRun: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

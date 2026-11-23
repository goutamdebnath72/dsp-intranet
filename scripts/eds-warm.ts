// scripts/eds-warm.ts: makes the shelf's answers before anyone asks.
// An Executive Deep Search answer is made once and then kept (table eds_briefing) for as long as the circulars and the engine stay the same, so the next person who asks the same question gets it at once. I use this script to
// ask every question of the shelf (src/lib/help/edsExamples.ts: the 32 questions under the Executive Deep Search button) through the REAL route, as an executive, so the first person to press a sample question
// does not wait 30 to 60 seconds. A question that is already kept answers in a second or two and costs nothing; only the missing ones cost model calls. Run it after a circular is uploaded (the kept answers then
// need making again: the engine compares the archive's fingerprint) or after the engine's version changes.
//   EDS_TICKET=4xxxxx npx tsx --tsconfig tsconfig.selftest.json scripts/eds-warm.ts [--base http://localhost:3000] [--only S01,H02] [--concurrency 2] [--dry]
// EDS_TICKET is the ticket number of any executive in the directory, because the route runs its own executive check. The server must be running against the database to be warmed (npm run dev, or the deployed site).
import { edsShelfQuestions } from "../src/lib/help/edsExamples";

const arg = (name: string, def = "") => { const i = process.argv.indexOf(`--${name}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : def; };
const base = arg("base", process.env.EDS_BASE || "http://localhost:3000").replace(/\/$/, "");
const ticket = process.env.EDS_TICKET || "";
const only = arg("only").split(",").map((s) => s.trim()).filter(Boolean);
const concurrency = Math.max(1, Math.min(4, Number(arg("concurrency", "2")) || 2));
const dry = process.argv.includes("--dry");

async function ask(q: string): Promise<{ ms: number; title: string; error: string | null }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/api/ai-search?q=${encodeURIComponent(q)}&mode=intellectual&ticket=${encodeURIComponent(ticket)}`, { signal: AbortSignal.timeout(130_000) });
    const body: any = await res.json().catch(() => null);
    const syn = body && !Array.isArray(body) ? body.synthesis : null;
    if (!res.ok) return { ms: Date.now() - t0, title: "", error: `HTTP ${res.status}${body?.message ? `: ${body.message}` : ""}` };
    if (!syn) return { ms: Date.now() - t0, title: "", error: "no briefing in the reply (not treated as an executive? check EDS_TICKET)" };
    if (syn.error) return { ms: Date.now() - t0, title: String(syn.headline || ""), error: String(syn.error) };
    return { ms: Date.now() - t0, title: String(syn.headline || ""), error: null };
  } catch (e: any) {
    return { ms: Date.now() - t0, title: "", error: String(e?.message || e) };
  }
}

async function main() {
  if (!/^4\d{5}$/.test(ticket)) { console.error("Set EDS_TICKET to an executive's ticket number (6 digits, starting with 4)."); process.exit(2); }
  const list = edsShelfQuestions().filter((x) => !only.length || only.includes(x.id));
  console.log(`${list.length} question(s) to ask at ${base}${dry ? " (dry run: nothing is asked)" : ""}`);
  if (dry) { for (const x of list) console.log(`  ${x.id}  ${x.q}`); return; }
  let next = 0, kept = 0, made = 0, failed = 0, spent = 0;
  const worker = async () => {
    for (;;) {
      const x = list[next++];
      if (!x) return;
      const r = await ask(x.q);
      const already = !r.error && r.ms < 6_000; // an answer that is already kept comes back in a second or two
      if (r.error) failed++; else if (already) kept++; else made++;
      spent += r.ms;
      console.log(`${x.id.padEnd(5)} ${(r.ms / 1000).toFixed(1).padStart(5)} s  ${r.error ? `FAILED: ${r.error}` : already ? "was kept already" : "made and kept"}${r.title ? `  | ${r.title}` : ""}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`\nDONE: ${kept} already kept, ${made} made now, ${failed} failed (${Math.round(spent / 1000)} s of asking, ${concurrency} at a time)`);
  process.exit(failed ? 1 : 0);
}
main();

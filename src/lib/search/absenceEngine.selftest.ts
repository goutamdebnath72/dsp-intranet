// src/lib/search/absenceEngine.selftest.ts  (run: npx tsx --tsconfig tsconfig.selftest.json src/lib/search/absenceEngine.selftest.ts)
// The whole briefing path, with a stub model that makes the real G01 mistake: "Not stated in circular" for an item that the circular lists.
import { executeExecutiveSynthesis, clearExecutiveSynthesisCache } from "./executiveSynthesis";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };

const T71 = "SL. No.: 27 | HOLIDAYS: Kali Puja / Diwali / Dipawali | DATE: 20th October | Day: Monday SL. No.: 28 | HOLIDAYS: Bhatridwitiya | DATE: 23rd October | Day: Thursday SL. No.: 29 | HOLIDAYS: Chhat Puja | DATE: 27th October | Day: Monday";
const T81 = "SL.: 11 | HOLIDAYS: Bhatridwitiya | DATE: 11th November | DAY OF WEEK: Wednesday SL.: 12 | HOLIDAYS: Birth Day of Guru Nanak | DATE: 24th November SL.: 13 | HOLIDAYS: Chhat Puja | DATE: 27th October";
const rec = (id: number, headline: string, chunkText: string) => ({ id, type: "circular", headline, url: null, publishedAt: "2025-12-01", similarity: 0.9, matchPercentage: 90, chunkText });
const records: any[] = [rec(71, "CIRCULAR HOLIDAY LIST FOR THE YEAR 2025", T71), rec(81, "CIRCULAR - HOLIDAY LIST FOR THE YEAR 2026", T81)];
const labels = new Map<number, string>([[71, "Circular 013 (2025)"], [81, "Circular 014 (2026)"]]);
const NS = "Not stated in circular";
const payload = {
  headline: "Holidays 2025 against 2026",
  overview: "Both years list **Bhatridwitiya** and **Chhat Puja**.",
  keyFindings: [
    { text: "Bhatridwitiya falls on 11th November in 2026.", sources: [81] },
    { text: "Chhat Puja falls on 27th October in both years.", sources: [71, 81] },
    { text: "Kali Puja is listed on 20th October in 2025.", sources: [71] },
  ],
  table: { columns: ["Festival", "2025", "2026"], rows: [["Bhatridwitiya", NS, "11th November"], ["Chhat Puja", "27th October", "27th October"], ["Kali Puja / Diwali", "20th October", NS]], sources: [71, 81] },
  datasets: [],
};

(async () => {
  clearExecutiveSynthesisCache();
  const r = await executeExecutiveSynthesis("Compare holidays 2025 and 2026 " + Math.random(), records, labels, { store: null, candidates: 1, generate: async () => JSON.stringify(payload) });
  const rows = r.table?.rows ?? [];
  const bhatri = rows.find((x) => /bhatri/i.test(x[0]));
  ok("the briefing has its table", !!r.table && rows.length >= 2, JSON.stringify(r.table));
  ok("'Not stated' for Bhatridwitiya under 2025 is replaced by the circular's own words", !!bhatri && /Listed in the circular: ".*Bhatridwitiya.*23rd October/.test(bhatri[1]), JSON.stringify(bhatri));
  ok("the cell the model filled correctly is untouched", !!bhatri && bhatri[2] === "11th November");
  const kali = rows.find((x) => /kali/i.test(x[0]));
  ok("'Not stated' for Kali Puja under 2026 stays (circular 81 does not name Kali Puja)", !!kali && kali[2] === NS, JSON.stringify(kali));
  console.log(`absence engine selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// scripts/probe-holidays.mjs
//
// DIAGNOSTIC ONLY — reads the live DB, writes nothing. Grounds the Stage-2
// queryHolidays design in the REAL holiday data instead of assumptions:
//   1. which YEARS holidayyear actually contains (drives the §2.2 future-year
//      guard — is the current year present? next year?),
//   2. per-year / overall counts by HolidayType (CH/FH/RH),
//   3. the real holiday NAMES under each type (to confirm the term->enum
//      mapping: what "FH" / "RH" / "CH" actually are — Republic Day? optional?),
//   4. a sample joined year so date+name+type shape is visible.
//
// PREREQUISITE: node_modules present; .env.local (or .env) carries DATABASE_URL.
// No dev server, no Gemini needed.
//
// RUN:  node scripts/probe-holidays.mjs

import { readFileSync, existsSync } from "fs";
import pg from "pg";
import { DateTime } from "luxon";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL (.env.local / .env).");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });

async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

(async () => {
  try {
    const nowYear = DateTime.now().year;
    console.log(`\nHoliday data probe — current year (Luxon) = ${nowYear}\n${"=".repeat(70)}`);

    // 0. table sizes
    const hm = await q(`SELECT count(*)::int AS n FROM holidaymaster;`);
    const hy = await q(`SELECT count(*)::int AS n FROM holidayyear;`);
    console.log(`holidaymaster rows: ${hm[0].n}    holidayyear rows: ${hy[0].n}`);

    // 1. year coverage
    console.log(`\n[1] holidayyear — rows per YEAR:`);
    const years = await q(`SELECT year, count(*)::int AS n FROM holidayyear GROUP BY year ORDER BY year;`);
    if (years.length === 0) console.log("   (none)");
    for (const r of years) {
      const tag =
        r.year === nowYear ? "  <- current year"
        : r.year === nowYear + 1 ? "  <- NEXT year"
        : r.year < nowYear ? "  (past)"
        : "";
      console.log(`   ${r.year}: ${r.n}${tag}`);
    }
    const yearSet = new Set(years.map((r) => r.year));
    console.log(`\n   current year ${nowYear} present? ${yearSet.has(nowYear) ? "YES" : "NO"}`);
    console.log(`   next year ${nowYear + 1} present?    ${yearSet.has(nowYear + 1) ? "YES" : "NO"}`);

    // 2. per-year per-type counts
    console.log(`\n[2] holidayyear — counts by year x holidayType:`);
    const byYT = await q(
      `SELECT year, "holidayType" AS type, count(*)::int AS n
         FROM holidayyear GROUP BY year, "holidayType" ORDER BY year, "holidayType";`,
    );
    for (const r of byYT) console.log(`   ${r.year}  ${String(r.type).padEnd(3)}  ${r.n}`);

    // 3. holidaymaster type distribution + names per type
    console.log(`\n[3] holidaymaster — count by type:`);
    const mt = await q(`SELECT type, count(*)::int AS n FROM holidaymaster GROUP BY type ORDER BY type;`);
    for (const r of mt) console.log(`   ${String(r.type).padEnd(3)}  ${r.n}`);

    console.log(`\n[4] holidaymaster — names under each type (the term->enum ground truth):`);
    const names = await q(`SELECT type, name FROM holidaymaster ORDER BY type, name;`);
    let cur = null;
    for (const r of names) {
      if (r.type !== cur) { cur = r.type; console.log(`\n   -- ${cur} --`); }
      console.log(`      ${r.name}`);
    }

    // 5. sample joined rows for the latest year present
    if (years.length) {
      const latest = years[years.length - 1].year;
      console.log(`\n[5] sample — holidayyear ⋈ holidaymaster for ${latest} (date · type · name), first 15:`);
      const sample = await q(
        `SELECT hy.date, hy."holidayType" AS type, hm.name
           FROM holidayyear hy JOIN holidaymaster hm ON hm.id = hy."holidayMasterId"
          WHERE hy.year = $1 ORDER BY hy.date ASC LIMIT 15;`,
        [latest],
      );
      for (const r of sample) {
        const d = r.date ? DateTime.fromJSDate(new Date(r.date)).toFormat("yyyy-LL-dd (ccc)") : "?";
        console.log(`   ${d}  ${String(r.type).padEnd(3)}  ${r.name}`);
      }
    }

    console.log("");
  } catch (e) {
    console.error("\nProbe failed:", e?.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

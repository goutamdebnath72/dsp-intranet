// Run (from the project root; needs a scratch Postgres):
//   NL2SQL_TEST_ADMIN_URL=postgres://postgres:pw@127.0.0.1:5432/postgres npx tsx --tsconfig tsconfig.json src/lib/employees/holidayHeadline.selftest.ts
// Step 61a: the holiday answers carry the clean answer FIRST (a Yes or No for "is 24 November 2026 a holiday?", the date for "when is Holi 2026?"). The REAL answer code (employees/analytics.ts and holidays/analytics.ts)
// runs against a small database with holiday rows of the real shape; the app's database layer (TypeORM and its models) is replaced by a stand-in that runs the same SQL.

import { Client } from "pg";

const admin = process.env.NL2SQL_TEST_ADMIN_URL;
if (!admin) {
  console.log("holidayHeadline selftest: skipped (NL2SQL_TEST_ADMIN_URL is not set)");
  process.exit(0);
}
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const DB = "holiday_head_selftest";

async function main() {
  const a = new Client({ connectionString: admin });
  await a.connect();
  await a.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await a.query(`CREATE DATABASE ${DB}`);
  await a.end();
  const c = new Client({ connectionString: admin!.replace(/\/[^/]*$/, `/${DB}`) });
  await c.connect();
  await c.query(`CREATE TABLE holidaymaster (id int PRIMARY KEY, name text UNIQUE NOT NULL, aliases text[], name_phonetic text);
    CREATE TABLE holidayyear (id serial PRIMARY KEY, year int NOT NULL, date date NOT NULL, "holidayType" text NOT NULL, "holidayMasterId" int NOT NULL REFERENCES holidaymaster(id), categories text, note text);
    CREATE TABLE holiday_rh_quota (id serial PRIMARY KEY, year int, category text, quota int);
    INSERT INTO holidaymaster VALUES (1, 'Guru Nanak''s Birthday / Guru Teg Bahadur''s Martyrdom Day', NULL, NULL), (2, 'Holi', NULL, NULL), (3, 'Republic Day', NULL, NULL);
    INSERT INTO holidayyear (year, date, "holidayType", "holidayMasterId", categories, note) VALUES
      (2026, '2026-11-24', 'FH', 1, 'A,B', NULL), (2026, '2026-11-24', 'RH', 1, 'C,D', NULL),
      (2026, '2026-03-04', 'RH', 2, 'A,B,C,D', NULL), (2026, '2026-01-26', 'CH', 3, 'A,B,C,D', NULL);`);
  // the app's database layer and its decorated models are replaced; the answer code and the SQL are the real ones
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NodeModule = (await import("node:module")).default as any;
  const originalLoad = NodeModule._load;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  NodeModule._load = function (request: string, ...rest: any[]) {
    if (request === "@/lib/db") return { getDb: async () => ({ query: async (sql: string, params?: unknown[]) => (await c.query(sql, params as any[])).rows }) };
    if (request.startsWith("@/lib/db/models/")) return new Proxy({ HolidayType: { CH: "CH", FH: "FH", RH: "RH" } }, { get: (t: any, k: string) => (k === "__esModule" ? true : k in t ? t[k] : class {}) });
    return originalLoad.call(this, request, ...rest);
  };
  const { runAnalyticsIntent } = await import("./analytics");
  NodeModule._load = originalLoad;

  const exists = (day: number, month: number, year: number) => runAnalyticsIntent({ kind: "holidayExists", date: { day, month }, year } as any);
  const yes: any = await exists(24, 11, 2026);
  ok("'is 24 November 2026 a holiday?': the headline is a green Yes", yes?.headline?.text === "Yes" && yes.headline.tone === "yes", JSON.stringify(yes?.headline));
  ok("...the lead and the card are kept (the plain text still travels: copy, export)", /^Yes — 24 November 2026 is a holiday\.$/.test(yes?.lead ?? "") && yes.holidayDetails?.length >= 1 && /^Yes — /.test(yes.answer));
  const no: any = await exists(5, 7, 2026);
  ok("'is 5 July 2026 a holiday?': the headline is a red No", no?.headline?.text === "No" && no.headline.tone === "no", JSON.stringify(no?.headline));
  ok("...with its sentence kept: 'No, 5 July 2026 is not a holiday.'", no?.answer === "No, 5 July 2026 is not a holiday.");
  const notLoaded: any = await exists(5, 7, 2030);
  ok("a year that is not loaded gets NO headline (an honest 'not loaded', never a No)", !notLoaded?.headline, JSON.stringify(notLoaded));

  const find: any = await runAnalyticsIntent({ kind: "holidayFindOne", name: "Holi", year: 2026 } as any);
  ok("'when is Holi 2026?': the date is the headline: 'Wednesday, 4 March 2026'", find?.headline?.text === "Wednesday, 4 March 2026" && find.headline.tone === "info", JSON.stringify(find?.headline));
  const dual: any = await runAnalyticsIntent({ kind: "holidayFindOne", name: "Guru Nanak", year: 2026 } as any);
  ok("a holiday that is two rows on one day (Festival for some, Restricted for the rest) gets no single headline: the card shows both", dual?.holidayDetails?.length >= 1 && !dual.headline, JSON.stringify(dual?.headline));
  const type: any = await runAnalyticsIntent({ kind: "holidayTypeLookup", name: "Holi", year: 2026 } as any);
  ok("'is Holi restricted or festival?': the type is the headline", /Restricted/.test(type?.headline?.text ?? "") && type.headline.tone === "info", JSON.stringify(type?.headline));
  const missing: any = await runAnalyticsIntent({ kind: "holidayFindOne", name: "Nonexistent Festival", year: 2026 } as any);
  ok("a holiday that is not in the calendar: no headline, the honest sentence", !missing?.headline && /couldn't find/.test(missing?.answer ?? ""));
  const rh: any = await runAnalyticsIntent({ kind: "holidayRhQuota", year: 2026, category: "B" } as any);
  ok("an RH quota is not changed (it keeps its big number)", !rh?.headline);

  console.log(`holidayHeadline selftest: ${pass} passed, ${fail} failed`);
  await c.end();
  const z = new Client({ connectionString: admin });
  await z.connect();
  await z.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await z.end();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

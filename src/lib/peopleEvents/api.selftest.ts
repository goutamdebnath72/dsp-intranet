// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/peopleEvents/api.selftest.ts
// Step 65a: the reply of /api/people-events: the lists on a normal day, the named fix when the migration has not been run, no detail leaked on any other failure, and what the route may not do. No database.

import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { errorReply, handlePeopleEvents } from "./api";
import { ZONE } from "./rules";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const now = DateTime.fromISO("2026-10-31T09:00:00", { zone: ZONE });

async function main() {
  const rows = [
    { id: 3, name: "ONE", designation: "GM", department: "C & IT", image: "https://p.example/1.jpg", dates_source: "synthetic", dob: "1966-10-14", doj: "1990-10-31", global_seniority_rank: 3, is_birthday: false, is_retiring: true, is_jubilee: false },
    { id: 4, name: "TWO", designation: "Mgr", department: "Logistics", image: "javascript:alert(1)", dates_source: "hr", dob: "1985-10-31", doj: "2001-10-12", global_seniority_rank: 4, is_birthday: true, is_retiring: false, is_jubilee: true },
  ];
  let seen: { sql: string; params: unknown[] } | null = null;
  const r = await handlePeopleEvents(async (sql, params) => { seen = { sql, params: params ?? [] }; return rows; }, now);
  const body = r.body as import("./query").PeopleEvents;
  ok("a normal day: 200 with the three lists, the day, the month and the end of the month", r.status === 200 && body.today === "2026-10-31" && body.monthLabel === "Oct" && body.monthEnd === "2026-10-31" && body.birthdays.length === 1 && body.retirements.length === 1 && body.jubilee.length === 1);
  ok("the retirement card says the farewell day (the last day of the month), the jubilee card the day the 25th year is completed", body.retirements[0].on === "2026-10-31" && body.jubilee[0].on === "2026-10-12" && body.birthdays[0].on === null);
  ok("a photo address that is not a web address is dropped (null), a web address is kept", body.birthdays[0].imageUrl === null && body.retirements[0].imageUrl === "https://p.example/1.jpg");
  ok("a card holds the person and the one day to show, and nothing of the placeholder marker; the reply has no 'sample' flag", body.retirements.every((p) => JSON.stringify(Object.keys(p).sort()) === JSON.stringify(["department", "designation", "id", "imageUrl", "name", "on"])) && !("sample" in body));
  ok("no date of birth and no date of joining is in the reply", !JSON.stringify(r.body).match(/1966-10-14|1985-10-31|1990-10-31|2001-10-12|date_of|\bdob\b|\bdoj\b/));
  ok("the query is given the day in India as plain values, never put into the text of the SQL (no injection by construction)", seen !== null && (seen as { params: unknown[] }).params.length === 6 && !(seen as { sql: string }).sql.includes("2026"));
  const empty = await handlePeopleEvents(async () => [], now);
  ok("a day with nobody: 200 and three empty lists", empty.status === 200 && (empty.body as import("./query").PeopleEvents).birthdays.length === 0);

  const missing = errorReply(Object.assign(new Error('column er.date_of_birth does not exist'), { code: "42703" }));
  ok("the migration not yet run: 503 with the sentence that NAMES the fix", missing.status === 503 && /14_people_events\.sql/.test(JSON.stringify(missing.body)) && (missing.body as { setupNeeded?: boolean }).setupNeeded === true);
  ok("...also in the form TypeORM raises it (driverError)", errorReply(Object.assign(new Error('column "dates_source" does not exist'), { driverError: { code: "42703" } })).status === 503);
  const other = errorReply(new Error("connection terminated: secret-host.example:5432 password=hunter2"));
  ok("any other failure: 500, a generic sentence, nothing of the message leaked", other.status === 500 && !JSON.stringify(other.body).match(/secret-host|hunter2|connection/));
  ok("a missing column of ANOTHER table is not mistaken for the migration", errorReply(Object.assign(new Error("column x.other does not exist"), { code: "42703" })).status === 500);
  const failing = await handlePeopleEvents(async () => { throw Object.assign(new Error("column er.date_of_birth does not exist"), { code: "42703" }); }, now);
  ok("a failing query becomes that reply, never an exception", failing.status === 503);

  const route = readFileSync("src/app/api/people-events/route.ts", "utf8");
  const code = route.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  ok("the route is never cached (force-dynamic, no-store) and takes no input from the request (no query string, no body, no ticket)", /force-dynamic/.test(route) && /no-store/.test(route) && !/request\.|searchParams|req\.|\.json\(\)|getSessionTicket/.test(code));
  ok("the route reads with the application's own connection, never the AI search's read-only role", /getDb/.test(code) && !/withClient|withDefaultClient|nlq_reader|NL2SQL_DATABASE_URL/.test(code));
  ok("there is no production switch for placeholder dates any more (a development database: what the lists show is not a concern)", !/HIDE_SAMPLE|hideSample/.test(route) && !/hideSample|HIDE_SAMPLE/.test(readFileSync("src/lib/peopleEvents/query.ts", "utf8")));

  console.log(`peopleEvents api selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();

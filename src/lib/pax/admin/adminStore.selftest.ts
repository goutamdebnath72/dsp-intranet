// Run (from the project root; needs a scratch Postgres):
//   NL2SQL_TEST_ADMIN_URL=postgres://postgres:pw@127.0.0.1:5432/postgres npx tsx --tsconfig tsconfig.json src/lib/pax/admin/adminStore.selftest.ts
// Step 64a: the PAX admin operations against a real database: who may do what, every kind of clash, the history of who did it, two people at the same moment, and a change that fails half way.
// The table pax_directory is rebuilt as the handoff and the owner's checks describe it (his own check of 31 Oct: columns, text number, nullable location and note, RLS on, API roles without rights);
// the NEW tables come from the real migration file sql/13_pax_admin.sql, run twice. The people and numbers are INVENTED.

import { readFileSync } from "node:fs";
import { Pool } from "pg";

const adminUrl = process.env.NL2SQL_TEST_ADMIN_URL;
if (!adminUrl) {
  console.log("adminStore selftest: skipped (NL2SQL_TEST_ADMIN_URL is not set)");
  process.exit(0);
}
// the HOD C&IT is known by ticket from the environment, read when superAdmin.ts is first loaded: set it BEFORE the code is loaded
process.env.SUPERADMIN_TICKETS = "400001";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const DB = "pax_admin_selftest";

async function main() {
  const store = await import("./store");
  const { loadPaxRows } = await import("../store");
  const { answerPax } = await import("../answer");

  const a = new Pool({ connectionString: adminUrl, max: 1 });
  await a.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await a.query(`CREATE DATABASE ${DB}`);
  await a.end();
  const pool = new Pool({ connectionString: adminUrl!.replace(/\/[^/]*$/, `/${DB}`), max: 8 });
  for (const role of ["anon", "authenticated"]) await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
  await pool.query(`
    CREATE TABLE public.pax_directory (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, dept_name text NOT NULL, location text, number text NOT NULL, label text NOT NULL,
      note text, source text NOT NULL DEFAULT 'PAX_Phone_numbers.docx', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (label, number), CHECK (number ~ '^[0-9]{3,6}$'),
      CONSTRAINT pax_directory_location_check CHECK (location IS NULL OR length(btrim(location)) > 0), CONSTRAINT pax_directory_note_check CHECK (note IS NULL OR length(btrim(note)) > 0),
      CONSTRAINT pax_directory_dept_check CHECK (length(btrim(dept_name)) > 0 AND length(btrim(label)) > 0));
    CREATE FUNCTION public.pax_area(n text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
      SELECT CASE WHEN n ~ '^4[0-2][0-9]{3}$' THEN 'plant' WHEN n ~ '^45[0-9]{3}$' OR n ~ '^5[0-9]{4}$' THEN 'outside plant' ELSE 'not classified' END $f$;
    ALTER TABLE public.pax_directory ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.pax_directory FROM anon, authenticated;`);
  // Telecom's own lines, as printed (invented numbers except 42043 on two names, which the owner confirmed)
  const legacy: Array<[string, string, string, string]> = [
    ["CISF", "Admin Gate", "40384", "CISF Admin Gate"], ["CISF", "Tumla Gate", "40926", "CISF Tumla Gate"], ["CISF", "Tumla Gate", "42043", "CISF Tumla Gate"],
    ["CISF", "Gate No. 2A", "42384", "CISF Gate No. 2A"], ["Weigh Bridge", "Tumla Gate", "42043", "Weigh Bridge – Tumla Gate"], ["Weigh Bridge", "60T", "40173", "Weigh Bridge – 60T"],
    ["Fire Service", "", "42050", "Fire Service"], ["Plant Medical", "PMU", "41301", "Plant Medical (PMU)"],
  ];
  for (const [d, l, n, label] of legacy) await pool.query(`INSERT INTO public.pax_directory (dept_name, location, number, label, note) VALUES ($1, NULLIF($2,''), $3, $4, NULL)`, [d, l, n, label]);

  // the real migration file, run twice: it must be safe to run again
  const migration = readFileSync("src/lib/nl2sql/sql/13_pax_admin.sql", "utf8");
  await pool.query(migration);
  let again = true;
  try { await pool.query(migration); } catch { again = false; }
  ok("the migration (sql/13) runs, and runs again without error", again);

  // the database as the code sees it: each operation in its own transaction on its own connection
  const db: import("./store").PaxDb = {
    async run(fn) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const r = await fn(async (sql, params) => (await c.query(sql, params as never[])).rows);
        await c.query("COMMIT");
        return r;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
  };
  const HOD = { ticket: "400001", name: "HOD C&IT (invented)" };
  const RAKESH = { ticket: "412345", name: "RAKESH OJHA (invented)" };
  const STRANGER = { ticket: "123456", name: "A TECHNICIAN (invented)" };
  const count = async (sql: string) => Number((await pool.query(sql)).rows[0].n);
  // a person LOADS the line and then saves what he typed WITH THE VERSION HE SAW (src/lib/concurrency/version.ts)
  const seenV = async (id: number) => (await store.listEntries(db, "")).find((e) => e.id === id)?.version;
  const modX = async (actor: { ticket: string; name: string }, id: number, raw: { department: string; location: string; number: string }, acks: Array<"second-number" | "different"> = []) => store.modifyEntry(db, actor, id, raw, acks, await seenV(id));
  const delX = async (actor: { ticket: string; name: string }, id: number) => store.deleteEntry(db, actor, id, await seenV(id));

  const rowsNow = async () => (await pool.query(`SELECT * FROM public.pax_directory ORDER BY id`)).rows;
  const auditNow = async () => (await pool.query(`SELECT * FROM public.pax_directory_audit ORDER BY id`)).rows;

  // ---- who may do what ----
  ok("authority: the HOD by ticket; nobody else yet", (await db.run((q) => store.authorityOf(q, "400001"))) === "hod" && (await db.run((q) => store.authorityOf(q, "412345"))) === null && (await db.run((q) => store.authorityOf(q, null))) === null && (await db.run((q) => store.authorityOf(q, "")) ) === null);
  let r = await store.addEntry(db, STRANGER, { department: "Stores", location: "Main", number: "42555" });
  ok("a person with no authority cannot add: 'forbidden', nothing saved, nothing in the history", r.status === "forbidden" && (await rowsNow()).length === legacy.length && (await auditNow()).length === 0, JSON.stringify(r));
  ok("...nor modify, delete, authorise or revoke", (await modX(STRANGER, 1, { department: "X1", location: "", number: "42556" })).status === "forbidden" && (await delX(STRANGER, 1)).status === "forbidden" && (await store.grantDelegate(db, STRANGER, { ticket: "412345", name: "R" })).status === "forbidden" && (await store.revokeDelegate(db, STRANGER, "412345")).status === "forbidden");

  // ---- adding ----
  r = await store.addEntry(db, HOD, { department: "  Stores  ", location: "Main Gate", number: "42555" });
  ok("the HOD adds a new line: ok, trimmed", r.status === "ok" && r.entry.department === "Stores" && r.entry.location === "Main Gate" && r.entry.number === "42555", JSON.stringify(r));
  const added = (await rowsNow()).find((x) => x.number === "42555");
  ok("...saved with its own parts, a printed name, and the source 'portal'", added?.dept_name === "Stores" && added.location === "Main Gate" && added.label === "Stores (Main Gate)" && added.source === "portal");
  let log = await auditNow();
  ok("...ONE history line: who (ticket and name), as what, what was added", log.length === 1 && log[0].actor_ticket === "400001" && log[0].actor_name === HOD.name && log[0].actor_role === "hod" && log[0].action === "add" && log[0].after.number === "42555" && log[0].before === null && Number(log[0].pax_id) === Number(added.id), JSON.stringify(log[0]));
  const shown = await answerPax("pax stores", () => loadPaxRows((sql, p) => pool.query(sql, p as never[]).then((x) => x.rows)));
  ok("...and the search shows it exactly as typed: Stores | Main Gate | 42555", shown?.card.table?.rows[0].join("|") === "Stores|Main Gate|42555", JSON.stringify(shown?.card.table));
  r = await store.addEntry(db, HOD, { department: "Garage", location: "", number: "42556" });
  ok("a line with NO location is saved with a true empty (NULL) location and no note, because the live table REFUSES an empty text there (pax_directory_location_check)", r.status === "ok" && (await rowsNow()).find((x) => x.number === "42556")?.location === null && (await rowsNow()).find((x) => x.number === "42556")?.note === null, JSON.stringify(r));
  ok("a line without a location is saved with an empty one (the table shows Office)", r.status === "ok" && (await answerPax("pax garage", () => loadPaxRows((s, p) => pool.query(s, p as never[]).then((x) => x.rows))))?.card.table?.rows[0].join("|") === "Garage|Office|42556");
  const before = (await rowsNow()).length;
  for (const bad of ["52555", "4255", "425550", "4255a", "", "42 555"]) {
    r = await store.addEntry(db, HOD, { department: "Bad", location: "", number: bad });
    ok(`number "${bad}": 'invalid' with the rule for the number, nothing saved`, r.status === "invalid" && !!r.errors.number, JSON.stringify(r));
  }
  r = await store.addEntry(db, HOD, { department: "", location: "", number: "42557" });
  ok("a missing department: 'invalid'", r.status === "invalid" && !!r.errors.department);
  ok("...none of the refusals saved anything or wrote history", (await rowsNow()).length === before && (await auditNow()).length === 2);

  // ---- clashes ----
  const n1 = (await rowsNow()).length, a1 = (await auditNow()).length;
  r = await store.addEntry(db, HOD, { department: "Canteen", location: "", number: "40173" });
  ok("a number that is taken: 'conflict' (same-number) naming the line that has it, and NO way through", r.status === "conflict" && r.conflicts[0].kind === "same-number" && r.conflicts[0].existing[0].department === "Weigh Bridge" && r.conflicts[0].existing[0].location === "60T" && r.acknowledgeable.length === 0, JSON.stringify(r));
  r = await store.addEntry(db, HOD, { department: "Canteen", location: "", number: "40173" }, ["second-number", "different"]);
  ok("...answering 'second number' and 'different' does not open it: the number belongs to one place", r.status === "conflict");
  r = await store.addEntry(db, HOD, { department: "Canteen", location: "", number: "42043" });
  ok("42043 stands on two lines: both are named", r.status === "conflict" && r.conflicts[0].existing.length === 2);
  r = await store.addEntry(db, HOD, { department: "CISF", location: "Admin Gate", number: "40384" });
  ok("an exact duplicate (same place, same number): no way through", r.status === "conflict" && r.acknowledgeable.length === 0);
  r = await store.addEntry(db, HOD, { department: "cisf", location: "admin  gate", number: "42777" });
  ok("the same place with another number: 'same-place' and the answer 'second-number' is offered", r.status === "conflict" && r.conflicts[0].kind === "same-place" && r.acknowledgeable.join() === "second-number", JSON.stringify(r));
  r = await store.addEntry(db, HOD, { department: "cisf", location: "admin  gate", number: "42777" }, ["different"]);
  ok("...the WRONG answer ('different') does not open it", r.status === "conflict");
  r = await store.addEntry(db, HOD, { department: "cisf", location: "admin  gate", number: "42777" }, ["second-number"]);
  ok("...the right answer saves it as ANOTHER NUMBER of the same place", r.status === "ok");
  const merged = await answerPax("pax cisf admin gate", () => loadPaxRows((s, p) => pool.query(s, p as never[]).then((x) => x.rows)));
  ok("...and the table shows ONE line with both numbers: 40384 / 42777", merged?.card.table?.rows.length === 1 && merged.card.table.rows[0][2] === "40384 / 42777", JSON.stringify(merged?.card.table));
  r = await store.addEntry(db, HOD, { department: "Fire Servise", location: "", number: "42888" });
  ok("a spelling slip of a saved place: 'similar-place', the answer 'different' is offered", r.status === "conflict" && r.conflicts[0].kind === "similar-place" && r.acknowledgeable.join() === "different", JSON.stringify(r));
  r = await store.addEntry(db, HOD, { department: "CISF", location: "Gate No. 2", number: "42889" });
  ok("'Gate No. 2' reads like the saved 'Gate No. 2A': similar", r.status === "conflict" && r.conflicts[0].kind === "similar-place");
  r = await store.addEntry(db, HOD, { department: "CISF", location: "Gate No. 2", number: "42889" }, ["different"]);
  ok("...and when he says it is a different place, it is saved", r.status === "ok");
  ok("only the saved ones changed the tables: 2 more lines, 2 more history lines (the clashes wrote nothing)", (await rowsNow()).length === n1 + 2 && (await auditNow()).length === a1 + 2);

  // ---- modifying ----
  const fire = (await rowsNow()).find((x) => x.label === "Fire Service");
  r = await modX(HOD, Number(fire.id), { department: "Fire Service", location: "Main Station", number: "42050" });
  ok("change the location of a line, keeping its number: ok", r.status === "ok" && r.entry.location === "Main Station", JSON.stringify(r));
  const fireNow = (await rowsNow()).find((x) => Number(x.id) === Number(fire.id));
  ok("...a line of Telecom's own list becomes a 'portal' line with its own parts; the printed name is rebuilt", fireNow.source === "portal" && fireNow.dept_name === "Fire Service" && fireNow.location === "Main Station" && fireNow.label === "Fire Service (Main Station)" && fireNow.updated_at > fireNow.created_at);
  log = await auditNow();
  const last = log[log.length - 1];
  ok("...the history keeps the line BEFORE (with its printed name) and AFTER, and who", last.action === "modify" && last.before.label === "Fire Service" && last.before.location === "" && last.after.location === "Main Station" && last.actor_ticket === "400001", JSON.stringify(last));
  r = await modX(HOD, Number(fire.id), { department: "Fire Service", location: "Main Station", number: "42050" });
  ok("saving a line with nothing changed: 'unchanged', no history line", r.status === "unchanged" && (await auditNow()).length === log.length);
  r = await modX(HOD, Number(fire.id), { department: "Fire Service", location: "Main Station", number: "40173" });
  ok("changing to a number that another line has: 'conflict', the line is as it was", r.status === "conflict" && r.conflicts[0].kind === "same-number" && (await rowsNow()).find((x) => Number(x.id) === Number(fire.id)).number === "42050");
  r = await modX(HOD, Number(fire.id), { department: "Fire Service", location: "Main Station", number: "52050" });
  ok("changing to a number that is not 5 digits starting with 4: 'invalid'", r.status === "invalid");
  r = await modX(HOD, 99999, { department: "Nowhere", location: "", number: "42999" });
  ok("a line that does not exist: 'missing'", r.status === "missing");
  const tumlaCisf = (await rowsNow()).find((x) => x.label === "CISF Tumla Gate" && x.number === "42043");
  r = await modX(HOD, Number(tumlaCisf.id), { department: "CISF", location: "Tumla Gate (Main)", number: "42043" });
  ok("42043 is on two lines: changing only the location of one of them (keeping the number) is possible", r.status === "ok", JSON.stringify(r));
  const garage = (await rowsNow()).find((x) => x.number === "42556");
  r = await modX(HOD, Number(garage.id), { department: "Stores", location: "Main Gate", number: "42556" });
  ok("changing a line INTO the place of another: 'same-place', second number may be answered", r.status === "conflict" && r.conflicts[0].kind === "same-place");
  r = await modX(HOD, Number(garage.id), { department: "Stores", location: "Main Gate", number: "42556" }, ["second-number"]);
  ok("...and then it is saved", r.status === "ok");

  // ---- deleting ----
  const stores = (await rowsNow()).find((x) => x.number === "42555");
  const nBefore = (await rowsNow()).length;
  r = await delX(HOD, Number(stores.id));
  ok("delete a line: ok, gone from the table", r.status === "ok" && (await rowsNow()).length === nBefore - 1 && !(await rowsNow()).some((x) => x.number === "42555"));
  log = await auditNow();
  ok("...the history keeps what was deleted, and who deleted it", log[log.length - 1].action === "delete" && log[log.length - 1].before.number === "42555" && log[log.length - 1].after === null && log[log.length - 1].actor_ticket === "400001");
  ok("deleting a line that is not there: 'missing'", (await delX(HOD, Number(stores.id))).status === "missing");
  ok("a deleted number can be used again", (await store.addEntry(db, HOD, { department: "Stores", location: "Annex", number: "42555" })).status === "ok");

  // ---- the history cannot be changed ----
  let blocked = 0;
  try { await pool.query(`UPDATE public.pax_directory_audit SET actor_name = 'someone else'`); } catch { blocked++; }
  try { await pool.query(`DELETE FROM public.pax_directory_audit`); } catch { blocked++; }
  ok("the history is append only: an UPDATE and a DELETE are both refused, even for the application", blocked === 2);
  // ---- closed to the public API roles ----
  let denied = 0;
  for (const table of ["pax_delegate", "pax_directory_audit", "pax_directory"]) {
    const c = await pool.connect();
    try { await c.query("SET ROLE anon"); await c.query(`SELECT * FROM public.${table}`); } catch { denied++; } finally { await c.query("RESET ROLE"); c.release(); }
  }
  ok("the two new tables are closed to the public API role, like pax_directory", denied === 3);

  // ---- delegation ----
  ok("before the HOD authorises him, Rakesh Ojha cannot add", (await store.addEntry(db, RAKESH, { department: "Canteen", location: "", number: "42600" })).status === "forbidden");
  ok("only an executive can be authorised (ticket 4xxxxx): 123456 is refused", (await store.grantDelegate(db, HOD, { ticket: "123456", name: "T" })).status === "invalid" && (await store.grantDelegate(db, HOD, { ticket: "41234", name: "T" })).status === "invalid");
  ok("the HOD cannot authorise himself (he has it already)", (await store.grantDelegate(db, HOD, { ticket: "400001", name: "H" })).status === "invalid");
  ok("the HOD authorises Rakesh Ojha", (await store.grantDelegate(db, HOD, RAKESH)).status === "ok");
  ok("...twice is 'already'", (await store.grantDelegate(db, HOD, RAKESH)).status === "already");
  ok("...he is now a delegate", (await db.run((q) => store.authorityOf(q, "412345"))) === "delegate" && (await store.listDelegates(db)).map((d) => d.ticket).join() === "412345" && (await store.listDelegates(db))[0].grantedByTicket === "400001");
  r = await store.addEntry(db, RAKESH, { department: "Canteen", location: "", number: "42600" });
  ok("the delegate can add", r.status === "ok");
  log = await auditNow();
  ok("...and the history says it was HIM, as a delegate, not the HOD", log[log.length - 1].actor_ticket === "412345" && log[log.length - 1].actor_role === "delegate" && log[log.length - 1].actor_name === RAKESH.name);
  const canteen = (await rowsNow()).find((x) => x.number === "42600");
  ok("the delegate can modify and delete", (await modX(RAKESH, Number(canteen.id), { department: "Canteen", location: "Block A", number: "42600" })).status === "ok" && (await delX(RAKESH, Number(canteen.id))).status === "ok");
  ok("the delegate can NOT authorise or revoke anybody (only the HOD does)", (await store.grantDelegate(db, RAKESH, { ticket: "498301", name: "ANIL DAS" })).status === "forbidden" && (await store.revokeDelegate(db, RAKESH, "412345")).status === "forbidden");
  ok("the HOD revokes him", (await store.revokeDelegate(db, HOD, "412345")).status === "ok" && (await store.listDelegates(db)).length === 0);
  ok("...revoking again is 'not-delegate'", (await store.revokeDelegate(db, HOD, "412345")).status === "not-delegate");
  ok("after the revocation he can no longer add", (await store.addEntry(db, RAKESH, { department: "Canteen", location: "", number: "42601" })).status === "forbidden");
  ok("he can be authorised again, and both periods stay in the table (the revoked one with who revoked it)", (await store.grantDelegate(db, HOD, RAKESH)).status === "ok" && (await count(`SELECT count(*) AS n FROM public.pax_delegate WHERE ticket_no = '412345'`)) === 2 && (await count(`SELECT count(*) AS n FROM public.pax_delegate WHERE ticket_no = '412345' AND revoked_by_ticket = '400001'`)) === 1);
  ok("a delegate who is authorised and then revoked while a change is being made cannot slip through: authority is checked inside the transaction (revoked person refused)", (await store.revokeDelegate(db, HOD, "412345")).status === "ok" && (await delX(RAKESH, 1)).status === "forbidden");

  // ---- the history as the panel shows it ----
  const hist = await store.recentAudit(db, 100);
  ok("recent changes: newest first, each says who and what in words", hist.length === (await auditNow()).length && hist[0].action === "revoke" && /^Withdrew the authority of RAKESH OJHA \(invented\) \(412345\)$/.test(hist[0].summary) && hist.some((h) => h.action === "add" && /^Added Stores - Main Gate \(42555\)$/.test(h.summary) && h.actorName === HOD.name) && hist.some((h) => /^Changed Fire Service \(42050\) to Fire Service - Main Station \(42050\)$/.test(h.summary)) && hist.some((h) => /^Deleted Stores - Main Gate \(42555\)$/.test(h.summary)) && hist.some((h) => /^Authorised RAKESH OJHA \(invented\) \(412345\)$/.test(h.summary)), JSON.stringify(hist.slice(0, 3)));

  // ---- two people at the same moment ----
  const before2 = (await rowsNow()).length;
  const race = await Promise.all([
    store.addEntry(db, HOD, { department: "Race One", location: "", number: "43001" }),
    store.addEntry(db, HOD, { department: "Race Two", location: "", number: "43001" }),
    store.addEntry(db, HOD, { department: "Race Three", location: "", number: "43001" }),
  ]);
  ok("three people add the SAME number at the same moment: exactly ONE is saved, the other two are told it is taken", race.filter((x) => x.status === "ok").length === 1 && race.filter((x) => x.status === "conflict").length === 2 && (await rowsNow()).length === before2 + 1, JSON.stringify(race.map((x) => x.status)));
  const race2 = await Promise.all(["43101", "43102", "43103", "43104", "43105", "43106"].map((n, i) => store.addEntry(db, HOD, { department: `Dept Number ${["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"][i]}`, location: "", number: n })));
  ok("six different lines at the same moment: all six are saved", race2.every((x) => x.status === "ok"));

  // ---- a change that fails half way leaves nothing ----
  const n3 = (await rowsNow()).length, a3 = (await auditNow()).length;
  let threw = false;
  try { await store.addEntry(db, { ticket: "400001", name: null as unknown as string }, { department: "Half Way", location: "", number: "43999" }); } catch { threw = true; }
  ok("if the history line cannot be written, the line is NOT saved either (one transaction): nothing half done", threw && (await rowsNow()).length === n3 && (await auditNow()).length === a3);

  // ---- listing for the panel ----
  const all = await store.listEntries(db);
  ok("the list for the panel: every line in the table's words, departments A to Z; a search narrows it", all.length === (await rowsNow()).length && all[0].department.localeCompare(all[all.length - 1].department) <= 0 && (await store.listEntries(db, "tumla")).every((l) => /tumla/i.test(`${l.department} ${l.location}`)) && (await store.listEntries(db, "42050")).length === 1);
  const weigh = (await store.listEntries(db, "weigh bridge")).map((l) => `${l.department}|${l.location}|${l.number}`);
  ok("...Telecom's own lines are split as the table shows them (Weigh Bridge | 60T)", weigh.includes("Weigh Bridge|60T|40173") && weigh.includes("Weigh Bridge|Tumla Gate|42043"), JSON.stringify(weigh));

  // ---- the requests (api.ts): who is asking comes from the login, never from the request ----
  const { handlePaxAdmin, isSameOrigin, findExecutives, errorReply } = await import("./api");
  const { rowsOf } = await import("./rows");
  const DIRECTORY = [
    { id: "u0", ticketNo: "400001", name: "HOD C&IT (invented)", designation: "General Manager (C&IT)", department: "C&IT" },
    { id: "u1", ticketNo: "412345", name: "RAKESH OJHA", designation: "Chief Manager", department: "C&IT" }, { id: "u2", ticketNo: "498301", name: "ANIL DAS", designation: "Sr. Manager", department: "Civil" },
    { id: "u3", ticketNo: "123456", name: "RAKESH KUMAR", designation: "Technician", department: "Civil" }, { id: "u4", ticketNo: "450001", name: "RAKESH OJHA", designation: "Manager", department: "Mines" },
    { id: "u5", ticketNo: "412346", name: "RAKESH OJHAA", designation: "Manager", department: "Mines" },
  ] as unknown as import("@/lib/search/employeeSearch").EmployeeResult[];
  const ctx = (actor: { ticket: string; name: string } | null) => ({ actor, db, findByName: async () => DIRECTORY, findByTicket: async (t: string) => DIRECTORY.filter((p) => p.ticketNo === t) });
  ok("an unknown request is 400, nobody logged in is 401", (await handlePaxAdmin({ op: "explode" }, ctx(HOD))).status === 400 && (await handlePaxAdmin({}, ctx(HOD))).status === 400 && (await handlePaxAdmin(null, ctx(HOD))).status === 400 && (await handlePaxAdmin({ op: "list" }, ctx(null))).status === 401);
  let h = await handlePaxAdmin({ op: "me" }, ctx(STRANGER));
  ok("'me' tells a stranger that he has no authority (and nothing more)", h.status === 200 && h.body.role === null);
  const nAdd = (await rowsNow()).length;
  ok("a stranger is refused (403) every real request, including one that CLAIMS to be the HOD", (await handlePaxAdmin({ op: "list" }, ctx(STRANGER))).status === 403 && (await handlePaxAdmin({ op: "add", department: "Evil", location: "", number: "43888", ticket: "400001", role: "hod", actor: HOD }, ctx(STRANGER))).status === 403 && (await handlePaxAdmin({ op: "delegates" }, ctx(STRANGER))).status === 403 && (await rowsNow()).length === nAdd);
  h = await handlePaxAdmin({ op: "me" }, ctx(HOD));
  ok("'me' for the HOD: role hod", h.body.role === "hod");
  ok("a delegate can list, add and see the history, but is refused (403) the list of authorised people, finding an executive, authorising and revoking", await (async () => {
    await store.grantDelegate(db, HOD, RAKESH);
    const okAdd = await handlePaxAdmin({ op: "add", department: "Hall", location: "", number: "43700" }, ctx(RAKESH));
    return (await handlePaxAdmin({ op: "me" }, ctx(RAKESH))).body.role === "delegate" && (await handlePaxAdmin({ op: "list" }, ctx(RAKESH))).status === 200 && (okAdd.body.result as { status: string }).status === "ok" && (await handlePaxAdmin({ op: "audit" }, ctx(RAKESH))).status === 200
      && (await handlePaxAdmin({ op: "delegates" }, ctx(RAKESH))).status === 403 && (await handlePaxAdmin({ op: "find-executive", q: "anil das" }, ctx(RAKESH))).status === 403 && (await handlePaxAdmin({ op: "grant", ticket: "498301" }, ctx(RAKESH))).status === 403 && (await handlePaxAdmin({ op: "revoke", ticket: "412345" }, ctx(RAKESH))).status === 403;
  })());
  ok("modify and delete need a real whole-number id (a text id, zero, a fraction are 400)", (await handlePaxAdmin({ op: "delete", id: "1" }, ctx(HOD))).status === 400 && (await handlePaxAdmin({ op: "delete", id: 0 }, ctx(HOD))).status === 400 && (await handlePaxAdmin({ op: "modify", id: 1.5, department: "X1", location: "", number: "42000" }, ctx(HOD))).status === 400 && (await handlePaxAdmin({ op: "delete" }, ctx(HOD))).status === 400);
  ok("add through the request: a clash comes back as data (200) with the line it clashes with", await (async () => { const x = await handlePaxAdmin({ op: "add", department: "Canteen", location: "", number: "40173" }, ctx(HOD)); const res = x.body.result as { status: string; conflicts: Array<{ kind: string }> }; return x.status === 200 && res.status === "conflict" && res.conflicts[0].kind === "same-number"; })());
  ok("only the two known answers are taken from the request ('second-number', 'different'); anything else is ignored", await (async () => { const x = await handlePaxAdmin({ op: "add", department: "CISF", location: "Admin Gate", number: "43456", acknowledge: ["yes", "force", 1, null] }, ctx(HOD)); return (x.body.result as { status: string }).status === "conflict"; })());
  ok("find-executive: by ticket, and by name where EVERY typed word is a whole word (the sound-alike 'RAKESH OJHAA' is not offered; the non-executive RAKESH KUMAR never)", await (async () => {
    const byName = (await findExecutives("rakesh ojha", ctx(HOD))).map((e) => e.ticket).sort().join();
    const byTicket = (await findExecutives("498301", ctx(HOD))).map((e) => e.name).join();
    const nonExec = (await findExecutives("123456", ctx(HOD))).length + (await findExecutives("rakesh kumar", ctx(HOD))).length;
    return byName === "412345,450001" && byTicket === "ANIL DAS" && nonExec === 0 && (await findExecutives("", ctx(HOD))).length === 0 && (await findExecutives("a b c d e", ctx(HOD))).length === 0;
  })());
  h = await handlePaxAdmin({ op: "grant", ticket: "498301", name: "HACKER NAME FROM THE BROWSER" }, ctx(HOD));
  ok("authorising: the name saved is the DIRECTORY's, never the one the browser sent", (h.body.result as { status: string }).status === "ok" && (await store.listDelegates(db)).find((d) => d.ticket === "498301")?.name === "ANIL DAS");
  ok("authorising a ticket that is not an executive, or does not exist, is refused with the reason", ((await handlePaxAdmin({ op: "grant", ticket: "123456" }, ctx(HOD))).body.result as { status: string; reason: string }).status === "invalid" && ((await handlePaxAdmin({ op: "grant", ticket: "499999" }, ctx(HOD))).body.result as { reason: string }).reason.includes("No executive"));
  ok("revoking through the request", ((await handlePaxAdmin({ op: "revoke", ticket: "498301" }, ctx(HOD))).body.result as { status: string }).status === "ok");
  ok("the history carries, for each kind of action, the line it is about and what to say under it (for the history TABLE)", (() => {
    const by = (f: (h: Awaited<ReturnType<typeof store.recentAudit>>[number]) => boolean) => hist.find(f);
    const add = by((h) => h.action === "add" && h.number === "42555" && h.location === "Main Gate"), mod = by((h) => h.action === "modify" && h.department === "Fire Service"), del = by((h) => h.action === "delete" && h.number === "42555");
    const gr = by((h) => h.action === "grant"), rv = by((h) => h.action === "revoke");
    return !!add && add.department === "Stores" && add.location === "Main Gate" && add.detail === ""
      && !!mod && mod.location === "Main Station" && mod.number === "42050" && mod.detail === "Fire Service (42050)"
      && !!del && del.department === "Stores" && del.location === "Main Gate" && del.number === "42555" && del.detail === ""
      && !!gr && gr.department === "" && gr.number === "" && /^RAKESH OJHA \(invented\) \(412345\)$/.test(gr.detail)
      && !!rv && rv.department === "" && /\(412345\)$/.test(rv.detail);
  })());
  ok("a line with no location is empty in the history row (the panel shows Office)", hist.some((h) => h.action === "add" && h.department === "Garage" && h.location === ""));
  ok("the history through the request carries each editor's POST from the people directory (one look-up per person); a person not found, or a failing look-up, gives an empty post", await (async () => {
    const x = (await handlePaxAdmin({ op: "audit" }, ctx(HOD))).body.history as Array<{ actorTicket: string; actorDesignation: string }>;
    const hodRows = x.filter((h) => h.actorTicket === "400001"), delRows = x.filter((h) => h.actorTicket === "412345");
    const failing = await handlePaxAdmin({ op: "audit" }, { ...ctx(HOD), findByTicket: async () => { throw new Error("db"); } });
    const bad = failing.body.history as Array<{ actorDesignation: string }>;
    return hodRows.length > 0 && hodRows.every((h) => h.actorDesignation === "General Manager (C&IT)") && delRows.length > 0 && delRows.every((h) => h.actorDesignation === "Chief Manager") && failing.status === 200 && bad.length > 0 && bad.every((h) => h.actorDesignation === "");
  })());
  ok("the history through the request lists the newest first", ((await handlePaxAdmin({ op: "audit" }, ctx(HOD))).body.history as Array<{ action: string }>)[0].action === "revoke");
  ok("a page of ANOTHER site cannot use the login: origin must be this site (no Origin header = not a page of another site)", isSameOrigin("https://intranet.example", "intranet.example") && !isSameOrigin("https://evil.example", "intranet.example") && isSameOrigin(null, "intranet.example") && !isSameOrigin("not a url", "intranet.example") && !isSameOrigin("https://intranet.example", null));
  ok("a missing admin table (sql/13 not run) gets a reply that NAMES the fix, in the form TypeORM raises it; any other failure stays generic (no detail leaked)", (() => {
    const missing = errorReply(Object.assign(new Error('relation "public.pax_delegate" does not exist'), { code: "42P01" }));
    const viaDriver = errorReply(Object.assign(new Error('relation "public.pax_directory_audit" does not exist'), { driverError: { code: "42P01" } }));
    const other = errorReply(new Error("connection terminated: secret-host.example:5432"));
    const otherTable = errorReply(Object.assign(new Error('relation "public.something_else" does not exist'), { code: "42P01" }));
    return missing.status === 503 && /13_pax_admin\.sql/.test(String(missing.body.error)) && missing.body.setupNeeded === true && viaDriver.status === 503 && other.status === 500 && !JSON.stringify(other.body).includes("secret-host") && otherTable.status === 500;
  })());
  ok("TypeORM returns [rows, count] for UPDATE and DELETE: rowsOf puts every shape right", rowsOf([[{ name: "x" }], 1]).length === 1 && rowsOf([[], 0]).length === 0 && rowsOf([{ a: 1 }, { a: 2 }]).length === 2 && rowsOf([]).length === 0 && rowsOf(undefined).length === 0 && rowsOf([{ a: 1 }, { a: 2 }])[1].a === 2);

  // ---- TWO PEOPLE AT ONCE: the guard against a LOST UPDATE (step 67b, src/lib/concurrency/version.ts) ----
  await store.grantDelegate(db, HOD, { ticket: "412345", name: "RAKESH OJHA (invented)" });
  type V = { id: number; department: string; location: string; number: string; version?: string };
  const line = async (department: string, location: string, number: string): Promise<V> => { const r = await store.addEntry(db, HOD, { department, location, number }); if (r.status !== "ok") throw new Error(`could not add ${department}: ${JSON.stringify(r)}`); return r.entry as V; };
  const numberOf = async (id: number) => (await pool.query(`SELECT "number"::text AS n FROM public.pax_directory WHERE id = $1`, [id])).rows[0]?.n as string | undefined;
  const modifiesOf = async (id: number) => count(`SELECT count(*) AS n FROM public.pax_directory_audit WHERE pax_id = ${id} AND action = 'modify'`);

  const L1 = await line("Conc Dept One", "Gate 1", "43601");
  ok("a line saved or listed carries its VERSION, and it is the same whichever way it is read (the answer to the save, the list)", !!L1.version && L1.version === (await store.listEntries(db, "Conc Dept One")).find((e) => e.id === L1.id)?.version);
  const cA = await store.modifyEntry(db, HOD, L1.id, { department: "Conc Dept One", location: "Gate 1", number: "43602" }, [], L1.version);
  ok("A changes the number: it is saved, and the line has a NEW version (the one the answer carries is the one the list carries)", cA.status === "ok" && cA.entry.version !== L1.version && cA.entry.version === (await store.listEntries(db, "Conc Dept One")).find((e) => e.id === L1.id)?.version);
  const bStale = await store.modifyEntry(db, RAKESH, L1.id, { department: "Conc Dept One Renamed", location: "Gate 1", number: "43601" }, [], L1.version);
  ok("B, whose form is out of date (it still holds the OLD number), saves: REFUSED as stale, with the line as it is now", bStale.status === "stale" && bStale.current.number === "43602" && bStale.current.department === "Conc Dept One" && bStale.current.version === (cA.status === "ok" ? cA.entry.version : ""));
  ok("...NOTHING of B's was written: A's number is exactly as A left it (B's save would have put the old number back), and no second history line", (await numberOf(L1.id)) === "43602" && (await modifiesOf(L1.id)) === 1);
  ok("...the answer says WHO changed it and WHEN, and tells no value", bStale.status === "stale" && bStale.last?.actorName === HOD.name && bStale.last?.actorTicket === "400001" && bStale.last?.action === "modify" && !Number.isNaN(Date.parse(bStale.last?.at ?? "")) && Object.keys(bStale.last ?? {}).sort().join() === "action,actorName,actorTicket,at");
  const fresh = (await store.listEntries(db, "Conc Dept One")).find((e) => e.id === L1.id)!;
  const bOk = await store.modifyEntry(db, RAKESH, L1.id, { department: "Conc Dept One Renamed", location: "Gate 1", number: "43602" }, [], fresh.version);
  ok("B looks again (the current version) and saves: it works, A's number is kept", bOk.status === "ok" && bOk.entry.department === "Conc Dept One Renamed" && (await numberOf(L1.id)) === "43602");
  ok("a save with NO version, or a made-up one, is refused the same way and writes nothing", await (async () => { const r1 = await store.modifyEntry(db, HOD, L1.id, { department: "Conc Dept One Renamed", location: "Gate 1", number: "43603" }, []); const r2 = await store.modifyEntry(db, HOD, L1.id, { department: "Conc Dept One Renamed", location: "Gate 1", number: "43603" }, [], "AAAAAAAAAAAAAAAAAAAAAA"); const r3 = await store.modifyEntry(db, HOD, L1.id, { department: "Conc Dept One Renamed", location: "Gate 1", number: "43603" }, [], "' OR 1=1 --"); return r1.status === "stale" && r2.status === "stale" && r3.status === "stale" && (await numberOf(L1.id)) === "43602"; })());

  // the delete
  const L2 = await line("Conc Dept Two", "", "43611");
  await store.modifyEntry(db, HOD, L2.id, { department: "Conc Dept Two", location: "Annexe", number: "43611" }, [], L2.version);
  const dStale = await store.deleteEntry(db, HOD, L2.id, L2.version);
  ok("a DELETE of a line that was changed since the person saw it is refused (stale): the line is still there, and he is shown it as it is now", dStale.status === "stale" && dStale.current.location === "Annexe" && (await numberOf(L2.id)) === "43611");
  ok("...a delete with the current version works; with no version it does not", await (async () => { const none = await store.deleteEntry(db, HOD, L2.id); const okR = await store.deleteEntry(db, HOD, L2.id, dStale.status === "stale" ? dStale.current.version : ""); return none.status === "stale" && okR.status === "ok" && (await numberOf(L2.id)) === undefined; })());

  // the very same moment
  const L3 = await line("Conc Dept Three", "", "43621");
  const sameMoment = await Promise.all([
    store.modifyEntry(db, HOD, L3.id, { department: "Conc Dept Three", location: "First", number: "43621" }, [], L3.version),
    store.modifyEntry(db, RAKESH, L3.id, { department: "Conc Dept Three", location: "Second", number: "43621" }, [], L3.version),
  ]);
  ok("TWO saves of the same version at the very same moment (two connections): exactly ONE is saved, the other is refused as stale", sameMoment.filter((r) => r.status === "ok").length === 1 && sameMoment.filter((r) => r.status === "stale").length === 1, JSON.stringify(sameMoment.map((r) => r.status)));
  ok("...the line holds the winner's text whole, and exactly one history line was written", (await pool.query(`SELECT location FROM public.pax_directory WHERE id = $1`, [L3.id])).rows[0].location === (sameMoment[0].status === "ok" ? "First" : "Second") && (await modifiesOf(L3.id)) === 1);
  const L4 = await line("Conc Dept Four", "", "43631");
  const changeVsDelete = await Promise.all([
    store.modifyEntry(db, HOD, L4.id, { department: "Conc Dept Four", location: "Late", number: "43631" }, [], L4.version),
    store.deleteEntry(db, HOD, L4.id, L4.version),
  ]);
  const left = await count(`SELECT count(*) AS n FROM public.pax_directory WHERE id = ${L4.id}`);
  ok("a change and a delete at the same moment: one wins and the other is told (a delete first, then 'missing'; a change first, then 'stale'): never both", (changeVsDelete[1].status === "ok" && changeVsDelete[0].status === "missing" && left === 0) || (changeVsDelete[0].status === "ok" && changeVsDelete[1].status === "stale" && left === 1), JSON.stringify(changeVsDelete.map((r) => r.status)));
  const five: V[] = [];
  for (let i = 1; i <= 5; i++) five.push(await line(`Parallel Dept ${["Alpha", "Bravo", "Charlie", "Delta", "Echo"][i - 1]}`, "", `4364${i}`));
  const fiveR = await Promise.all(five.map((l) => store.modifyEntry(db, HOD, l.id, { department: l.department, location: "Parallel", number: l.number }, [], l.version)));
  ok("five DIFFERENT lines changed at the same moment: all five are saved (only the same line has to wait), none is lost", fiveR.every((r) => r.status === "ok") && (await count(`SELECT count(*) AS n FROM public.pax_directory WHERE location = 'Parallel'`)) === 5);

  // a writer that does not know our lock (a SQL script)
  const L5 = await line("Conc Dept Five", "", "43651");
  const script = await pool.connect();
  await script.query("BEGIN"); await script.query(`UPDATE public.pax_directory SET location = 'sql script' WHERE id = $1`, [L5.id]);
  let settled = false;
  const waiting = store.modifyEntry(db, HOD, L5.id, { department: "Conc Dept Five", location: "my edit", number: "43651" }, [], L5.version).then((r) => { settled = true; return r; });
  await new Promise((r) => setTimeout(r, 400));
  const stillWaiting = !settled;
  await script.query("COMMIT"); script.release();
  const afterScript = await waiting;
  ok("a writer that does NOT know our lock (a SQL script with a change not yet committed): the save WAITS for it, and when the script has committed the save is refused as stale: the script's change is NOT overwritten", stillWaiting && afterScript.status === "stale" && (await pool.query(`SELECT location FROM public.pax_directory WHERE id = $1`, [L5.id])).rows[0].location === "sql script", `${stillWaiting} ${afterScript.status}`);

  // the number belongs to ONE place: two people add it at the same moment
  const sameNumber = await Promise.all([
    store.addEntry(db, HOD, { department: "Race Dept One", location: "", number: "43661" }),
    store.addEntry(db, RAKESH, { department: "Race Dept Two", location: "", number: "43661" }),
  ]);
  ok("two people add the SAME PAX number (for two different places) at the same moment: one is saved, the other is told that a number belongs to one place only", sameNumber.filter((r) => r.status === "ok").length === 1 && sameNumber.filter((r) => r.status === "conflict").length === 1 && (await count(`SELECT count(*) AS n FROM public.pax_directory WHERE "number"::text = '43661'`)) === 1, JSON.stringify(sameNumber.map((r) => r.status)));
  const clash = await store.addEntry(db, HOD, { department: "Somebody Else", location: "", number: "43661" });
  const listNow = await store.listEntries(db, "");
  ok("the lines named in a clash carry their version too (the same one the list shows), so that 'Edit this line' from the question can be saved at once", clash.status === "conflict" && clash.conflicts.length > 0 && clash.conflicts.every((c) => c.existing.length > 0 && c.existing.every((l) => !!l.version && l.version === listNow.find((e) => e.id === l.id)?.version)));

  await pool.end();
  console.log(`adminStore selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

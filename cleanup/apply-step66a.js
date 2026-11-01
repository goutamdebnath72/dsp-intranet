// cleanup/apply-step66a.js
//
// Step 66a: THE EMPLOYEE MANAGER (add, change and delete employees; the HOD of C&IT first, who can authorise and withdraw executives). For a tree where step 65c is applied.
// Edits 7 places in 5 of your files (each is the exact text to insert or to replace; nothing else in them is touched):
//   src/lib/employees/analytics.ts, src/hooks/useOmniSearch.ts   the type of the new payload (employeeAdmin), beside the PAX editor's
//   src/lib/nl2sql/omnibar.ts                                    the route of the manager: its dependency, its place in runOmnibar (first, before the date lookup), its wiring
//   src/components/OmnibarModal.tsx                              the import and the drawing of the panel (after the PAX editor)
//   STATUS.md                                                    the row of this step
// Everything else comes with the zip: src/lib/employees/admin/*, the route src/app/api/employees/admin/route.ts, src/components/EmployeeAdminPanel.tsx, sql/15_employee_admin.sql and the tests.
// ONE THING TO DO BY HAND, ONCE: run src/lib/nl2sql/sql/15_employee_admin.sql in the Supabase SQL editor (it creates two tables; the panel names the file if you forget).
//
// Run from the project root:  node cleanup/apply-step66a.js
// ALL-OR-NOTHING: every place is checked first; if any is not what the patch was made for, NOTHING is written and the script says which. Safe to run twice.

const fs = require("fs");
const path = require("path");

const ITEMS = [{"file": "src/lib/employees/analytics.ts", "insert": true, "anchor": "  /** The PAX directory editor was asked for by someone who may use it (step 64a): drawn as a panel by PaxAdminPanel. The same type in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */\n", "text": "  /** The employee manager was asked for by someone who may use it (step 66a): drawn as a panel by EmployeeAdminPanel. The same type in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */\n  employeeAdmin?: import(\"@/lib/employees/admin/types\").EmployeeAdminOpen;\n"}, {"file": "src/hooks/useOmniSearch.ts", "insert": true, "anchor": "  /** The PAX directory editor was asked for by someone who may use it (step 64a): drawn as a panel by PaxAdminPanel. The same type in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */\n", "text": "  /** The employee manager was asked for by someone who may use it (step 66a): drawn as a panel by EmployeeAdminPanel. The same type in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */\n  employeeAdmin?: import(\"@/lib/employees/admin/types\").EmployeeAdminOpen;\n"}, {"file": "src/lib/nl2sql/omnibar.ts", "insert": true, "anchor": "  /** The date of birth or date of joining of an employee (step 65b)", "text": "  /** A request to CHANGE employee data (step 66a): the HOD of C&IT, and an executive he has authorised, get the employee manager; everybody else, logged in or not, one plain sentence; null when the sentence is not such a request. */\n  employeeAdmin?: (q: string, ticket: string | null) => Promise<AnalyticsPayload | null>;\n"}, {"file": "src/lib/nl2sql/omnibar.ts", "insert": true, "anchor": "    // 0---. the date of birth / date of joining of an employee (step 65b)", "text": "    // 0----. a request to CHANGE employee data (step 66a): \"add new employee\", \"edit employee record\", \"change dob of X\", \"delete employee 498880\", \"delegate employee editing to X\". The sentence is read first (pure) and an action word has to LEAD it, so a question about employees never lands here; only such a sentence asks who the person is.\n    const employeeAdmin = deps.employeeAdmin ? await deps.employeeAdmin(q, userKey).catch(() => null) : null;\n    if (employeeAdmin) return { ...employeeAdmin, source: \"holiday\", attempt };\n\n"}, {"file": "src/lib/nl2sql/omnibar.ts", "insert": true, "anchor": "    dates: async (qq, ticket) => {", "text": "    employeeAdmin: async (qq, ticket) => {\n      // the employee manager (step 66a, src/lib/employees/admin/omnibar.ts): the sentence is read first (pure), the database is asked only for a sentence that IS such a request\n      const { answerEmployeeAdmin } = await import(\"@/lib/employees/admin/omnibar\");\n      const { authorityForTicket } = await import(\"@/lib/employees/admin/access\");\n      const { getDb } = await import(\"@/lib/db\");\n      return answerEmployeeAdmin(qq, ticket, { authority: async (t) => authorityForTicket(await getDb(), t) });\n    },\n"}, {"file": "src/components/OmnibarModal.tsx", "insert": false, "old": "import { PaxAdminPanel } from \"@/components/PaxAdminPanel\";\n", "new": "import { PaxAdminPanel } from \"@/components/PaxAdminPanel\";\nimport { EmployeeAdminPanel } from \"@/components/EmployeeAdminPanel\";\n"}, {"file": "src/components/OmnibarModal.tsx", "insert": false, "old": "                            {analytics.paxAdmin ? (\n                              <PaxAdminPanel open={analytics.paxAdmin} />\n                            ) : analytics.hospital ? (", "new": "                            {analytics.paxAdmin ? (\n                              <PaxAdminPanel open={analytics.paxAdmin} />\n                            ) : analytics.employeeAdmin ? (\n                              <EmployeeAdminPanel open={analytics.employeeAdmin} />\n                            ) : analytics.hospital ? ("}];
const ROW_66A = "| 66a | **The employee manager: add, change and delete employees (owner, 1 Nov 2026).** The HOD of C&IT first; he authorises and withdraws executives (a list of its own, `employee_admin_delegate`, apart from the PAX editor's). ASKED FOR in the search bar by a sentence led by an action word ('add new employee', 'edit employee record', 'change dob of X', 'delete employee 498880', 'delegate employee editing to X'); a question about employees is never taken for a change; the person is the LOGIN's ticket, never anything typed. WHAT IT EDITS: the roster row (ticket, SAIL P.No., name, designation, department, position in the grade, the doctor flag, address, two e-mails) and the two dates; NOT the login account's password or role. THE FORM: four sections (Identity, Posting, Service dates, Contact), live validation (the SAME function runs in the panel and on the server), designation and department lists that follow the ticket, a live card of how he will appear, a review step (a new person's summary; a change field by field) and a button that stays off until the record is right. RULES: ticket 6 digits; executive = starts with 4 (the cohort is never typed); 49xxxx = direct recruit; designation and department must fit the cohort; a person goes LAST in his grade (rank = grade order x 10000 + position, the HR formula; a new designation clears the old position); the same name in the same department asks 'is this a different person?'; the ticket cannot be changed (delete and add). DATES stay the HOD's: an authorised executive neither sees nor sets them (a locked card, no date in his searches or in the history, a date he sends is ignored); a date the HOD sets by hand is marked real (hr). DELETE: the HOD only, the ticket typed back, never the HOD himself, the login account removed with him unless unticked; an authorised executive who is deleted loses the authority. HISTORY (`employee_admin_audit`, append only by a trigger): who did what to whom and the record before and after, written in the SAME transaction as the change; the HOD reads dates in it, a delegate reads 'hidden'. The store DISCOVERS the roster's optional columns (a table without address, web-mail or the doctor flag still works; a NOT NULL source_snapshot_date is filled with today). `sql/15_employee_admin.sql` creates the two tables (run once; the panel names the file if it is missing). The date guard now allows exactly THREE readers of the date columns (the lists, the date lookup, this store). PROOF (sandbox, NOT live): intent 62, validation 41, store 68 (a roster with the live rules: unique ticket+cohort, the login link, a NOT NULL snapshot date; concurrency; atomicity; each security rule mutated and the tests fail), search bar 25, panel 44, and a click-through of the REAL panel under StrictMode against the real handler and a database (45 steps, the HOD and a delegate). NOT VERIFIED: the two SQL files (14 re-run, 15) on the live database; the live roster's rules beyond the handoff's description (the four schema queries are still to be run); the look of the form in the real modal. OPEN: photo and mobile number (they live in the login account's table, not the roster); an undo of a delete (the history holds the whole record). | owner to install and test |";
const STATUS_MARKER = "| 66a | **The employee manager";
const STATUS_ANCHORS = ["| 65c | **Luxon everywhere", "| 65b | **People & Events: what the owner said", "| 65a | **People & Events with REAL data", "| 64f | **PAX editor: the Add form"];

function main() {
  const root = process.cwd();
  if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(path.join(root, "src", "lib", "dates.ts"))) {
    console.error("Run this from the project root, in a tree where step 65c is applied (src/lib/dates.ts is missing).");
    process.exit(1);
  }
  const problems = [], report = [];
  const texts = new Map();
  const load = (f) => { if (!texts.has(f)) texts.set(f, fs.readFileSync(path.join(root, f), "utf8")); return texts.get(f); };
  const changed = new Set();
  for (const it of ITEMS) {
    if (!fs.existsSync(path.join(root, it.file))) { problems.push(`${it.file}: the file is missing`); continue; }
    let t = load(it.file);
    const done = it.insert ? t.includes(it.text) : t.includes(it.new);
    const label = (it.insert ? it.text : it.new).trim().slice(0, 48).replace(/\n/g, " ");
    if (done) { report.push(`already there   ${it.file}   (${label}...)`); continue; }
    const key = it.insert ? it.anchor : it.old;
    const n = t.split(key).length - 1;
    if (n !== 1) { problems.push(`${it.file}: the place for "${label}..." was found ${n} times (it must be exactly once): the tree is not at step 65c, or you have edited that spot`); continue; }
    t = it.insert ? t.replace(key, () => it.text + key) : t.replace(key, () => it.new);
    texts.set(it.file, t); changed.add(it.file);
    report.push(`will change     ${it.file}   (${label}...)`);
  }
  const st = path.join(root, "STATUS.md");
  let stNew = null;
  if (!fs.existsSync(st)) problems.push("STATUS.md: the file is missing");
  else {
    const cur = fs.readFileSync(st, "utf8");
    if (cur.includes(STATUS_MARKER)) report.push("already there   STATUS.md");
    else {
      const anchor = STATUS_ANCHORS.find((a) => cur.split(a).length - 1 === 1);
      if (!anchor) problems.push("STATUS.md: the place for the new row (above the newest row) was not found exactly once");
      else { stNew = cur.replace(anchor, () => ROW_66A + "\n" + anchor); report.push("will change     STATUS.md"); }
    }
  }
  if (problems.length) { console.error("NOTHING WAS WRITTEN. Problems:\n  " + problems.join("\n  ")); process.exit(1); }
  for (const f of changed) fs.writeFileSync(path.join(root, f), texts.get(f));
  if (stNew !== null) fs.writeFileSync(st, stNew);
  console.log(report.join("\n"));
  const n = changed.size + (stNew !== null ? 1 : 0);
  console.log(n ? `\nDone: ${n} file(s) changed.` : "\nNothing to do: step 66a is already applied.");
}
main();

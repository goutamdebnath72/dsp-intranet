// cleanup/apply-step67b.js
//
// Step 67b: TWO PEOPLE AT ONCE (the guard against a lost update, for the employee manager and the PAX editor) and THE NAME KNOWN BEFORE ANYTHING IS ASKED. It needs step 67a (the PAX redesign) applied first.
// The zip brings the files: src/lib/concurrency/version.ts and its test, src/hooks/useSessionName.ts, the employee manager's and the PAX editor's stores, handlers, types, screens and tests. This script changes the ONE
// place of YOUR code that has to know about the name (src/lib/nl2sql/omnibar.ts: two lines hand the directory's name function to the two panels), only if it is still exactly what the patch was made for, and writes the
// row of this step in STATUS.md. NO SQL. Run from the project root:  node cleanup/apply-step67b.js        ALL-OR-NOTHING; safe to run twice.
// AFTER INSTALLING: refresh the page once (a panel opened before has no version in its records). Production must have NEXTAUTH_SECRET set (NextAuth needs it anyway).

const fs = require("fs");
const path = require("path");

const OLD1 = "      const { authorityForTicket } = await import(\"@/lib/employees/admin/access\");\n      const { getDb } = await import(\"@/lib/db\");\n      return answerEmployeeAdmin(qq, ticket, { authority: async (t) => authorityForTicket(await getDb(), t) });";
const NEW1 = "      const { authorityForTicket } = await import(\"@/lib/employees/admin/access\");\n      const { nameOfTicket } = await import(\"@/lib/pax/admin/access\");\n      const { getDb } = await import(\"@/lib/db\");\n      return answerEmployeeAdmin(qq, ticket, { authority: async (t) => authorityForTicket(await getDb(), t), nameOf: async (t) => nameOfTicket(await getDb(), t) });";
const OLD2 = "      const { authorityForTicket } = await import(\"@/lib/pax/admin/access\");\n      const { getDb } = await import(\"@/lib/db\");\n      return answerPaxAdmin(qq, ticket, { authority: async (t) => authorityForTicket(await getDb(), t) });";
const NEW2 = "      const { authorityForTicket, nameOfTicket } = await import(\"@/lib/pax/admin/access\");\n      const { getDb } = await import(\"@/lib/db\");\n      return answerPaxAdmin(qq, ticket, { authority: async (t) => authorityForTicket(await getDb(), t), nameOf: async (t) => nameOfTicket(await getDb(), t) });";
const ROW_67B = "| 67b | **Two people at once: the guard against a LOST UPDATE, and the name known before anything is asked (owner, 1 Nov 2026: \"since several authorised people may change the same employee or the same PAX line we have to guard that robustly\"; \"get the person's data from the session cookie, no fresh request\").** THE PROBLEM: the stores already took a global write lock, which makes two saves at the very same instant safe, but nothing asked whether the form being saved was still what the database held: A changes Ravi's designation, B (whose form is older) fixes only an address, and B's save puts the OLD designation back, silently. Delete had the same hole. Employees and PAX lines both. THE GUARD (`src/lib/concurrency/version.ts`): every record the manager shows carries a VERSION, an HMAC (key: NEXTAUTH_SECRET, the secret NextAuth already needs; with none, a fixed development text) of the RAW values of the fields that can change (the real mobile and e-mails, not the masks: a plain hash of a masked number could be brute-forced). A change or a delete must send the version the person SAW; the store LOCKS THE ROW (`FOR UPDATE`, also the login account's) and works the version out again; if it differs the save is REFUSED as 'stale': nothing is written, the answer carries the record as it is now (as THIS person may see it) and the last change recorded (who, when, what kind; never a value). A missing or made-up version is refused the same way. The row lock also holds back any writer that does not know the global lock (a SQL script): the save waits for it and is then refused as stale, the script's change survives. The token is of the CONTENT, so a change by anything is seen, no new column, and a value changed and put back is correctly not a conflict. An authorised executive's version leaves the dates out, so the HOD changing only a date does not make his open form stale. THE SCREEN: a card 'Somebody else changed this record (line) while you were editing it' says who and when, lists WHAT they changed (it was / it is now), and offers 'Keep my edits on top of their version' (a THREE-WAY MERGE: a field the person changed keeps his value, every other field takes theirs, so he can never put back what they changed; a field both changed is kept as his and named in an amber message) or 'Show their version (drop my edits)'. The save button waits, with the reason, while the card is shown. A stale DELETE re-asks with the record as it is now and says who changed it. THE NAME: it travels WITH the answer that opens the employee manager or the PAX editor (the directory's name for the login's ticket, asked IN PARALLEL with the authority check, so no extra waiting), so the header has it on the very first paint; otherwise the login cookie's session name is used (`src/hooks/useSessionName.ts`: display only, safe without a provider; the owner checked that every login name equals the directory name); only when neither has it is it asked for, and then it is shown as soon as it arrives, never held back by the lookups (before, it waited for BOTH requests). Nothing is DECIDED on the cookie: who may do what is checked by the server, from the database, on every request (a withdrawn authority takes effect at once; a cookie would keep saying 'authorised'). WHAT TO KNOW: production must have NEXTAUTH_SECRET set (it must already, for NextAuth). A panel opened BEFORE this patch carries no version: refresh the page once, or its first save says 'stale'. Add and the same-name check were already safe (serialised by the global lock; now proved by tests). No SQL. PROOF (sandbox, NOT live): version token 13; employee store 108 and PAX store 102, with REAL parallel connections (two saves of one version: one wins; change against delete; five people at once; two adds of the same name or number; a SQL script with an uncommitted change: the save waits then is stale; the real mobile covered; the dates left out for an executive) and the guard deliberately broken 5 ways (employees) and 4 ways (PAX), each caught; form model 34; panel tests 96 and 106; click-throughs of the REAL panels against the real handlers: employee 86 and PAX 66, including HOD against an authorised executive (the card, keep mine, show theirs, an overlap, a stale delete) and the name checks (no 'me' request; the name shown while the lookups are still on their way). NOT VERIFIED: the live database (it needs the audit tables of steps 64 and 66 as they are), the look in the owner's browser. | owner to install and test |";
const MARKER = "| 67b | **Two people at once";
const ANCHOR = "| 67a | **The PAX directory editor redesigned";

function main() {
  const root = process.cwd();
  const need = ["package.json", "src/components/PaxAdminUi.tsx", "src/components/EmployeeAdminUi.tsx", "src/lib/concurrency/version.ts", "src/hooks/useSessionName.ts", "src/lib/nl2sql/omnibar.ts"];
  const missing = need.filter((f) => !fs.existsSync(path.join(root, f)));
  if (missing.length) {
    console.error("This patch needs step 67a (patch_step67a.zip) to be applied first, and its own files unzipped here. Missing: " + missing.join(", ") + "\nInstall patch_step67a.zip first (unzip, then node cleanup/apply-step67a.js), then unzip this one again and run this script.");
    process.exit(1);
  }
  const problems = [], report = [], writes = [];
  const of = path.join(root, "src/lib/nl2sql/omnibar.ts");
  let t = fs.readFileSync(of, "utf8");
  const had = t;
  for (const [oldT, newT, what] of [[OLD1, NEW1, "the employee manager"], [OLD2, NEW2, "the PAX editor"]]) {
    if (t.includes(newT)) report.push(`already there   omnibar.ts (the name for ${what})`);
    else if (t.split(oldT).length - 1 === 1) { t = t.replace(oldT, () => newT); report.push(`will change     omnibar.ts (the name for ${what})`); }
    else problems.push(`src/lib/nl2sql/omnibar.ts: the lines that wire ${what} were not found exactly once (the file has been edited): send the file`);
  }
  if (t !== had) writes.push([of, t]);
  const st = path.join(root, "STATUS.md");
  let stNew = null;
  if (!fs.existsSync(st)) problems.push("STATUS.md: the file is missing");
  else {
    const cur = fs.readFileSync(st, "utf8");
    if (cur.includes(MARKER)) report.push("already there   STATUS.md");
    else if (cur.split(ANCHOR).length - 1 === 1) { stNew = cur.replace(ANCHOR, () => ROW_67B + "\n" + ANCHOR); report.push("will change     STATUS.md"); }
    else problems.push("STATUS.md: the place for the new row (above the row of step 67a) was not found exactly once");
  }
  if (problems.length) { console.error("NOTHING WAS WRITTEN. Problems:\n  " + problems.join("\n  ")); process.exit(1); }
  for (const [full, text] of writes) fs.writeFileSync(full, text);
  if (stNew !== null) fs.writeFileSync(st, stNew);
  console.log(report.join("\n"));
  const n = writes.length + (stNew !== null ? 1 : 0);
  console.log(n ? `\nDone: ${n} file(s) changed. Now refresh the page once.` : "\nNothing to do: step 67b is already applied.");
}
main();

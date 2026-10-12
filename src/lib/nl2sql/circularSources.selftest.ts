// src/lib/nl2sql/circularSources.selftest.ts
// Run:  npx tsx src/lib/nl2sql/circularSources.selftest.ts      (no database: the lookups are answered by stand-ins)
import { buildCircularSources, buildSourceInfo, emptyScheduleAnswer, pendingScheduleNote, scheduleAsked, ticketLookupNote, ticketsAsked, unconfirmedNote, type RunQuery } from "./circularSources";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

const L3 = "Circular 003 (2024)";
const L9 = "Circular 009 (2024)";
const META = [
  { circular: L3, circular_id: 23, circular_title: "CIRCULAR-HEALTH CHECK UP OF NON-EXECUTIVE EMPLOYEES DURING THE MONTH OF JANUARY-2025" },
  { circular: L9, circular_id: 30, circular_title: "CIRCULAR-HEALTH CHECK-UP FOR NON-EXECUTIVE EMPLOYEES DURING THE MONTH OF DECEMBER-2024" },
];
const PAGES = [
  { circular: L3, ticket_no: "100001", name: "AMIT BANERJEE", page_number: 3, verified: true },
  { circular: L3, ticket_no: "100002", name: "RITA SEN", page_number: 4, verified: true },
  { circular: L3, ticket_no: "100099", name: "SOMEONE NOT IN THE ANSWER", page_number: 7, verified: false }, // must not add page 7, nor count as unconfirmed
  { circular: L9, ticket_no: "100001", name: "AMIT BANERJEE", page_number: 8, verified: true },
  { circular: L3, ticket_no: null, name: "NO TICKET PERSON", page_number: 5, verified: false },
  { circular: L3, ticket_no: "200001", name: "GHOST ONE", page_number: 6, verified: false },
  { circular: L3, ticket_no: "200002", name: "GHOST TWO", page_number: 6, verified: false },
];
function fake(meta: Array<Record<string, unknown>> = META, pages: Array<Record<string, unknown>> = PAGES) {
  const seen: Array<{ sql: string; params: unknown[] }> = [];
  const run: RunQuery = async (sql, params) => {
    seen.push({ sql, params });
    if (/SELECT DISTINCT circular, circular_id/.test(sql)) return meta.filter((m) => (params[0] as string[]).includes(m.circular as string));
    if (/page_number, verified/.test(sql)) return pages.filter((p) => (params[0] as string[]).includes(p.circular as string));
    return [];
  };
  return { run, seen };
}
const cols = ["ticket_no", "name", "department_code", "department", "checkup_date", "circular", "verified"];
const row = (ticket_no: string | null, name: string, circular: string) => ({ ticket_no, name, department_code: 1, department: "X", checkup_date: "2025-01-15", circular, verified: true });

(async () => {
  // 1. one schedule: one source, with the page(s) of the listed people only
  {
    const f = fake();
    const s = await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L3), row("100002", "RITA SEN", L3)], f.run);
    check("one circular: one source with its id, label, full title and the pages of the listed people (3 and 4), not the page of someone not in the answer (7)", s.length === 1 && s[0].circularId === 23 && s[0].label === L3 && /JANUARY-2025/.test(s[0].title) && s[0].pages.join() === "3,4", JSON.stringify(s));
  }
  // 2. two schedules: one source each, in the order they first appear
  {
    const s = await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L9), row("100001", "AMIT BANERJEE", L3)], fake().run);
    check("a person on two schedules: one source per circular, in the order the answer shows them (December first here), each with its own page", s.map((x) => x.circularId).join() === "30,23" && s[0].pages.join() === "8" && s[1].pages.join() === "3", JSON.stringify(s));
  }
  // 3. the same circular on many rows is one source
  {
    const s = await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L3), row("100002", "RITA SEN", L3), row("100001", "AMIT BANERJEE", L3)], fake().run);
    check("many rows of one circular give ONE source line (not one per row)", s.length === 1);
  }
  // 4. a person without a (shown) ticket is found by name
  {
    const s = await buildCircularSources(cols, [row(null, "NO TICKET PERSON", L3)], fake().run);
    check("a row with no ticket is placed by name (page 5)", s.length === 1 && s[0].pages.join() === "5", JSON.stringify(s));
  }
  // 5. what is not a health check-up answer, or has nothing to look up
  {
    const f = fake();
    check("an answer without a 'circular' column gets no source line and no lookup is made", (await buildCircularSources(["ticket_no", "name"], [row("100001", "A", L3)], f.run)).length === 0 && f.seen.length === 0);
    check("no rows: nothing", (await buildCircularSources(cols, [], f.run)).length === 0 && f.seen.length === 0);
    check("rows whose circular is empty: nothing", (await buildCircularSources(cols, [{ ...row("1", "A", L3), circular: null as unknown as string }], f.run)).length === 0);
  }
  // 6. things that go wrong never break the answer
  {
    const boom: RunQuery = async () => { throw new Error("connection lost"); };
    check("a failing lookup gives NO source line (and no error): the answer itself is unaffected", (await buildCircularSources(cols, [row("100001", "A", L3)], boom)).length === 0);
    check("a circular whose id cannot be found has no link (never a link without an id)", (await buildCircularSources(cols, [row("100001", "A", L3)], fake([], PAGES).run)).length === 0);
    const noPages = await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L3)], fake(META, []).run);
    check("pages unknown: the source line is still given (the viewer opens at the first page)", noPages.length === 1 && noPages[0].pages.length === 0);
    const junk = await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L3)], fake([{ circular: L3, circular_id: "abc" as unknown as number, circular_title: "T" }], PAGES).run);
    check("a circular id that is not a whole number is never used", junk.length === 0);
    const oddPage = await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L3)], fake(META, [{ circular: L3, ticket_no: "100001", name: "AMIT BANERJEE", page_number: 0 }, { circular: L3, ticket_no: "100001", name: "AMIT BANERJEE", page_number: 2.5 }]).run);
    check("a page that is not a positive whole number is ignored", oddPage.length === 1 && oddPage[0].pages.length === 0);
  }
  // 7. the lookups are parameterised and read only the check-up view
  {
    const f = fake();
    await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L3)], f.run);
    check("both lookups read only nlq.health_checkups, and the values travel as parameters (nothing from the answer is pasted into the SQL)", f.seen.length === 2 && f.seen.every((q) => /FROM nlq\.health_checkups/.test(q.sql) && !/public\./.test(q.sql) && !q.sql.includes(L3) && !q.sql.includes("100001") && !q.sql.includes("AMIT")), JSON.stringify(f.seen.map((q) => q.sql.slice(0, 60))));
  }
  // 8. who is NOT in the HR directory (the answer says so only when it applies)
  {
    const info = await buildSourceInfo(cols, [row("100001", "AMIT BANERJEE", L3), row("200001", "GHOST ONE", L3), row("100002", "RITA SEN", L3), row(null, "NO TICKET PERSON", L3)], fake().run);
    check("people HR does not know are named, in the order of the answer (found by ticket, or by name when there is no ticket)", info.unconfirmed.join("|") === "GHOST ONE|NO TICKET PERSON", JSON.stringify(info.unconfirmed));
    const none = await buildSourceInfo(cols, [row("100001", "AMIT BANERJEE", L3), row("100002", "RITA SEN", L3)], fake().run);
    check("when everybody is confirmed there is nobody to name", none.unconfirmed.length === 0);
    const other = await buildSourceInfo(cols, [row("100001", "AMIT BANERJEE", L3)], fake().run);
    check("someone unconfirmed who is NOT in the answer (100099) is never named", other.unconfirmed.length === 0);
    const noFlag = await buildSourceInfo(cols, [row("100001", "AMIT BANERJEE", L3)], fake(META, [{ circular: L3, ticket_no: "100001", name: "AMIT BANERJEE", page_number: 3 } as never]).run);
    check("a row with no 'verified' value is not called unconfirmed (only an explicit false is)", noFlag.unconfirmed.length === 0);
  }
  check("the note: nobody -> none", unconfirmedNote([], 15) === null);
  check("the note: one person looked up -> 'This person is not in the HR directory ...' (no counts)", unconfirmedNote(["GOUTAM BISWAS"], 1) === "This person is not in the HR directory; the ticket shown is as printed in the circular.");
  check("the note: one of a list -> '1 of the 15 people listed is not ...' (singular verb) with the name", unconfirmedNote(["GOUTAM BISWAS"], 15) === "1 of the 15 people listed is not in the HR directory (the ticket shown is as printed in the circular): GOUTAM BISWAS.");
  check("the note: several -> plural verb, all names", unconfirmedNote(["A B", "C D"], 15) === "2 of the 15 people listed are not in the HR directory (the ticket shown is as printed in the circular): A B, C D.");
  check("the note: more than five names -> five and 'and N more' (the line stays short)", unconfirmedNote(["A", "B", "C", "D", "E", "F", "G"], 20) === "7 of the 20 people listed are not in the HR directory (the ticket shown is as printed in the circular): A, B, C, D, E and 2 more.");

  // 9. schedules whose circular is in the archive but whose rows are not (the upload could not finish reading them)
  {
    const q = (rows: Array<Record<string, unknown>>): RunQuery => async () => rows;
    check("nothing pending: no sentence", (await pendingScheduleNote(q([]))) === null);
    check("one schedule not read yet: named by its archive label", (await pendingScheduleNote(q([{ serial: 3, year: 2024, headline: "H" }]))) === "The health check-up schedule of Circular 003 (2024) has not been read yet, so it is not included.");
    check("two: 'A and B', plural", (await pendingScheduleNote(q([{ serial: 3, year: 2024, headline: "H" }, { serial: 9, year: 2024, headline: "H" }]))) === "The health check-up schedules of Circular 003 (2024) and Circular 009 (2024) have not been read yet, so they are not included.");
    check("three: 'A, B and C'", (await pendingScheduleNote(q([{ serial: 1, year: 2025, headline: "H" }, { serial: 2, year: 2025, headline: "H" }, { serial: 3, year: 2025, headline: "H" }]))) === "The health check-up schedules of Circular 001 (2025), Circular 002 (2025) and Circular 003 (2025) have not been read yet, so they are not included.");
    check("a circular with no serial number is named by its headline", /"CIRCULAR-HEALTH CHECK UP"/.test(String(await pendingScheduleNote(q([{ serial: null, year: 2025, headline: "CIRCULAR-HEALTH CHECK UP" }])))));
    const boom: RunQuery = async () => {
      throw new Error('relation "public.circular_ingest_log" does not exist');
    };
    check("if the log table does not exist yet: no sentence, no error", (await pendingScheduleNote(boom)) === null);
  }

  // 10. which tickets a question is about
  check("the ticket is read from the SQL that ran: ticket_no = '228757'", JSON.stringify(ticketsAsked("anything", "SELECT a FROM nlq.health_checkups WHERE ticket_no = '228757' AND schedule_year = 2025")) === '["228757"]');
  check("...also an IN list, and two tickets are both kept", JSON.stringify(ticketsAsked("", "SELECT a FROM nlq.health_checkups WHERE ticket_no IN ('228757', '240463')")) === '["228757","240463"]');
  check("with no ticket in the SQL, a six-digit number in the question is used; a number of another length is not", JSON.stringify(ticketsAsked("which department is ticket 228757 in for 2025 and page 12345", "SELECT a FROM t")) === '["228757"]');
  check("the SQL wins over the question, and at most three tickets are kept", JSON.stringify(ticketsAsked("ticket 111111", "WHERE ticket_no = '222222'")) === '["222222"]' && ticketsAsked("111111 222222 333333 444444 555555", "").length === 3);
  check("no ticket anywhere: nothing", ticketsAsked("who has the health check-up on 5 January 2026", "WHERE checkup_date = '2026-01-05'").length === 0);

  // 11. which schedule a question asked about
  check("the schedule asked about is read from the SQL: year 2025, month 1 -> 'January 2025'", scheduleAsked("WHERE ticket_no = '228757' AND schedule_year = 2025 AND schedule_month_no = 1") === "January 2025");
  check("...a month of 12 -> December; a schedule named in words is used as written", scheduleAsked("WHERE schedule_year = 2024 AND schedule_month_no = 12") === "December 2024" && scheduleAsked("WHERE schedule = 'February 2026'") === "February 2026");
  check("a SQL that names no schedule, only a year, or an impossible month gives null", scheduleAsked("WHERE checkup_date = '2025-01-15'") === null && scheduleAsked("WHERE schedule_year = 2025") === null && scheduleAsked("WHERE schedule_year = 2025 AND schedule_month_no = 13") === null);

  // 12. an empty answer about a ticket: said the way a person would say it
  {
    const mk = (hr: Array<Record<string, unknown>>, on: Array<Record<string, unknown>>): RunQuery => async (sql) => (/nlq\.employees/.test(sql) ? hr : on);
    const onJan26 = [{ schedule: "January 2026", d: "01 Jan 2026", circular: "Circular 010 (2025)", name: "BISWAJIT BHATTACHARJEE" }];
    const known = await ticketLookupNote(mk([{ name: "BISWAJIT BHATTACHARJEE", department: "CO & CC (BATTERY)" }], onJan26), ["228757"], "January 2025");
    check("the 12 Oct case, in plain words: what was asked first, then who he is and where he IS", known === "Ticket 228757 is not on the January 2025 health check-up list. It belongs to BISWAJIT BHATTACHARJEE, department CO & CC (BATTERY). This ticket is on the January 2026 list, on 01 Jan 2026 (Circular 010 (2025)).", String(known));
    check("...it never says 'row' or 'no row matches' (database language), and has no doubled brackets '))' in a row of nested text", !/\brows?\b/i.test(String(known)));
    const two = await ticketLookupNote(mk([{ name: "A B", department: "D" }], [{ schedule: "December 2024", d: "05 Dec 2024", circular: "Circular 009 (2024)", name: "A B" }, ...onJan26]), ["1"], "February 2025");
    check("on two lists: both are named, in order, and the question's own list is the one said to be missing from", two?.startsWith("Ticket 1 is not on the February 2025 health check-up list.") === true && two.includes("the December 2024 list, on 05 Dec 2024 (Circular 009 (2024)); the January 2026 list, on 01 Jan 2026 (Circular 010 (2025))"), String(two));
    check("a ticket HR knows that is on no list", (await ticketLookupNote(mk([{ name: "A B", department: "D" }], []), ["1"], "January 2025")) === "Ticket 1 is not on the January 2025 health check-up list. It belongs to A B, department D, but it is not on any health check-up list in the system.");
    check("HR's department may be missing: the name alone is given", (await ticketLookupNote(mk([{ name: "A B", department: null }], onJan26), ["1"], "January 2025"))?.includes("It belongs to A B. This ticket is on") === true);
    check("a ticket on a list that HR does not know (a person who has left)", (await ticketLookupNote(mk([], onJan26), ["1"], "January 2025")) === "Ticket 1 is not on the January 2025 health check-up list. The name printed for it is BISWAJIT BHATTACHARJEE. This ticket is on the January 2026 list, on 01 Jan 2026 (Circular 010 (2025)). It is not in the HR directory.");
    check("a ticket nobody knows", (await ticketLookupNote(mk([], []), ["000000"], "January 2025")) === "Ticket 000000 is not on the January 2025 health check-up list. It is not in the HR directory and is not on any other health check-up list in the system.");
    check("when the question named no list the sentence says 'that health check-up list'", (await ticketLookupNote(mk([], []), ["000000"]))?.startsWith("Ticket 000000 is not on that health check-up list.") === true);
    check("two tickets: one paragraph each", ((await ticketLookupNote(mk([], []), ["1", "2"], "January 2025")) ?? "").split("Ticket ").length === 3);
    const boom: RunQuery = async () => {
      throw new Error("connection lost");
    };
    check("if the lookup fails: nothing is added, no error (the answer stays as it was)", (await ticketLookupNote(boom, ["1"])) === null);
    check("no tickets: nothing", (await ticketLookupNote(mk([], []), [])) === null);
  }

  // 13. the whole text of an empty health check-up answer
  {
    const have = ["December 2024", "January 2025", "January 2026"];
    const person = "Ticket 228757 is not on the January 2025 health check-up list. It belongs to X. This ticket is on the January 2026 list, on 01 Jan 2026 (Circular 010 (2025)).";
    check("about a ticket, the list asked about exists: just the person sentence (no list of schedules, which has nothing to do with the question)", emptyScheduleAnswer({ person, askedLabel: "January 2025", have }) === person);
    check("about a ticket, the list asked about does NOT exist: the sentence, then that there is no such list and which lists there are", emptyScheduleAnswer({ person, askedLabel: "March 2025", have }) === `${person} There is no health check-up list for March 2025 in the system. The lists in the system are: December 2024, January 2025, January 2026.`);
    check("not about a ticket: 'Nothing was found.' and the lists that exist", emptyScheduleAnswer({ person: null, askedLabel: null, have }) === "Nothing was found. The health check-up lists in the system are: December 2024, January 2025, January 2026.");
    check("...and when it asked for a list that does not exist, it says so first", emptyScheduleAnswer({ person: null, askedLabel: "March 2025", have }) === "Nothing was found. There is no health check-up list for March 2025 in the system. The health check-up lists in the system are: December 2024, January 2025, January 2026.");
    check("no list loaded at all", emptyScheduleAnswer({ person: null, askedLabel: null, have: [] }) === "No health check-up list has been loaded yet.");
    check("no jargon anywhere in these answers ('row', 'no row matches')", [emptyScheduleAnswer({ person, askedLabel: "March 2025", have }), emptyScheduleAnswer({ person: null, askedLabel: null, have }), emptyScheduleAnswer({ person: null, askedLabel: null, have: [] })].every((x) => !/\brows?\b/i.test(x)));
  }

  console.log(`\ncircularSources selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

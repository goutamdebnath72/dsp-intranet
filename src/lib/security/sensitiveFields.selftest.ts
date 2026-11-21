// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/security/sensitiveFields.selftest.ts
// The ticket number and the SAIL P.No. leave the server masked (see sensitiveFields.ts): cards for everybody, tables as described there, nothing else touched, the original untouched.
import { cardForClient, maskAnswer, maskTicket } from "./sensitiveFields";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

ok("a ticket shows its first and last character only", maskTicket("498880") === "4••••0" && maskTicket(498880) === "4••••0" && maskTicket("") === null && maskTicket(null) === null);

const card = { id: "u1", type: "employee", name: "Some Person", ticketNo: "498880", sailPNo: "D•••••2", designation: "General Manager", department: "C & IT", hasMobile: true, mobileMasked: "943479xxxx", isExecutive: true, extraFields: [{ label: "Rank", value: "3" }, { label: "P.No", value: "D001212" }, { label: "Ticket no", value: "412345" }] };
const c = cardForClient(card as never) as Record<string, unknown>;
ok("a card's ticket is masked, its origin is sent, and the rest of the card is as it was", c.ticketNo === "4••••0" && c.ticketOrigin === "direct" && c.name === "Some Person" && c.designation === "General Manager" && c.mobileMasked === "943479xxxx" && c.id === "u1");
ok("the origin comes from the real ticket (49xxxx direct, 40-48 promotee, anything else none)", (cardForClient({ ...card, ticketNo: "412345" } as never) as Record<string, unknown>).ticketOrigin === "promotee" && (cardForClient({ ...card, ticketNo: "342461" } as never) as Record<string, unknown>).ticketOrigin === "");
ok("a raw P.No. that reaches a card is masked, a masked one is left alone", (cardForClient({ ...card, sailPNo: "D001212" } as never) as Record<string, unknown>).sailPNo === "D•••••2" && c.sailPNo === "D•••••2");
const extra = c.extraFields as Array<{ label: string; value: string }>;
ok("extra chips labelled P.No or Ticket are masked, others are not", extra[0].value === "3" && extra[1].value === "D•••••2" && extra[2].value === "4••••5");
ok("a card with an already masked ticket is not masked twice", (cardForClient({ ...card, ticketNo: "4••••0", ticketOrigin: "direct" } as never) as Record<string, unknown>).ticketNo === "4••••0");

const table = { columns: [{ key: "ticket_no", label: "Ticket" }, { key: "name", label: "Name" }, { key: "sail_pno", label: "P.No" }, { key: "department_code", label: "Dept" }], rows: [{ ticket_no: "498880", name: "A", sail_pno: "D001212", department_code: 98500, origin: "direct" }], total: 1 };
const frozen = JSON.stringify(table);
const visitor = maskAnswer(table, { signedIn: false });
ok("a visitor's table has the P.No. and the ticket masked, the rest and the origin tint unchanged", visitor.rows[0].sail_pno === "D•••••2" && visitor.rows[0].ticket_no === "4••••0" && visitor.rows[0].name === "A" && visitor.rows[0].department_code === 98500 && visitor.rows[0].origin === "direct" && visitor.total === 1);
const member = maskAnswer(table, { signedIn: true });
ok("a signed-in person's table has the P.No. masked and the ticket column as it is", member.rows[0].sail_pno === "D•••••2" && member.rows[0].ticket_no === "498880");
ok("the original is not changed", JSON.stringify(table) === frozen);
const aliased = maskAnswer({ columns: [{ key: "x", label: "X" }], rows: [{ x: "D001212" }, { x: "S-11" }, { x: "98500" }] }, { signedIn: true });
ok("a raw P.No. is masked in any column (an alias cannot hide it); a grade or a number is not", aliased.rows[0].x === "D•••••2" && aliased.rows[1].x === "S-11" && aliased.rows[2].x === "98500");
const deep = maskAnswer({ analytics: { people: [card], nl2sql: { table } }, other: [1, "x", null] }, { signedIn: false }) as { analytics: { people: Array<Record<string, unknown>>; nl2sql: { table: typeof table } }; other: unknown[] };
ok("cards and tables anywhere in an answer are cut (the answer's own shape)", deep.analytics.people[0].ticketNo === "4••••0" && deep.analytics.nl2sql.table.rows[0].sail_pno === "D•••••2" && JSON.stringify(deep.other) === '[1,"x",null]');
ok("things that are not cards or tables pass through (numbers, strings, null)", JSON.stringify(maskAnswer({ a: [1, "x", null, { b: true }] }, { signedIn: false })) === '{"a":[1,"x",null,{"b":true}]}' && maskAnswer(null, { signedIn: true }) === null);
const noDigits = JSON.stringify(maskAnswer({ columns: [{ key: "sail_pno", label: "P" }, { key: "ticket_no", label: "T" }], rows: [{ sail_pno: "D001212", ticket_no: "498880" }] }, { signedIn: false }));
ok("the middle of a masked value never appears in the answer", !noDigits.includes("0012") && !noDigits.includes("9888"));
console.log(`sensitiveFields selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

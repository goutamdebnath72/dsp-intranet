// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/security/visitorView.selftest.ts
// A PERSON WHO HAS NOT SIGNED IN SEES AN EMPLOYEE AS A NAME AND A DEPARTMENT (option C): cards cut down to an allow-list, table columns taken out, nothing else changed, the original untouched.
import { readFileSync } from "node:fs";
import { visitorCard, visitorView } from "./visitorView";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const src = (p: string) => readFileSync(p, "utf8");

const card = { id: "u1", type: "employee", name: "Some Person", ticketNo: "412345", sailPNo: "D••••6", designation: "Asst. General Manager", title: "Dr.", phd: true, discipline: "ENT", isDoctor: true, department: "C&IT", departmentCode: "98500", designationCode: "AGM", extraFields: [{ label: "Rank", value: "3" }], mobileMasked: "943479xxxx", emailMasked: "xxxxxx@sail.in", hasMobile: true, hasEmail: true, isExecutive: true, matchKind: "name-exact", score: 0.9 };
const v = visitorCard(card as never) as Record<string, unknown>;
ok("a card keeps the name, the Dr./PhD marks and the department (and its code)", v.name === "Some Person" && v.title === "Dr." && v.phd === true && v.department === "C&IT" && v.departmentCode === "98500" && v.id === "u1" && v.type === "employee");
ok("a card loses the ticket, the P.No., the designation (and code), the discipline, the executive badge, the contact hints and the extra chips", v.ticketNo === "" && v.sailPNo === null && v.designation === null && !("designationCode" in v) && !("discipline" in v) && v.isExecutive === false && v.mobileMasked === null && v.emailMasked === null && v.hasMobile === false && v.hasEmail === false && !("extraFields" in v) && !("isDoctor" in v));
const unknownField = visitorCard({ ...card, newSecretField: "x" } as never) as Record<string, unknown>;
ok("a field added to the card later is hidden until it is allowed (an allow-list, not a deny-list)", !("newSecretField" in unknownField));

// an answer: cards anywhere in it, and tables
const answer = { kind: "count", answer: "Found 2", people: [card, { ...card, id: "u2", name: "Other", ticketNo: "500001" }], analytics: { table: { columns: [{ key: "name", label: "Name" }, { key: "ticket_no", label: "Ticket no" }, { key: "designation", label: "Designation" }, { key: "department", label: "Department" }, { key: "contact_no", label: "Mobile" }], rows: [{ name: "A", ticket_no: "412345", designation: "GM", department: "C&IT", contact_no: "9434791234" }], total: 1 } }, total: 2 };
const frozen = JSON.stringify(answer);
const out = visitorView(answer) as typeof answer;
ok("every card anywhere in an answer is cut down", out.people.every((p: Record<string, unknown>) => p.ticketNo === "" && p.designation === null));
ok("a table loses the ticket, designation and mobile columns (the headings and every row), and keeps name and department", JSON.stringify(out.analytics.table.columns.map((c: { key: string }) => c.key)) === '["name","department"]' && JSON.stringify(out.analytics.table.rows) === '[{"name":"A","department":"C&IT"}]' && out.analytics.table.total === 1);
ok("the rest of the answer is unchanged (kind, text, totals) and the original object is not touched", out.kind === "count" && out.answer === "Found 2" && out.total === 2 && JSON.stringify(answer) === frozen);
ok("things that are not employees or tables pass through (numbers, strings, null, nested arrays)", JSON.stringify(visitorView({ a: [1, "x", null, { b: true }] })) === '{"a":[1,"x",null,{"b":true}]}' && visitorView(null) === null && visitorView("t") === "t");

// the wiring
const search = src("src/app/api/employees/search/route.ts");
ok("the open search route sends a visitor the cut-down cards, and a lookup by P.No., mobile or CUG needs a sign-in", /visitorView\(results\)/.test(search) && /\["sailpno", "mobile", "cug4"\]\.includes\(detectShape\(q\)\.kind\)/.test(search) && (search.match(/return send\(results\)/g) ?? []).length === 3);
const ai = src("src/app/api/ai-search/route.ts");
ok("the search route cuts every answer for a person who is not signed in, after the answer is made and before it leaves", /\(await getSessionTicket\(\)\) \? answered : await forVisitors\(answered\)/.test(ai) && /visitorView\(body\)/.test(ai));
console.log(`visitorView selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

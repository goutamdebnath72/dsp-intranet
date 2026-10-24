// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/OriginSwitch.selftest.tsx
// The optional ticket colours: off by default, indigo + hollow dot for a direct recruit (49xxxx), amber + filled dot for a promotee, nothing for anything else.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OriginSwitch, TicketText } from "./OriginSwitch";
import { ResultTable } from "./AnswerResult";
import { originClass, originDot } from "../lib/ui/originTint";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const h = (el: React.ReactElement) => renderToStaticMarkup(el);

ok("a direct recruit's ticket, tint on: indigo and a hollow dot", /text-indigo-700/.test(h(<TicketText ticket="490268" tint />)) && h(<TicketText ticket="490268" tint />).includes("\u25CB"));
ok("a promotee's ticket, tint on: amber and a filled dot", /text-amber-700/.test(h(<TicketText ticket="420133" tint />)) && h(<TicketText ticket="420133" tint />).includes("\u25CF"));
ok("a non-executive ticket stays plain even with the tint on", h(<TicketText ticket="228757" tint />) === "228757");
ok("tint off: every ticket is the plain number", h(<TicketText ticket="490268" tint={false} />) === "490268" && h(<TicketText ticket="420133" tint={false} />) === "420133");
ok("an empty ticket shows nothing", h(<TicketText ticket="" tint />) === "" && h(<TicketText ticket={null} tint />) === "");
ok("the dot is hidden from a screen reader (nothing says promoted or direct)", /aria-hidden="true"/.test(h(<TicketText ticket="420133" tint />)) && !/promot|direct/i.test(h(<TicketText ticket="420133" tint />)));
ok("the two origins differ in colour AND in the shape of the dot", originClass("direct") !== originClass("promotee") && originDot("direct") !== originDot("promotee") && originClass("") === "" && originDot("") === "");
ok("neither colour is red or green", !/red|green|emerald/.test(originClass("direct") + originClass("promotee")));

const sw = h(<OriginSwitch />);
ok("the switch is off by default: pressed false, no legend", /aria-pressed="false"/.test(sw) && /Ticket colours/.test(sw) && !/promoted/.test(sw), sw);

const columns = [{ key: "ticket_no", label: "Ticket No", kind: "code" as const }, { key: "name", label: "Name", kind: "text" as const }];
const rows = [{ ticket_no: "490001", name: "A" }, { ticket_no: "420133", name: "B" }];
const table = h(<ResultTable table={{ rows, total: 2, truncated: false } as never} columns={columns} authenticated={true} />);
ok("the table, by default, shows plain tickets (no colour, no dot)", table.includes("490001") && table.includes("420133") && !/text-indigo-700|text-amber-700/.test(table) && !table.includes("\u25CF") && !table.includes("\u25CB"), table.slice(0, 120));

console.log(`OriginSwitch selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

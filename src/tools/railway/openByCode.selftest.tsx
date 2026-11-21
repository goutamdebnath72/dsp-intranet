// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/railway/openByCode.selftest.tsx
// THE STATION CODES OPEN THE TRAINS CARD AS YOU TYPE, in any case, without Enter: "dgr" on the Durgapur tab, "asn" on the Asansol tab. Drawn from the same detector and card the search bar uses.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { detectTool } from "../../lib/tools/detect";
import { railwayUi } from "./ui";
import { railwayTopic } from "./topic";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const hit = (q: string) => detectTool(q) as { kind: string; topic?: string; lang?: string } | null;
const card = (lang?: string) => renderToStaticMarkup(<>{railwayUi.live!.card(lang)}</>);
const selected = (html: string) => (html.match(/id="railway-tab-(dgr|asn)"[^>]*aria-selected="true"/) ?? html.match(/aria-selected="true"[^>]*id="railway-tab-(dgr|asn)"/) ?? [])[1];

for (const q of ["dgr", "DGR", "Dgr", "dGr", "  dgr  "]) {
  const h = hit(q);
  ok(`"${q}" opens the trains card as you type, on its first (Durgapur) tab`, h?.kind === "live" && h.topic === "railway" && h.lang === undefined, JSON.stringify(h));
}
for (const q of ["asn", "ASN", "Asn", "aSn", "  asn  ", "asn trains", "ASN TRAINS", "trains asn", "asn train fare"]) {
  const h = hit(q);
  ok(`"${q}" opens the trains card as you type, asking for the Asansol tab`, h?.kind === "live" && h.topic === "railway" && h.lang === "asn", JSON.stringify(h));
}
ok("a line naming both stations (asn dgr) opens the Durgapur tab: the first tab is the card's home", hit("asn dgr")?.topic === "railway" && hit("asn dgr")?.lang === undefined);
ok("the Durgapur tab is selected when no tab is asked for, and when the line is dgr", selected(card()) === "dgr" && selected(card(undefined)) === "dgr");
ok("the Asansol tab is selected when the line asked for it, and its panel is drawn (asked for at once, not on a click)", selected(card("asn")) === "asn" && /id="railway-panel-asn"[^>]*>(?!<\/div>)/.test(card("asn")));
ok("any other language value is ignored: the card opens on Durgapur", selected(card("hi")) === "dgr");
// ordinary lines are not taken for the card
// "what is asn" is the same as "what is dgr": the live-card rule treats "what", "is" as fillers, so a question that is only the code and fillers opens the card (it is a question about the station)
ok("\"what is asn\" behaves exactly like \"what is dgr\": both open the card", (hit("what is dgr")?.topic === "railway") === (hit("what is asn")?.topic === "railway") && hit("what is asn")?.lang === "asn");
for (const q of ["asn", "asn number", "asn code of the invoice", "dgr plant", "dgrx", "asnx", "advance shipping notice asn"]) {
  const h = hit(q);
  const isCard = h?.kind === "live" && h.topic === "railway";
  const should = q === "asn";
  ok(`"${q}" ${should ? "is" : "is not"} the trains card`, isCard === should, JSON.stringify(h));
}
ok("the card is answered as you type (instant) for both codes: the samples say so, and the guide's two short words are in the topic's samples", railwayTopic.samples!.some((s) => s.q === "dgr" && s.instant) && railwayTopic.samples!.some((s) => s.q === "asn" && s.instant));
console.log(`openByCode selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

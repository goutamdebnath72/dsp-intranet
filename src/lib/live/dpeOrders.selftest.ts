// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/dpeOrders.selftest.ts
// This tests the reading of the Department of Public Enterprises' quarterly IDA orders from its website: DPE's list (saved as it was on 28 Nov 2026), the text of the order of 27 Oct 2026 (the PDF's text, without the signatory's lines),
// and what happens with scanned orders, a failing list, a failing PDF and a strange sentence. Nothing is guessed: a picture gives no rate.
import { readFileSync } from "node:fs";
import { dayIn, forgetOrders, loadDpeOrders, mediaUrl, ORDER_LIST_URL, orderOf, parseOrderList, pdfAddress, readOrderText, validOrders, type DpeDeps } from "./dpeOrders";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const fx = (n: string) => readFileSync(`src/lib/live/fixtures/${n}`, "utf8");
const list = JSON.parse(fx("dpe-central-documents-dearness-2026-11-28.json"));
const text = fx("dpe-ida-order-text-2026-10-27.txt");

const orders = parseOrderList(list);
ok("DPE's list of 40 central documents gives the quarterly IDA orders of the executives, newest first: 1 Oct 2026, 1 Jul 2026, 1 Apr 2026, 1 Oct 2025 (the January 2026 order is not on DPE's site)", orders.map((o) => o.from).join() === "2026-10-01,2026-07-01,2026-04-01,2025-10-01", orders.map((o) => o.from).join());
ok("each order has the day DPE put it up and its PDF (the media record), the 2025 order that only says 'have been revised' and the earlier 'pay scales' documents are not taken", orders[0].postedOn === "2026-10-27" && orders[0].pdfId === 25876 && orders[3].postedOn === "2025-10-29" && orders[3].pdfId === 21856 && !orders.some((o) => o.id === 21862 || o.id === 13072));
ok("a record whose title has no day of effect, or a day that is not the first of a quarter, is not an order", orderOf({ id: 1, date: "2026-10-27T10:00:00", acf: { title: "(IDA) Rates for Executives of CPSEs - revised" } }) === null && orderOf({ id: 2, date: "2026-10-27T10:00:00", acf: { title: "(IDA) Rates for Executives of CPSEs - effective from 15.10.2026" } }) === null && orderOf({ id: 3, date: "2026-10-27T10:00:00", acf: { title: "Dearness Allowance for Central Government employees - effective from 01.07.2026" } }) === null && orderOf({ id: 4, date: "2026-10-27T10:00:00", acf: { title: "(IDA) Rates for Executives of CPSEs - effective from 01.01.2027" } })?.from === "2027-01-01");
ok("what is not a list is an empty list; the same day put up twice keeps the later posting", parseOrderList(null).length === 0 && parseOrderList({}).length === 0 && (() => { const t = "(IDA) Rates for Executives of CPSEs - effective from 01.04.2027"; const l = parseOrderList([{ id: 5, date: "2027-04-20T10:00:00", acf: { title: t, pdf: 50 } }, { id: 6, date: "2027-04-28T10:00:00", acf: { title: t, pdf: 60 } }]); return l.length === 1 && l[0].pdfId === 60; })());

ok("the media record's PDF is taken only when it is a PDF on DPE's own site", pdfAddress({ source_url: "https://www.dpe.gov.in/static/uploads/2026/10/x.pdf" }) === "https://www.dpe.gov.in/static/uploads/2026/10/x.pdf" && pdfAddress({ source_url: "https://evil.example/x.pdf" }) === null && pdfAddress({ source_url: "https://www.dpe.gov.in.evil.example/x.pdf" }) === null && pdfAddress({ source_url: "http://www.dpe.gov.in/x.pdf" }) === null && pdfAddress({ source_url: "https://www.dpe.gov.in/x.html" }) === null && pdfAddress(null) === null);
ok("the days in the orders are read: '27th October 2026', 'the 17th July 2026', '24.04.2026', '29th October, 2025'", dayIn("27th October 2026") === "2026-10-27" && dayIn("the 17th July 2026") === "2026-07-17" && dayIn("24.04.2026") === "2026-04-24" && dayIn("29th October, 2025") === "2025-10-29" && dayIn("nothing") === null);

const got = readOrderText(text);
ok("the order of 27 Oct 2026: 59.1% for the 2017 scale (not the 489.5% of 1997 or the 249.2% of 2007), its number and its date", got.rate === 59.1 && got.omNo === "W-02/0037/2025-DPE(WC)/FTS-14505" && got.omDate === "2026-10-27", JSON.stringify(got));
ok("the words of April 2026 ('54.1% for the 2017 pay scale') and a table row ('2017 51.8%') are read as well", readOrderText("x ".repeat(50) + "shall be 471.2% for the 1997 pay scale, 238.3% for the 2007 pay scale and 54.1% for the 2017 pay scale.").rate === 54.1 && readOrderText("y ".repeat(50) + "Pay Scale (IDA) Revised DA rates 1997 462.7% 2007 233.2% 2017 51.8%").rate === 51.8);
ok("a picture (a PDF with no text) gives nothing; two different figures for the 2017 scale give nothing; a figure that is not plausible gives nothing", readOrderText("").rate === null && readOrderText("  \n ").omNo === null && readOrderText("z ".repeat(50) + "59.1% for the 2017 pay scale and 61.5% for the 2017 pay scale").rate === null && readOrderText("z ".repeat(50) + "5.9% for the 2017 pay scale").rate === null && readOrderText("z ".repeat(50) + "5900% for the 2017 pay scale").rate === null);

// loading
const calls: string[] = [];
const deps = (over: Partial<DpeDeps> = {}): DpeDeps => ({
  getJson: async (u) => { calls.push(u); if (u === ORDER_LIST_URL) return list; const id = Number(/media\/(\d+)/.exec(u)?.[1]); return { source_url: `https://www.dpe.gov.in/static/uploads/${id}.pdf`, mime_type: "application/pdf" }; },
  getPdf: async (u) => { calls.push(u); return new TextEncoder().encode(u.includes("25876") ? "text" : ""); },
  pdfText: async (b) => (new TextDecoder().decode(b) === "text" ? text : ""),
  ...over,
});
(async () => {
  forgetOrders();
  const loaded = await loadDpeOrders(deps());
  ok("loading gives the four orders: October 2026 with its rate (59.1) and its PDF, the three scanned ones with their PDFs and no rate (a picture is not read)", loaded.length === 4 && loaded[0].rate === 59.1 && loaded[0].pdf === "https://www.dpe.gov.in/static/uploads/25876.pdf" && loaded[0].omDate === "2026-10-27" && loaded.slice(1).every((o) => o.rate === null && o.omNo === null && !!o.pdf) && validOrders(loaded), JSON.stringify(loaded));
  const before = calls.length;
  await loadDpeOrders(deps());
  ok("an order that has been read is not read again: the second load asks only for the list", calls.length === before + 1 && calls[before] === ORDER_LIST_URL, JSON.stringify(calls.slice(before)));
  ok("the media address is built from the PDF's id", mediaUrl(25876) === "https://www.dpe.gov.in/cms/wp-json/wp/v2/media/25876?_fields=source_url,mime_type");

  forgetOrders();
  ok("a list that cannot be had gives an empty answer, not an error", (await loadDpeOrders(deps({ getJson: async () => { throw new Error("down"); } }))).length === 0);
  forgetOrders();
  const half = await loadDpeOrders(deps({ getPdf: async () => { throw new Error("pdf down"); } }));
  ok("a PDF that cannot be had leaves its order listed with no rate (it is asked again next time)", half.length === 4 && half.every((o) => o.rate === null) && half[0].pdf !== null);
  const again = await loadDpeOrders(deps());
  ok("and the next load reads it", again[0].rate === 59.1);
  forgetOrders();
  const bad = await loadDpeOrders(deps({ getJson: async (u) => (u === ORDER_LIST_URL ? list : { source_url: "https://evil.example/x.pdf" }) }));
  ok("a media record that points outside DPE gives no link and no rate", bad.length === 4 && bad.every((o) => o.pdf === null && o.rate === null));

  console.log(`dpeOrders: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

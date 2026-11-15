// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/pf/PfForm.selftest.tsx
// The PF form asks for what a DSP employee can read on the PF page, the payslip and the yearly statement, and nothing else.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PfForm, PfChart } from "./PfForm";
import { pfAtRetirement, type PfInput } from "./pf";
import { isProblem } from "@/lib/tools/money";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const html = renderToStaticMarkup(<PfForm />);

ok("the form is in three parts: the PF page, the payslip, the retirement and assumptions", /From the PF page: the Provident Fund Statement of this financial year/.test(html) && /From your payslip: what goes into the PF every month/.test(html) && /Your retirement and what you assume/.test(html));
ok("the PF page part has the paybill month and the three rows of the page, each for PF (Emp), PF (Comp) and V.P.F: (a) opening balance, (e) monthly contributions, (f) interest on them", /Monthly recovery posted up to/.test(html) && /\(a\) Opening balance as on 1 April/.test(html) && /\(e\) Monthly contributions \(current financial year\)/.test(html) && /\(f\) Interest on monthly contributions/.test(html) && ["pf-a", "pf-e", "pf-f"].every((p) => ["emp", "comp", "vpf"].every((k) => html.includes(`id="${p}-${k}"`))) && /PF \(Emp\)/.test(html) && /PF \(Comp\)/.test(html) && /V\.P\.F/.test(html));
ok("the three rows of the page are cells of ONE grid (a column that fits the longest name, then three boxes that share the rest and are never wider than 14 rem), each name is kept on one line from the large-screen breakpoint up (below it the name has its own line above the three boxes), and the names carry no wrapped hint", (html.match(/data-page-grid/g) || []).length === 1 && /lg:grid-cols-\[max-content_repeat\(3,minmax\(0,14rem\)\)\]/.test(html) && (html.match(/data-page-row-label/g) || []).length === 3 && (html.match(/lg:whitespace-nowrap/g) || []).length >= 3 && !/Up to the month above\./.test(html) && /Rows \(e\) and \(f\) are the page&#x27;s own figures up to the month above/.test(html));
ok("the page's own (b) interest on the opening balance is worked out, not typed (the form has no box for it)", /\(b\) Interest on O\.B/.test(html) && !html.includes('id="pf-b-'));
ok("the payslip part has the monthly CPF, the monthly VPF, the VPF ceiling (locked at 30,000) and the pension part of the company's share (1,250)", /Your monthly PF \(CPF\)/.test(html) && /CPF PC/.test(html) && /Your monthly VPF from now on/.test(html) && /VPF ceiling a month/.test(html) && /Locked at ₹ 30,000 a month/.test(html) && /value="30000"/.test(html) && /Pension part of the company&#x27;s share/.test(html) && /value="1250"/.test(html));
ok("the retirement date is typed day/month/year, with the rate (8.25), the yearly rise and the optional taxable balance (TAXBL CB) of the yearly statement", /Date of retirement/.test(html) && /DD\/MM\/YYYY/.test(html) && /value="8\.25"/.test(html) && /Yearly rise in basic pay \+ DA/.test(html) && /Taxable PF balance \(optional\)/.test(html) && /TAXBL CB/.test(html));
ok("the tax limit (2,50,000), the TDS (10%) and the page's rate are in the settings, not in the way", /More settings/.test(html) && /value="250000"/.test(html) && /value="10"/.test(html) && /Interest rate printed on the page/.test(html));
ok("nothing is shown as a result until the figures are in, and it says what is needed", /Fill in the PF page figures, your monthly PF and your retirement date/.test(html) && !/Probable PF on /.test(html));
ok("the old age-and-percentage questions are gone (no age today, no retirement age, no employee percentage)", !/Your age today/.test(html) && !/Retirement age/.test(html) && !/Employer&#x27;s share into PF/.test(html));
ok("the empty form holds no personal figure: no PAN-shaped text, and every box for a balance is empty", !/[A-Z]{5}[0-9]{4}[A-Z]/.test(html) && ["pf-a", "pf-e", "pf-f"].every((p) => ["emp", "comp", "vpf"].every((k) => new RegExp(`id="${p}-${k}"[^>]*value=""`).test(html))));

// ---- the chart: made-up round figures
const inp: PfInput = { postedMonth: 4, postedYear: 2026, retireMonth: 3, retireYear: 2031, opening: { emp: 1_000_000, comp: 500_000, vpf: 200_000 }, contributions: { emp: 10_000, comp: 8_750, vpf: 0 }, contributionInterest: { emp: 66.67, comp: 58.33, vpf: 0 }, interestPct: 8, pageRatePct: 8, monthlyEmp: 10_000, epsPart: 1_250, monthlyVpf: 0, vpfCeiling: 30_000, risePct: 0, taxableOpening: null, taxFreeLimit: 250_000, tdsPct: 10 };
const r = pfAtRetirement(inp);
if (isProblem(r)) throw new Error(r.error);
const ch = renderToStaticMarkup(<PfChart now={r.now} nowLabel="04/2026" years={r.years} />);
ok("the chart has a column for today and one for each of the five financial years, each with its year under it and its total on top in crore or lakh", (ch.match(/data-pf-col=/g) || []).length === 6 && (ch.match(/data-pf-year/g) || []).length === 6 && ["Today (04/2026)", "2026-27", "2027-28", "2028-29", "2029-30", "2030-31"].every((s) => ch.includes(s)) && (ch.match(/data-pf-value/g) || []).length === 6 && /₹ [0-9.]+ (L|Cr)/.test(ch));
ok("each column is stacked PF (Emp) / PF (Comp) / V.P.F with a legend, and a scale on the left from ₹ 0 to the largest figure", (ch.match(/data-pf-legend/g) || []).length === 3 && /PF \(Emp\)/.test(ch) && /PF \(Comp\)/.test(ch) && /V\.P\.F/.test(ch) && /bg-emerald-500/.test(ch) && /bg-sky-500/.test(ch) && /bg-amber-400/.test(ch) && /₹ 0/.test(ch) && (ch.match(/border-t border-slate-200/g) || []).length === 5);
ok("no column is wider than 6 rem (a few years are not drawn as a few huge blocks), and every size is relative (rem, percent, flex)", /max-w-\[6rem\]/.test(ch) && !/\bw-\[[0-9.]+px\]/.test(ch) && !/style="[^"]*width:\s*[0-9.]+px/.test(ch));
ok("every label under a column is on ONE line (no wrap), and today's carries its month in a parenthesis: Today (04/2026)", (ch.match(/data-pf-year/g) || []).length === 6 && [...ch.matchAll(/class="([^"]*)" data-pf-year/g)].every((m) => /whitespace-nowrap/.test(m[1])) && !/data-pf-year[^>]*>[^<]*<span/.test(ch) && />Today \(04\/2026\)</.test(ch));
ok("the tallest column is the last year, and a column's height is its share of the largest total", (() => { const hs = [...ch.matchAll(/rounded-t-md" style="height:([0-9.]+)%/g)].map((m) => Number(m[1])); return hs.length === 6 && Math.max(...hs) === hs[5] && Math.abs(hs[5] - 82) < 0.01 && hs[0] < hs[5]; })());

// ---- a long career: 30 years to go (a young employee). Every column is drawn; the labels are thinned so they never overlap.
const long = pfAtRetirement({ ...inp, retireYear: 2056 });
if (isProblem(long)) throw new Error(long.error);
const lc = renderToStaticMarkup(<PfChart now={long.now} nowLabel="04/2026" years={long.years} />);
const labelled = [...lc.matchAll(/data-pf-year="true">([^<]*)</g)].map((m) => m[1]).filter((s) => s.trim() !== "");
const valued = [...lc.matchAll(/data-pf-value="true">([^<]*)</g)].map((m) => m[1]).filter((s) => s.trim() !== "");
ok("a 30-year career: thirty-one columns are drawn (today and thirty years), the bars keep a small gap and their hover figures", long.years.length === 30 && (lc.match(/data-pf-col=/g) || []).length === 31 && /gap-1/.test(lc) && (lc.match(/ title="/g) || []).length >= 31);
ok("the labels are thinned: at most about ten years carry a year and a total, always today and the last year, and the first of them is 'Today (04/2026)'", labelled.length <= 11 && labelled.length >= 5 && labelled[0] === "Today (04/2026)" && labelled[labelled.length - 1] === "2055-56" && valued.length === labelled.length);
ok("no two shown labels are neighbours (the step is at least 2 for a long career), so none touches another", Number(/data-pf-step="(\d+)"/.exec(lc)![1]) >= 2 && (() => { const cols = [...lc.matchAll(/data-pf-year="true">([^<]*)</g)].map((m) => m[1].trim() !== ""); return cols.every((s, i) => !(s && cols[i + 1])); })());
ok("a short career has step 1 (7 columns), so nothing is thinned", Number(/data-pf-step="(\d+)"/.exec(ch)![1]) === 1);
ok("a short career of six years keeps every year and every total", [...ch.matchAll(/data-pf-year="true">([^<]*)</g)].every((m) => m[1].trim() !== "") && [...ch.matchAll(/data-pf-value="true">([^<]*)</g)].every((m) => m[1].trim() !== ""));

console.log(`PfForm selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

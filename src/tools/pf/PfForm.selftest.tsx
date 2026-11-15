// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/pf/PfForm.selftest.tsx
// The PF form asks for what a DSP employee can read on the PF page, the payslip and the yearly statement, and nothing else.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PfForm } from "./PfForm";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const html = renderToStaticMarkup(<PfForm />);

ok("the form is in three parts: the PF page, the payslip, the retirement and assumptions", /From the PF page: the Provident Fund Statement of this financial year/.test(html) && /From your payslip: what goes into the PF every month/.test(html) && /Your retirement and what you assume/.test(html));
ok("the PF page part has the paybill month and the three rows of the page, each for PF (Emp), PF (Comp) and V.P.F: (a) opening balance, (e) monthly contributions, (f) interest on them", /Monthly recovery posted up to/.test(html) && /\(a\) Opening balance as on 1 April/.test(html) && /\(e\) Monthly contributions \(current financial year\)/.test(html) && /\(f\) Interest on monthly contributions/.test(html) && ["pf-a", "pf-e", "pf-f"].every((p) => ["emp", "comp", "vpf"].every((k) => html.includes(`id="${p}-${k}"`))) && /PF \(Emp\)/.test(html) && /PF \(Comp\)/.test(html) && /V\.P\.F/.test(html));
ok("the page's own (b) interest on the opening balance is worked out, not typed (the form has no box for it)", /\(b\) Interest on O\.B/.test(html) && !html.includes('id="pf-b-'));
ok("the payslip part has the monthly CPF, the monthly VPF, the VPF ceiling (locked at 30,000) and the pension part of the company's share (1,250)", /Your monthly PF \(CPF\)/.test(html) && /CPF PC/.test(html) && /Your monthly VPF from now on/.test(html) && /VPF ceiling a month/.test(html) && /Locked at ₹ 30,000 a month/.test(html) && /value="30000"/.test(html) && /Pension part of the company&#x27;s share/.test(html) && /value="1250"/.test(html));
ok("the retirement date is typed day/month/year, with the rate (8.25), the yearly rise and the optional taxable balance (TAXBL CB) of the yearly statement", /Date of retirement/.test(html) && /DD\/MM\/YYYY/.test(html) && /value="8\.25"/.test(html) && /Yearly rise in basic pay \+ DA/.test(html) && /Taxable PF balance \(optional\)/.test(html) && /TAXBL CB/.test(html));
ok("the tax limit (2,50,000), the TDS (10%) and the page's rate are in the settings, not in the way", /More settings/.test(html) && /value="250000"/.test(html) && /value="10"/.test(html) && /Interest rate printed on the page/.test(html));
ok("nothing is shown as a result until the figures are in, and it says what is needed", /Fill in the PF page figures, your monthly PF and your retirement date/.test(html) && !/Probable PF on /.test(html));
ok("the old age-and-percentage questions are gone (no age today, no retirement age, no employee percentage)", !/Your age today/.test(html) && !/Retirement age/.test(html) && !/Employer&#x27;s share into PF/.test(html));
ok("the empty form holds no personal figure: no PAN-shaped text, and every box for a balance is empty", !/[A-Z]{5}[0-9]{4}[A-Z]/.test(html) && ["pf-a", "pf-e", "pf-f"].every((p) => ["emp", "comp", "vpf"].every((k) => new RegExp(`id="${p}-${k}"[^>]*value=""`).test(html))));

console.log(`PfForm selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

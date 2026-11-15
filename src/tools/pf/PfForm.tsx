// src/tools/pf/PfForm.tsx
//
// THE PROBABLE PF AT SUPERANNUATION FORM. Its fields are the figures a DSP employee can read on the PF page of the legacy intranet (opening balance, monthly contributions and the interest on them, each for PF (Emp), PF (Comp)
// and V.P.F), on the yearly PF statement (the taxable balance) and on the payslip (the monthly PF and VPF). Keeps what is typed in the browser's memory only (React state): nothing is stored, logged or sent.
// The sums are in the pure file beside it (pf.ts); this component collects the inputs and shows the results.
"use client";

import React, { useMemo, useState } from "react";
import { PF_DEFAULTS, parseDate, parseMonthYear, pfAtRetirement, pfWhatIf, total, type PfInput, type Trio } from "./pf";
import { num, rupees, isProblem, RATE_DEFAULTS_AS_OF } from "@/lib/tools/money";
import { Field, TextInput, Stat, Problem, RowsTable } from "@/components/tools/toolAtoms";

type Row = { emp: string; comp: string; vpf: string };
const empty = (): Row => ({ emp: "", comp: "", vpf: "" });
const toTrio = (r: Row): Trio => ({ emp: num(r.emp), comp: num(r.comp), vpf: num(r.vpf) });
const filled = (r: Row) => r.emp.trim() !== "" && r.comp.trim() !== "" && r.vpf.trim() !== "";

/** one row of the PF page: its name, and a box for each of PF (Emp), PF (Comp) and V.P.F */
function PageRow({ id, label, hint, value, onChange }: { id: string; label: string; hint?: string; value: Row; onChange: (r: Row) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,13rem)_repeat(3,minmax(0,1fr))] sm:items-start">
      <div className="pt-1 sm:pt-3">
        <div className="text-[13px] font-semibold leading-snug text-slate-800">{label}</div>
        {hint && <div className="text-[11px] leading-snug text-slate-500">{hint}</div>}
      </div>
      {([["emp", "PF (Emp)"], ["comp", "PF (Comp)"], ["vpf", "V.P.F"]] as const).map(([k, h]) => (
        <div key={k}>
          <label htmlFor={`${id}-${k}`} className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:sr-only">{h}</label>
          <TextInput id={`${id}-${k}`} value={value[k]} onChange={(v) => onChange({ ...value, [k]: v })} suffix="₹" />
        </div>
      ))}
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/70 p-3.5">
      <h4 className="mb-2.5 flex items-center gap-2 text-[13px] font-extrabold text-slate-800"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] text-white">{n}</span>{title}</h4>
      {children}
    </section>
  );
}

export function PfForm() {
  const [posted, setPosted] = useState("");
  const [open, setOpen] = useState<Row>(empty());
  const [contrib, setContrib] = useState<Row>(empty());
  const [cInt, setCInt] = useState<Row>(empty());
  const [cpf, setCpf] = useState("");
  const [vpf, setVpf] = useState(String(PF_DEFAULTS.monthlyVpf));
  const [ceiling, setCeiling] = useState(String(PF_DEFAULTS.vpfCeiling));
  const [eps, setEps] = useState(String(PF_DEFAULTS.epsPart));
  const [retire, setRetire] = useState("");
  const [rate, setRate] = useState(String(PF_DEFAULTS.interestPct));
  const [pageRate, setPageRate] = useState(String(PF_DEFAULTS.pageRatePct));
  const [rise, setRise] = useState(String(PF_DEFAULTS.risePct));
  const [taxable, setTaxable] = useState("");
  const [limit, setLimit] = useState(String(PF_DEFAULTS.taxFreeLimit));
  const [tds, setTds] = useState(String(PF_DEFAULTS.tdsPct));

  const pm = parseMonthYear(posted), rd = parseDate(retire);
  const ready = filled(open) && filled(contrib) && filled(cInt) && cpf.trim() !== "" && posted.trim() !== "" && retire.trim() !== "";
  const input: PfInput | null = useMemo(() => (pm && rd ? {
    postedMonth: pm.month, postedYear: pm.year, retireMonth: rd.month, retireYear: rd.year,
    opening: toTrio(open), contributions: toTrio(contrib), contributionInterest: toTrio(cInt),
    interestPct: num(rate), pageRatePct: num(pageRate), monthlyEmp: num(cpf), epsPart: num(eps), monthlyVpf: num(vpf), vpfCeiling: num(ceiling), risePct: num(rise),
    taxableOpening: taxable.trim() === "" ? null : num(taxable), taxFreeLimit: num(limit), tdsPct: num(tds),
  } : null), [pm, rd, open, contrib, cInt, rate, pageRate, cpf, eps, vpf, ceiling, rise, taxable, limit, tds]);
  const res = useMemo(() => (input ? pfAtRetirement(input) : null), [input]);
  const grid = useMemo(() => {
    if (!input || !res || isProblem(res)) return null;
    const r0 = num(rate);
    const rises = Array.from(new Set([0, 3, 5, num(rise)].filter((x) => Number.isFinite(x)))).sort((a, b) => a - b);
    const rates = [r0 - 0.5, r0, r0 + 0.5].filter((x) => x >= 0);
    return { rates, rows: pfWhatIf(input, rises, rates) };
  }, [input, res, rate, rise]);
  const maxClose = res && !isProblem(res) ? Math.max(...res.years.map((y) => y.closingTotal)) : 1;
  const vpfClipped = num(vpf) > num(ceiling);

  return (
    <div className="space-y-3">
      <p className="rounded-2xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs leading-snug text-slate-700">
        Type the figures as they appear on your <strong>DSP Provident Fund page</strong> (the Provident Fund Statement of the current financial year), on your <strong>payslip</strong> and, for the tax part, on your <strong>yearly PF statement</strong>. The calculator carries them forward month by month to your retirement date, the way the PF trust works them out.
      </p>

      <Section n={1} title="From the PF page: the Provident Fund Statement of this financial year">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="pf-posted" label="Monthly recovery posted up to" hint="The page says “Monthly Recovery Posted upto 10/2026 Paybill”: type 10/2026."><TextInput id="pf-posted" value={posted} onChange={setPosted} placeholder="e.g. 10/2026" suffix="MM/YYYY" /></Field>
        </div>
        <div className="mt-3 hidden gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:grid sm:grid-cols-[minmax(0,13rem)_repeat(3,minmax(0,1fr))]"><span /><span>PF (Emp)</span><span>PF (Comp)</span><span>V.P.F</span></div>
        <div className="mt-1 space-y-2.5">
          <PageRow id="pf-a" label="(a) Opening balance as on 1 April" value={open} onChange={setOpen} />
          <PageRow id="pf-e" label="(e) Monthly contributions (current financial year)" hint="Up to the month above." value={contrib} onChange={setContrib} />
          <PageRow id="pf-f" label="(f) Interest on monthly contributions" hint="The page's own figure, up to the month above." value={cInt} onChange={setCInt} />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-500">The page's own &ldquo;(b) Interest on O.B&rdquo; is worked out here (the opening balance × the rate × the months posted ÷ 12), so you do not type it.</p>
      </Section>

      <Section n={2} title="From your payslip: what goes into the PF every month">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="pf-cpf" label="Your monthly PF (CPF)" hint="Printed on the payslip as CPF PC (12% of basic pay + DA)."><TextInput id="pf-cpf" value={cpf} onChange={setCpf} placeholder="e.g. 17,364" suffix="₹" /></Field>
          <Field id="pf-vpf" label="Your monthly VPF from now on" hint={vpfClipped ? `Above the ceiling: ${rupees(num(ceiling))} a month is used.` : "As on the payslip. 0 if you pay none."}><TextInput id="pf-vpf" value={vpf} onChange={setVpf} suffix="₹" /></Field>
          <Field id="pf-ceiling" label="VPF ceiling a month" hint="Locked at ₹ 30,000 a month."><TextInput id="pf-ceiling" value={ceiling} onChange={setCeiling} suffix="₹" /></Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field id="pf-eps" label="Pension part of the company's share" hint="The company's share in the PF account is your CPF less this (1,250 a month: 8.33% of ₹ 15,000)."><TextInput id="pf-eps" value={eps} onChange={setEps} suffix="₹" /></Field>
        </div>
      </Section>

      <Section n={3} title="Your retirement and what you assume">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="pf-retire" label="Date of retirement" hint="The PF of every month up to the retirement month is counted."><TextInput id="pf-retire" value={retire} onChange={setRetire} placeholder="e.g. 30/03/2032" suffix="DD/MM/YYYY" /></Field>
          <Field id="pf-rate" label="Interest rate a year" hint={`The page's own rate; future years are declared later (the starting figure is as of ${RATE_DEFAULTS_AS_OF}).`}><TextInput id="pf-rate" value={rate} onChange={setRate} suffix="%" /></Field>
          <Field id="pf-rise" label="Yearly rise in basic pay + DA" hint="Applied from next April, to your CPF; this year stays as it is. Your own assumption."><TextInput id="pf-rise" value={rise} onChange={setRise} suffix="%" /></Field>
          <Field id="pf-tax" label="Taxable PF balance (optional)" hint="“TAXBL CB” of the yearly PF statement of last year. Leave it empty if you do not have it: no tax on interest is then taken off."><TextInput id="pf-tax" value={taxable} onChange={setTaxable} suffix="₹" /></Field>
        </div>
        <details className="mt-2.5 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700">More settings: the page's rate, and the tax on interest (limit and TDS)</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <Field id="pf-pagerate" label="Interest rate printed on the page" hint="Used for the months already posted, whatever rate you try for the future."><TextInput id="pf-pagerate" value={pageRate} onChange={setPageRate} suffix="%" /></Field>
            <Field id="pf-limit" label="Yearly limit before interest is taxable" hint="What you put in, PF and VPF together, beyond this in a year earns taxable interest."><TextInput id="pf-limit" value={limit} onChange={setLimit} suffix="₹" /></Field>
            <Field id="pf-tds" label="TDS on that interest" hint="Taken from your PF balance when the year is closed."><TextInput id="pf-tds" value={tds} onChange={setTds} suffix="%" /></Field>
          </div>
        </details>
      </Section>

      <div>
        {!ready ? <p className="text-[13px] text-slate-500">Fill in the PF page figures, your monthly PF and your retirement date to see the probable PF on that day.</p>
          : !pm ? <Problem text="Type the month the PF page is posted up to as month/year, for example 10/2026." />
          : !rd ? <Problem text="Type the retirement date as day/month/year, for example 30/03/2032." />
          : !res ? null : isProblem(res) ? <Problem text={res.error} /> : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Stat label={`Probable PF on ${retire.trim()}`} value={rupees(res.finalTotal)} big tone="emerald" />
              <Stat label="PF page balance today (a + b + e + f)" value={rupees(res.nowTotal)} tone="sky" />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="PF (Emp) then" value={rupees(res.final.emp)} />
              <Stat label="PF (Comp) then" value={rupees(res.final.comp)} />
              <Stat label="V.P.F then" value={rupees(res.final.vpf)} />
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <Stat label="Months still to pay" value={String(res.monthsToGo)} />
              <Stat label="Still to be added by you and the company" value={rupees(res.futureContributions)} />
              <Stat label="Interest still to come" value={rupees(res.futureInterest)} tone="amber" />
              <Stat label="TDS on interest" value={rupees(res.tdsTotal)} />
            </div>
            <p className="text-[13px] leading-snug text-slate-700" data-pf-check>
              Your PF page now: {rupees(res.now.emp)} (Emp) + {rupees(res.now.comp)} (Comp) + {rupees(res.now.vpf)} (VPF) = <strong>{rupees(res.nowTotal)}</strong>. Compare it with the page&apos;s <em>Closing Balance</em>: the two should agree to within a rupee or two; if not, a figure above was typed differently from the page.
            </p>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">PF balance at the end of each financial year</div>
              <div className="flex h-24 items-end gap-1" role="img" aria-label="PF balance by financial year, growing">
                {res.years.map((y) => <div key={y.fy} title={`${y.fy}: ${rupees(y.closingTotal)}`} className="flex-1 rounded-t bg-emerald-500/80" style={{ height: `${Math.max(3, (y.closingTotal / maxClose) * 100)}%` }} />)}
              </div>
              <div className="mt-0.5 flex justify-between text-[11px] text-slate-500"><span>{res.years[0].fy}</span><span>{res.years[res.years.length - 1].fy}</span></div>
            </div>
            <RowsTable
              head={["Year", "Months", "Your CPF a month", "Added", "Interest", "TDS", "Balance at the close"]}
              rows={res.years.map((y) => [y.fy, String(y.months), rupees(y.monthlyEmp), rupees(total(y.added)), rupees(y.interest), rupees(y.tds), rupees(y.closingTotal)])}
              label="Show every year"
              firstN={8}
            />
            {grid && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">What if: the probable PF for other yearly rises and rates</div>
                <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-left text-[13px]" data-pf-whatif>
                    <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
                      <tr><th className="px-2.5 py-1.5 font-semibold">Rise in pay a year</th>{grid.rates.map((r) => <th key={r} className="px-2.5 py-1.5 font-semibold">At {r}%</th>)}</tr>
                    </thead>
                    <tbody>
                      {grid.rows.map((row) => (
                        <tr key={row.risePct} className="border-t border-slate-100"><td className="px-2.5 py-1 font-medium text-slate-800">{row.risePct}%</td>{row.cells.map((c) => <td key={c.ratePct} className="px-2.5 py-1 text-slate-700">{c.total === null ? "—" : rupees(c.total)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <ul className="list-disc space-y-1 pl-5 text-xs leading-snug text-slate-600" data-pf-notes>
              <li>Method, as the PF trust works it: the interest of a year on the opening balance is the balance × the rate; each month&apos;s contribution earns interest from its own month to the end of the year (April&apos;s 12 months, March&apos;s 1 month); the interest is added to the balance on 31 March, and on the retirement date in the last year.</li>
              <li>The contribution of the retirement month is counted in full. The rate of each coming year is declared later, so the rate you type is an assumption; so is the yearly rise in pay.</li>
              <li>{res.taxableClosing === null ? "No taxable balance was given, so no tax on interest is taken off: the figure is a little higher than it will be." : `Interest on what you put in beyond ${rupees(num(limit))} a year (and on the taxable balance carried forward) is taxable; ${num(tds)}% TDS is taken from your PF column each year (${rupees(res.tdsTotal)} in all). The rest of the income tax on that interest is recovered from your pay and is not part of this figure. Your taxable balance would stand at ${rupees(res.taxableClosing)} on that day.`}</li>
              <li>Interest of the months already posted is as the page shows it. The final settlement can differ from this approximation: the PF trust&apos;s own figure on the day is the one that counts.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

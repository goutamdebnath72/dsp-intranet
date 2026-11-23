// src/tools/pf/PfForm.tsx
//
// THE PROBABLE PF AT SUPERANNUATION FORM. Its fields are the figures a DSP employee can read on the PF page of the legacy intranet (opening balance, monthly contributions and the interest on them, each for PF (Emp), PF (Comp)
// and V.P.F), on the yearly PF statement (the taxable balance) and on the payslip (the monthly PF and VPF). I keep what is typed in the browser's memory only (React state): nothing is stored, logged or sent.
// The sums are in the pure file beside it (pf.ts); this component only collects the inputs and shows the results.
"use client";

import React, { useMemo, useState } from "react";
import { PF_DEFAULTS, parseDate, parseMonthYear, pfAtRetirement, pfWhatIf, total, type PfInput, type PfYear, type Trio } from "./pf";
import { num, rupees, rupeesShort, isProblem, RATE_DEFAULTS_AS_OF } from "@/lib/tools/money";
import { Field, TextInput, Stat, Problem, RowsTable } from "@/components/tools/toolAtoms";

type Row = { emp: string; comp: string; vpf: string };
const empty = (): Row => ({ emp: "", comp: "", vpf: "" });
const toTrio = (r: Row): Trio => ({ emp: num(r.emp), comp: num(r.comp), vpf: num(r.vpf) });
const filled = (r: Row) => r.emp.trim() !== "" && r.comp.trim() !== "" && r.vpf.trim() !== "";

/** One row of the PF page: its name on ONE line, and a box for each of PF (Emp), PF (Comp) and V.P.F. I draw it as the cells of the grid of the three rows below (see PageGrid), so the name's column is as wide as the longest name and the boxes share the rest. */
function PageRow({ id, label, value, onChange }: { id: string; label: string; value: Row; onChange: (r: Row) => void }) {
  return (
    <>
      <div className="col-span-3 mt-1 text-[13px] font-semibold leading-snug text-slate-800 lg:col-span-1 lg:mt-0 lg:whitespace-nowrap lg:pt-3" data-page-row-label>{label}</div>
      {([["emp", "PF (Emp)"], ["comp", "PF (Comp)"], ["vpf", "V.P.F"]] as const).map(([k, h]) => (
        <div key={k} className="min-w-0">
          <label htmlFor={`${id}-${k}`} className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:sr-only">{h}</label>
          <TextInput id={`${id}-${k}`} value={value[k]} onChange={(v) => onChange({ ...value, [k]: v })} suffix="₹" />
        </div>
      ))}
    </>
  );
}

/** The three rows of the PF page under one header, in ONE grid: a column that fits the longest name (on one line), then three equal boxes. */
function PageGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5 lg:grid-cols-[max-content_repeat(3,minmax(0,14rem))] lg:items-start" data-page-grid>
      <span className="hidden lg:block" aria-hidden="true" />
      {["PF (Emp)", "PF (Comp)", "V.P.F"].map((h) => <span key={h} className="hidden text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:block" aria-hidden="true">{h}</span>)}
      {children}
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

const SEG = [
  { key: "emp", label: "PF (Emp)", cls: "bg-emerald-500" },
  { key: "comp", label: "PF (Comp)", cls: "bg-sky-500" },
  { key: "vpf", label: "V.P.F", cls: "bg-amber-400" },
] as const;

/**
 * THE CHART OF THE PF: one column for today and one for the close of each financial year, each column stacked PF (Emp) / PF (Comp) / V.P.F, with its year under it, its total on top and a scale on the left.
 *  Every size is relative (percent, rem, flex): the columns share the width but never grow wider than 6 rem, so that a few years are not drawn as a few huge blocks.
 */
export function PfChart({ now, nowLabel, years }: { now: Trio; nowLabel: string; years: PfYear[] }) {
  const cols = [{ key: "now", label: nowLabel ? `Today (${nowLabel})` : "Today", t: now }, ...years.map((y) => ({ key: y.fy, label: y.fy, t: y.closing }))];
  const max = Math.max(...cols.map((c) => total(c.t)), 1);
  // A long career has many columns, so from ten columns up I let only every few-th column carry its year and its total (always the first and the last, and never one that would touch the last); the others keep their bar and their hover.
  const n = cols.length, last = n - 1, step = Math.max(1, Math.ceil(n / 9));
  const shown = (i: number) => i === last || i === 0 || (i % step === 0 && last - i >= step);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <figure className="m-0" data-pf-chart aria-label="PF balance today and at the close of each financial year">
      <figcaption className="mb-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">PF balance today and at the end of each financial year</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
          {SEG.map((s) => <span key={s.key} className="inline-flex items-center gap-1" data-pf-legend><span className={`inline-block h-2.5 w-2.5 rounded-sm ${s.cls}`} aria-hidden="true" />{s.label}</span>)}
        </span>
      </figcaption>
      <div className="flex gap-2">
        <div className="relative h-52 w-[4.5rem] shrink-0 text-[11px] leading-none text-slate-500" aria-hidden="true">
          {ticks.map((k) => <span key={k} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ bottom: `${k * 82}%` }}>{k === 0 ? "₹ 0" : rupeesShort(max * k)}</span>)}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-52" aria-hidden="true">
            {ticks.map((k) => <span key={k} className="absolute inset-x-0 border-t border-slate-200" style={{ bottom: `${k * 82}%` }} />)}
          </div>
          <div className={`relative flex items-end justify-around ${n > 12 ? "gap-1" : "gap-2"}`} data-pf-step={step}>
            {cols.map((c, i) => {
              const tot = total(c.t);
              return (
                <div key={c.key} className="flex min-w-0 max-w-[6rem] flex-1 flex-col items-center" data-pf-col={c.key} title={`${c.label}: ${rupees(tot)} (PF (Emp) ${rupees(c.t.emp)}, PF (Comp) ${rupees(c.t.comp)}, V.P.F ${rupees(c.t.vpf)})`}>
                  <div className="flex h-52 w-full flex-col items-center justify-end">
                    <span className="mb-1 whitespace-nowrap text-[11px] font-bold text-slate-800" data-pf-value>{shown(i) ? rupeesShort(tot) : "\u00a0"}</span>
                    <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${(tot / max) * 82}%` }}>
                      {SEG.map((s) => <div key={s.key} className={s.cls} style={{ height: `${tot > 0 ? (c.t[s.key] / tot) * 100 : 0}%` }} />)}
                    </div>
                  </div>
                  <div className="mt-1 whitespace-nowrap text-center text-[11px] font-semibold leading-tight text-slate-700" data-pf-year>{shown(i) ? c.label : "\u00a0"}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </figure>
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
        <PageGrid>
          <PageRow id="pf-a" label="(a) Opening balance as on 1 April" value={open} onChange={setOpen} />
          <PageRow id="pf-e" label="(e) Monthly contributions (current financial year)" value={contrib} onChange={setContrib} />
          <PageRow id="pf-f" label="(f) Interest on monthly contributions" value={cInt} onChange={setCInt} />
        </PageGrid>
        <p className="mt-2 text-[11px] leading-snug text-slate-500">Rows (e) and (f) are the page's own figures up to the month above. The page's &ldquo;(b) Interest on O.B&rdquo; is worked out here (the opening balance × the rate × the months posted ÷ 12), so you do not type it.</p>
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
            <PfChart now={res.now} nowLabel={pm ? `${String(pm.month).padStart(2, "0")}/${pm.year}` : ""} years={res.years} />
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

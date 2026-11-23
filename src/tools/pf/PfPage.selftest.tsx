// How to run it (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/pf/PfPage.selftest.tsx
// The provident fund page: ONE page with two tabs (PF maturity, PF loan EMI), one tile in the calculators' list in place of the two it had, and the loan tab for the refundable PF loan only.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PfPage, startTabFor } from "./PfPage";
import { PfLoanForm, LoanTable } from "./PfLoanForm";
import { pfLoanEmi, type PfLoanResult } from "./pfLoan";
import { rupees } from "@/lib/tools/money";
import { pfUi, PF_BOX_REM } from "./ui";
import { TOPIC_UIS } from "@/tools/registry.ui";
import { TOPICS } from "@/tools/registry";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const h = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, "");
const TODAY = { day: 20, month: 11, year: 2026 };

const maturity = h(<PfPage today={TODAY} />);
const loan = h(<PfPage start="loan" today={TODAY} />);
const tabs = (t: string): string[] => (t.match(/role="tab"[^>]*>([^<]*)</g) ?? []).map((x) => />([^<]*)</.exec(x)?.[1] ?? "");
const selected = (t: string): string => /aria-selected="true"[^>]*>([^<]*)</.exec(t)?.[1] ?? "";

ok("the page has two tabs, PF maturity then PF loan EMI", tabs(maturity).join("|") === "PF maturity|PF loan EMI" && /role="tablist"/.test(maturity));
ok("it opens on PF maturity, or on PF loan EMI when asked to", selected(maturity) === "PF maturity" && selected(loan) === "PF loan EMI");
ok("the tabs are linked to their panels (tab controls a tabpanel that is labelled by it), and only the open one is shown: the other has the hidden attribute", (maturity.match(/role="tabpanel"/g) ?? []).length === 2 && /aria-controls="[^"]*-panel-loan"/.test(maturity) && /id="[^"]*-panel-loan"[^>]*hidden=""/.test(maturity) && !/id="[^"]*-panel-maturity"[^>]*hidden=""/.test(maturity) && /id="[^"]*-panel-maturity"[^>]*hidden=""/.test(loan));
ok("the maturity tab is the same PF maturity form as before (the three parts, the PF page figures), and the loan tab is the loan form", /From the PF page: the Provident Fund Statement of this financial year/.test(maturity) && /data-pf-loan/.test(maturity) && /Interest the PF deposit earns/.test(maturity));

// which tab a typed line opens
ok("a line about the loan opens the loan tab: emi, loan, instalment, repayment; any other line, and the list of calculators, the maturity tab", ["pf loan emi", "emi calculator", "refundable pf loan", "loan calculator", "pf loan instalment"].every((q) => startTabFor(q) === "loan") && ["pf maturity calculator", "provident fund calculator", "calculators", "", undefined].every((q) => startTabFor(q) === "maturity"));

// the calculators' list
const withForm = TOPIC_UIS.filter((u) => u.form);
ok("the list of calculators has ONE provident fund tile (it had two: PF maturity and Loan EMI) and no Loan EMI tile, and the old loan calculator is not a topic any more", withForm.filter((u) => /provident fund/i.test(u.form!.menu.title)).length === 1 && !withForm.some((u) => /loan emi/i.test(u.form!.menu.title) || (u.id as string) === "emi") && !TOPICS.some((t) => (t.id as string) === "emi") && withForm.length === 10);
ok("the tile names both: PF on the retirement day, and the EMI of a refundable PF loan", /retire/.test(pfUi.form!.menu.text) && /refundable PF loan/.test(pfUi.form!.menu.text) && pfUi.form!.title === "Provident fund (PF)");
ok("the page keeps the wide box of the PF form", typeof pfUi.form!.wide === "object" && (pfUi.form!.wide as { maxRem: number }).maxRem === PF_BOX_REM);
ok("opened from 'pf loan emi' the form starts on the loan tab; from the list (no line about a loan) on maturity", /aria-selected="true"[^>]*>PF loan EMI/.test(h(pfUi.form!.render({ rates: null, ratesState: "idle", openForm: () => undefined, query: "pf loan emi" }) as React.ReactElement)) && /aria-selected="true"[^>]*>PF maturity/.test(h(pfUi.form!.render({ rates: null, ratesState: "idle", openForm: () => undefined, query: "calculators" }) as React.ReactElement)));

// the loan tab
const f = h(<PfLoanForm today={TODAY} />);
ok("the loan form asks for the loan amount, the interest the PF deposit earns (8.25), the date of retirement (DD/MM/YYYY) and the period (years or months)", /Loan amount/.test(f) && /id="pfl-deposit"[^>]*value="8.25"/.test(f) && /Date of retirement/.test(f) && /DD\/MM\/YYYY/.test(f) && /Period of the loan/.test(f) && /aria-label="Period unit"/.test(f));
ok("the loan's own rate is shown, worked from the deposit's: 9.25% a year = 8.25% + 1%; it is not a box to type in", /data-pf-loan-rate[^>]*>[^]*?<strong>9\.25% a year<\/strong> = the deposit&#x27;s 8\.25% \+ 1%/.test(f) && !/id="pfl-rate"/.test(f));
ok("the period says its limit: 10 years until a retirement date is given", /At most 10 years/.test(f));
ok("nothing is calculated until the figures are in, and it says what is needed", /Enter the loan amount, your retirement date and the period/.test(f) && !/Monthly EMI/.test(f));
ok("it states the three rules (deposit + 1%, at most 10 years and the service left, the balance still owed month by month)", /1% more than the interest your PF deposit earns/.test(f) && /at most 10 years/.test(f) && /balance still owed, month by month/.test(f));
ok("it says a non-refundable (NRL) loan has no instalment and shows on the PF page as 'Less N.R.Loan', and that the amount one may borrow is not checked", /non-refundable<\/strong> \(NRL\) loan is not paid back/.test(f) && /Less N\.R\.Loan/.test(f) && /How much you may borrow is decided by the PF rules, not checked here/.test(f));
ok("nothing of the bank, car, home or society loans is left: no 'Bank loan', no 'Co-operative', no flat-rate choice, no kind-of-loan list", !/Bank loan|Co-operative|co-operative|Flat rate|Kind of loan/.test(maturity + loan));
ok("what is typed is not saved or sent: the form has no fetch, storage or network call", (() => { const t = readFileSync("src/tools/pf/PfLoanForm.tsx", "utf8") + readFileSync("src/tools/pf/pfLoan.ts", "utf8"); return !/fetch\(|localStorage|sessionStorage|XMLHttpRequest|navigator\.sendBeacon/.test(t); })());


// THE TABLE, IN TWO VIEWS
const loanRes = pfLoanEmi({ principal: 500000, depositPct: 8.25, months: 60, retire: { day: 30, month: 3, year: 2032 }, today: TODAY }) as PfLoanResult;
const yv = h(<LoanTable res={loanRes} />), mv = h(<LoanTable res={loanRes} initialView="month" />);
const cells = (t: string): string[][] => (t.match(/<tbody>[\s\S]*<\/tbody>/)?.[0].match(/<tr[\s\S]*?<\/tr>/g) ?? []).map((r) => [...r.matchAll(/<td[^>]*>([^<]*)</g)].map((m) => m[1]));
const heads = (t: string): string[] => [...t.matchAll(/<th(?:\s[^>]*)?>([^<]*)</g)].map((m) => m[1]);
ok("the table has two views, Year-wise and Month-wise, switched by two buttons; it opens on the year-wise one", /aria-label="View of the repayment table"/.test(yv) && /aria-pressed="true"[^>]*>Year-wise</.test(yv) && /aria-pressed="false"[^>]*>Month-wise</.test(yv) && /data-loan-table="year"/.test(yv) && /data-loan-table="month"/.test(mv) && /aria-pressed="true"[^>]*>Month-wise</.test(mv));
ok("year-wise: one row for each year (5), with the total paid, the principal, the interest and the balance at the year's end", heads(yv).join("|") === "Year|Total paid|Principal paid|Interest paid|Balance at year end" && cells(yv).length === 5 && cells(yv)[0].join("|") === ["1", rupees(loanRes.yearly[0].principal + loanRes.yearly[0].interest), rupees(loanRes.yearly[0].principal), rupees(loanRes.yearly[0].interest), rupees(loanRes.yearly[0].closing)].join("|"));
ok("month-wise: one row for EVERY month from the first to the last (60), with that month's EMI, its principal, its interest and the balance after it", heads(mv).join("|") === "Month|EMI|Principal|Interest|Balance" && cells(mv).length === 60 && cells(mv)[0][0] === "1" && cells(mv)[59][0] === "60");
ok("month-wise: in every row the EMI is the principal plus the interest of that month (to the rupee), and the first row's interest is a month of 9.25% on the whole 5 lakh", loanRes.schedule.every((r, k) => cells(mv)[k][1] === rupees(r.principal + r.interest)) && cells(mv)[0][3] === rupees(500000 * 0.0925 / 12) && cells(mv)[0][1] === rupees(loanRes.emi));
ok("month-wise: the instalment is the same in every month but the last (a rounding of paise at most), the interest falls and the principal rises as the balance falls, and the balance ends at ₹ 0", loanRes.schedule.slice(0, 59).every((r) => Math.abs(r.principal + r.interest - loanRes.emi) < 0.01) && cells(mv)[59][4] === rupees(0) && loanRes.schedule.every((r, k) => k === 0 || (r.interest < loanRes.schedule[k - 1].interest && r.principal > loanRes.schedule[k - 1].principal)));
ok("both views are of the same loan: the principal of the year rows and of the month rows each add up to 5 lakh, and so do the interest rows", Math.abs(loanRes.yearly.reduce((a, y) => a + y.principal, 0) - 500000) < 0.01 && Math.abs(loanRes.schedule.reduce((a, r) => a + r.principal, 0) - 500000) < 0.01 && Math.abs(loanRes.yearly.reduce((a, y) => a + y.interest, 0) - loanRes.schedule.reduce((a, r) => a + r.interest, 0)) < 0.01);
ok("every row is shown, none behind a 'Show ... rows' button; the month-wise view scrolls inside its box with its header kept in sight", !/Show (?:every year|the month-by-month schedule)/.test(yv + mv) && /max-h-80/.test(mv) && !/max-h-80/.test(yv) && /sticky top-0/.test(mv));
console.log(`PfPage: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

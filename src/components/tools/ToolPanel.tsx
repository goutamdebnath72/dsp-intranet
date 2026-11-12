// src/components/tools/ToolPanel.tsx
//
// THE TOOLS PANEL OF THE SEARCH BAR. It sits above the search results and shows:
//   - AS YOU TYPE, with no Enter: a sum ("12*45+7"), a unit conversion ("5 km in miles"), a currency conversion ("100 usd to inr"), a date answer ("days between 1 jan 2026 and 15 mar 2026");
//   - after ENTER: a calculator form (EMI, PF maturity, gratuity, leave encashment, dates, converters) or the menu of them.
// All of it runs in the browser. Nothing typed here is stored or sent; the only thing downloaded is the public exchange-rate table, and only when a currency is asked for.
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, ArrowRight, BatteryCharging, Calculator, CalendarRange, Coins, Disc3, Fuel, Gift, Landmark, Newspaper, PiggyBank, Sparkles, TrendingUp, Trophy, Wallet, Zap } from "lucide-react";
import { detectTool, type FormKind } from "@/lib/tools/detect";
import { formatNumber, indianWords } from "@/lib/tools/expression";
import { convertCurrency, validRates, type Rates } from "@/lib/tools/currency";
import { EmiForm, PfForm, GratuityForm, EncashmentForm, DatesForm } from "./ToolForms";
import { ConverterCard, DEFAULT_START } from "./ConverterCard";
import { TyreCard } from "./TyreCard";
import { EvForm } from "./EvForm";
import { CalculatorCard } from "./CalculatorCard";
import { GoldCard } from "./live/GoldCard";
import { FuelCard } from "./live/FuelCard";
import { MarketsCard } from "./live/MarketsCard";
import { NewsCard } from "./live/NewsCard";
import { SportsCard } from "./live/SportsCard";
import type { LiveTopic } from "@/lib/tools/detect";
import { ENGINE_IDS } from "@/lib/tools/converterModel";
import { CopyButton } from "./toolAtoms";
import { ToolShell, fitSize, type Tone } from "./toolKit";

export type RatesState = "idle" | "loading" | "ok" | "error";

let ratesCache: { at: number; rates: Rates } | null = null;
const RATES_TTL_MS = 30 * 60 * 1000;

/** The public exchange-rate table, fetched once when first needed and kept for half an hour. Nothing the user typed is part of the request. */
export function useRates(enabled: boolean): { rates: Rates | null; state: RatesState } {
  const [rates, setRates] = useState<Rates | null>(ratesCache && Date.now() - ratesCache.at < RATES_TTL_MS ? ratesCache.rates : null);
  const [state, setState] = useState<RatesState>(rates ? "ok" : "idle");
  useEffect(() => {
    if (!enabled || (ratesCache && Date.now() - ratesCache.at < RATES_TTL_MS)) {
      if (enabled && ratesCache) { setRates(ratesCache.rates); setState("ok"); }
      return;
    }
    let live = true;
    setState("loading");
    fetch("/api/tools/rates", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (!live) return;
        if (!validRates(j)) throw new Error("bad rates");
        ratesCache = { at: Date.now(), rates: j };
        setRates(j);
        setState("ok");
      })
      .catch(() => live && setState("error"));
    return () => { live = false; };
  }, [enabled]);
  return { rates, state };
}

const FORM_TITLES: Record<FormKind, string> = {
  emi: "Loan EMI calculator",
  pf: "Probable PF maturity calculator",
  gratuity: "Gratuity calculator",
  encashment: "Leave encashment calculator",
  dates: "Date calculators",
  converter: "Unit and currency converter",
  tyre: "Tyre size reader",
  ev: "Electric car charging time",
  calc: "Calculator",
};
const MENU: Array<{ form: FormKind; title: string; text: string; tone: Tone; icon: React.ReactNode }> = [
  { form: "calc", title: "Calculator", text: "Basic and scientific, like the Mac's", tone: "violet", icon: <Calculator size={18} /> },
  { form: "emi", title: "Loan EMI", text: "Bank, PF and co-operative society loans", tone: "sky", icon: <Landmark size={18} /> },
  { form: "pf", title: "PF maturity", text: "What your provident fund may grow to", tone: "emerald", icon: <PiggyBank size={18} /> },
  { form: "gratuity", title: "Gratuity", text: "From last pay and years of service", tone: "violet", icon: <Gift size={18} /> },
  { form: "encashment", title: "Leave encashment", text: "EL / HPL encashment", tone: "amber", icon: <Wallet size={18} /> },
  { form: "dates", title: "Dates", text: "Between dates, add days, age, retirement", tone: "violet", icon: <CalendarRange size={18} /> },
  { form: "converter", title: "Converters", text: "Length, area, energy, power, USD/GBP/EUR…", tone: "sky", icon: <ArrowLeftRight size={18} /> },
  { form: "tyre", title: "Tyre size reader", text: "What 205/55 R16 91V means, part by part", tone: "rose", icon: <Disc3 size={18} /> },
  { form: "ev", title: "Electric car charging", text: "Battery and charger words; time from 10% to 90%", tone: "emerald", icon: <BatteryCharging size={18} /> },
];
const FORM_TONE: Record<FormKind, Tone> = { emi: "sky", pf: "emerald", gratuity: "violet", encashment: "amber", dates: "violet", converter: "sky", tyre: "rose", ev: "emerald", calc: "violet" };
const FORM_ICON: Record<FormKind, React.ReactNode> = Object.fromEntries(MENU.map((m) => [m.form, m.icon])) as Record<FormKind, React.ReactNode>;
const TILE: Record<Tone, string> = {
  sky: "bg-gradient-to-br from-sky-500 via-cyan-500 to-indigo-500", amber: "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500", emerald: "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500",
  violet: "bg-gradient-to-br from-violet-500 via-indigo-500 to-sky-500", rose: "bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-500",
};

interface ShellProps { title: string; subtitle?: string; instant?: boolean; children: React.ReactNode; onClose?: () => void; rates?: boolean | string; tone?: Tone; icon?: React.ReactNode }
function Shell({ icon, tone = "sky", ...rest }: ShellProps) {
  return <ToolShell icon={icon ?? <Calculator size={20} />} tone={tone} {...rest} />;
}



const LIVE_META: Record<LiveTopic, { title: string; subtitle: string; tone: Tone; icon: React.ReactNode; card: (lang?: "en" | "hi" | "bn") => React.ReactNode }> = {
  gold: { title: "Gold and silver in India", subtitle: "IBJA rates, with the trend", tone: "amber", icon: <Coins size={20} />, card: () => <GoldCard /> },
  markets: { title: "Sensex, Nifty and shares", subtitle: "Market data, not advice", tone: "emerald", icon: <TrendingUp size={20} />, card: () => <MarketsCard /> },
  fuel: { title: "Petrol, diesel and LPG", subtitle: "Delhi, Mumbai, Chennai and Kolkata", tone: "rose", icon: <Fuel size={20} />, card: () => <FuelCard /> },
  news: { title: "Today's top headlines", subtitle: "English, हिन्दी and বাংলা, from the publishers' own feeds", tone: "sky", icon: <Newspaper size={20} />, card: (lang) => <NewsCard key={lang ?? "en"} start={lang} /> },
  sports: { title: "Sports headlines", subtitle: "India, and the big world events", tone: "emerald", icon: <Trophy size={20} />, card: () => <SportsCard /> },
};

export function ToolPanel({ query, form, onForm }: { query: string; form: FormKind | "menu" | null; onForm: (f: FormKind | "menu" | null) => void }) {
  const hit = useMemo(() => detectTool(query), [query]);
  const wantsRates = (hit?.kind === "currency") || form === "converter";
  const { rates, state } = useRates(wantsRates);

  // the form opened with Enter
  if (form) {
    if (form === "menu") {
      return (
        <Shell title="Calculators" subtitle="Open one, or type a sum, a conversion or a date question: the answer appears as you type" onClose={() => onForm(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            {MENU.map((m, i) => (
              <motion.button
                key={m.form}
                type="button"
                onClick={() => onForm(m.form)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, type: "spring", stiffness: 260, damping: 24 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-3.5 py-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-white hover:shadow-md"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow ${TILE[m.tone]}`}>{m.icon}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{m.title}</span><span className="block text-xs leading-snug text-slate-500">{m.text}</span></span>
                <ArrowRight size={16} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
              </motion.button>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs leading-relaxed text-slate-700">
            <strong className="text-slate-900">Type these and see the answer at once:</strong>{" "}
            {["12*45+7", "15% of 2400", "5 km in miles", "1 bhp in kw", "100 usd to inr", "205/55 R16 91V", "days between 1 jan 2026 and 15 mar 2026"].map((x) => <code key={x} className="mr-1 inline-block rounded-lg border border-sky-100 bg-white px-1.5 py-0.5 font-semibold text-sky-800">{x}</code>)}
          </div>
        </Shell>
      );
    }
    return (
      <Shell title={FORM_TITLES[form]} tone={FORM_TONE[form]} icon={FORM_ICON[form]} onClose={() => onForm("menu")} rates={form === "converter"}>
        {form === "emi" && <EmiForm />}
        {form === "pf" && <PfForm />}
        {form === "gratuity" && <GratuityForm />}
        {form === "encashment" && <EncashmentForm />}
        {form === "dates" && <DatesForm />}
        {form === "converter" && <ConverterCard start={DEFAULT_START} rates={rates} ratesState={state} />}
        {form === "tyre" && <TyreCard start="205/55 R16 91V" />}
        {form === "ev" && <EvForm />}
        {form === "calc" && <CalculatorCard />}
      </Shell>
    );
  }

  if (!hit) return null;

  // a form or the menu typed but not yet sent: a hint, so the reader knows Enter opens it
  if (hit.kind === "form" || hit.kind === "menu") {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-3 flex items-center gap-3 rounded-2xl border border-dashed border-sky-300 bg-gradient-to-r from-sky-50 to-indigo-50 px-4 py-3 text-sm text-sky-900 shadow-sm">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white"><Calculator size={16} /></span>
        <span>
          Press <kbd className="rounded-md border border-sky-300 bg-white px-2 py-0.5 text-xs font-bold shadow-sm">Enter</kbd> to open the {hit.kind === "menu" ? "calculators" : FORM_TITLES[hit.form].toLowerCase()}.
        </span>
      </motion.div>
    );
  }

  if (hit.kind === "expression") {
    const text = hit.result.exact ?? formatNumber(hit.result.value);
    const words = hit.result.exact ? "" : indianWords(hit.result.value);
    return (
      <Shell title="Calculator" subtitle="Appears as you type" instant>
        <div className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="min-w-0 flex-1">
            <div className="break-words text-sm font-medium text-slate-500">{hit.result.shown} =</div>
            <div className={`mt-1 break-all bg-gradient-to-r from-sky-700 via-indigo-600 to-violet-600 bg-clip-text font-extrabold leading-tight text-transparent transition-[font-size] duration-300 ${fitSize(text)}`}>{text}</div>
            {words && <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-50 to-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800"><Sparkles size={12} />{words}</div>}
            <button type="button" onClick={() => onForm("calc")} className="mt-2 block text-xs font-bold text-violet-700 hover:underline">Open the full calculator (basic and scientific)</button>
          </div>
          <CopyButton text={text} />
        </div>
      </Shell>
    );
  }

  if (hit.kind === "convert") {
    const r = hit.result;
    // engine power (bhp, PS, kW) is always shown as all three
    if (r.kind === "convert" && r.category === "power" && ENGINE_IDS.includes(r.fromId) && ENGINE_IDS.includes(r.toId)) {
      return (
        <Shell title="Engine power: PS, bhp and kW" subtitle="Appears as you type" tone="amber" icon={<Zap3 />} instant>
          <ConverterCard tone="amber" key={`engine|${r.fromId}|${r.value}`} start={{ kind: "engine", from: r.fromId, to: r.toId, value: r.value }} rates={null} ratesState="idle" />
        </Shell>
      );
    }
    if (r.kind === "mismatch") return <Shell title="Unit converter" instant><p className="text-sm text-slate-700">{r.message}</p></Shell>;
    // keyed by what was asked, so the card starts afresh when the question changes and keeps the reader's own edits until then
    return (
      <Shell title="Unit converter" subtitle="Appears as you type" icon={<ArrowLeftRight size={20} />} instant>
        <ConverterCard key={`${r.category}|${r.fromId}|${r.toId}|${r.value}`} start={{ kind: r.category, from: r.fromId, to: r.toId, value: r.value }} rates={null} ratesState="idle" />
      </Shell>
    );
  }

  if (hit.kind === "currency") {
    const req = hit.request;
    return (
      <Shell title="Currency converter" subtitle="Reference rates, appears as you type" tone="emerald" icon={<ArrowLeftRight size={20} />} instant rates>
        <ConverterCard tone="emerald" key={`currency|${req.from.code}|${req.to.code}|${req.amount}|${rates ? "r" : "w"}`} start={{ kind: "currency", from: req.from.code, to: req.to.code, value: req.amount }} rates={rates} ratesState={state} />
      </Shell>
    );
  }

  if (hit.kind === "engine") {
    return (
      <Shell title="Engine power: PS, bhp and kW" subtitle="Appears as you type" tone="amber" icon={<Zap3 />} instant>
        <ConverterCard tone="amber" key={`engine|${hit.id}|${hit.value}`} start={{ kind: "engine", from: hit.id, to: hit.id, value: hit.value }} rates={null} ratesState="idle" />
      </Shell>
    );
  }

  if (hit.kind === "tyre") {
    return (
      <Shell title="How to read a tyre size" subtitle="Appears as you type" tone="rose" icon={<Disc3 size={20} />} instant>
        <TyreCard key={hit.text} start={hit.text} />
      </Shell>
    );
  }

  if (hit.kind === "live") {
    const m = LIVE_META[hit.topic];
    return (
      <Shell title={m.title} subtitle={m.subtitle} tone={m.tone} icon={m.icon} instant rates="only public figures from the source named below are downloaded; what you typed is not sent">
        {m.card(hit.lang)}
      </Shell>
    );
  }

  // a date answer
  const a = hit.answer;
  return (
    <Shell title={a.title} subtitle="Appears as you type" tone="violet" icon={<CalendarRange size={20} />} instant>
      <div className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="min-w-0 flex-1">
          <div className={`break-words bg-gradient-to-r from-violet-700 via-indigo-600 to-sky-600 bg-clip-text font-extrabold leading-tight text-transparent ${fitSize(a.headline, "big").replace("text-2xl", "text-3xl")}`}>{a.headline}</div>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {a.lines.map((l) => <div key={l.label} className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l.label}</dt><dd className="text-right text-sm font-bold text-slate-800">{l.value}</dd></div>)}
          </dl>
          {a.notes.map((n) => <p key={n} className="mt-2 text-xs leading-snug text-slate-500">{n}</p>)}
        </div>
        <CopyButton text={a.headline} />
      </div>
    </Shell>
  );
}

/** the bolt of the engine-power card */
function Zap3() { return <Zap size={20} />; }

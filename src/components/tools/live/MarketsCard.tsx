// src/components/tools/live/MarketsCard.tsx
//
// SENSEX AND NIFTY, with the day's line and change, and the biggest movers of a fixed watch list of large companies (SAIL among them). Market data from a public feed, possibly delayed about
// fifteen minutes, and NEVER advice: the card says both, and names the list instead of claiming to show the whole market. Nothing typed is sent anywhere.
"use client";

import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { DateTime } from "luxon";
import { useLive } from "@/hooks/useLive";
import { sessionState, type MarketsData, type Quote } from "@/lib/live/markets";
import { ChangeChip, LiveGate, SourceLine, Sparkline, stamp } from "./LivePieces";

const num = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** each index has its own deep gradient with white text (so that it stands out from the card's own pale green); whether the day is up or down is said by the change pill and by the line: green on a dark tile would be lost, so the line is white and the pill is the pale green or red it always was */
const TILES = [
  { tile: "from-indigo-600 via-violet-600 to-purple-700 border-indigo-400/60 shadow-indigo-500/30", name: "text-indigo-100", sub: "text-indigo-100/90" },
  { tile: "from-sky-500 via-blue-600 to-indigo-600 border-sky-300/60 shadow-sky-500/30", name: "text-sky-100", sub: "text-sky-100/90" },
  { tile: "from-fuchsia-600 via-purple-600 to-violet-700 border-fuchsia-400/60 shadow-fuchsia-500/30", name: "text-fuchsia-100", sub: "text-fuchsia-100/90" },
] as const;

function IndexTile({ q, i }: { q: Quote; i: number }) {
  const up = q.change >= 0;
  const c = TILES[i % TILES.length];
  const state = sessionState(q.time, DateTime.now());
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, type: "spring", stiffness: 260, damping: 24 }} data-index-tile={up ? "up" : "down"} className={`relative overflow-hidden rounded-3xl border bg-gradient-to-br p-4 text-white shadow-lg ${c.tile}`}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex items-center justify-between gap-2">
        <span className={`text-xs font-extrabold uppercase tracking-widest ${c.name}`}>{q.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${state === "live" ? "bg-emerald-100 text-emerald-800" : "bg-white/85 text-slate-700"}`}>{state === "live" ? "LIVE" : "LAST CLOSE"}</span>
      </div>
      <div className="relative mt-1 text-3xl font-extrabold tabular-nums leading-tight text-white">{num(q.price)}</div>
      <div className="relative mt-1"><ChangeChip abs={q.change} pct={q.pct} /></div>
      <div className="relative mt-2"><Sparkline values={q.spark} color="#ffffff" /></div>
      <div className={`relative mt-1 flex justify-between text-[11px] font-semibold ${c.sub}`}><span>Low {q.low !== null ? num(q.low) : "—"}</span><span>High {q.high !== null ? num(q.high) : "—"}</span></div>
    </motion.div>
  );
}

function MoverRow({ q }: { q: Quote }) {
  return (
    <li className={`flex items-center justify-between gap-3 rounded-xl px-3 py-1.5 ${q.name === "SAIL" ? "bg-amber-50 ring-1 ring-amber-200" : ""}`}>
      <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{q.name}</span>
      <span className="flex items-center gap-2"><span className="text-sm font-bold tabular-nums text-slate-800">₹{num(q.price)}</span><ChangeChip abs={q.change} pct={q.pct} /></span>
    </li>
  );
}

export function MarketsBody({ data }: { data: MarketsData }) {
  const sail = data.stocks.find((s) => s.name === "SAIL");
  const asOf = data.indices[0]?.time || data.stocks[0]?.time || "";
  return (
    <div>
      {data.indices.length > 0 && <div className="grid gap-3 sm:grid-cols-3">{data.indices.map((q, i) => <IndexTile key={q.symbol} q={q} i={i} />)}</div>}
      {asOf && <p className="mt-2 text-xs text-slate-500">Last price at {stamp(asOf)} IST. Prices may be delayed by about fifteen minutes.</p>}
      {data.saved && (
        <p role="status" data-saved-copy className="mt-2 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">
          <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden="true" />
          <span><strong>Not live.</strong> Yahoo Finance did not answer just now, so {data.saved.names.length === data.indices.length + data.stocks.length ? "these are" : `${data.saved.names.join(", ")} ${data.saved.names.length === 1 ? "is" : "are"}`} the last figures this site saved, received {stamp(data.saved.at)} IST. The price shown for each is its last price, with its own time. Try again in a few minutes for live figures.</span>
        </p>
      )}

      {data.stocks.length > 0 && (
        <div className="mt-4 rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm">
          <h4 className="text-sm font-bold text-slate-900">Trending in the watch list <span className="font-normal text-slate-500">(biggest movers of {data.stocks.length} large companies, SAIL included)</span></h4>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-extrabold uppercase tracking-widest text-emerald-700">Top gainers</div>
              {data.gainers.length ? <ul className="space-y-1">{data.gainers.map((q) => <MoverRow key={q.symbol} q={q} />)}</ul> : <p className="text-sm text-slate-500">None is up.</p>}
            </div>
            <div>
              <div className="mb-1 text-xs font-extrabold uppercase tracking-widest text-rose-700">Top losers</div>
              {data.losers.length ? <ul className="space-y-1">{data.losers.map((q) => <MoverRow key={q.symbol} q={q} />)}</ul> : <p className="text-sm text-slate-500">None is down.</p>}
            </div>
          </div>
          {sail && !data.gainers.includes(sail) && !data.losers.includes(sail) && <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-1"><ul><MoverRow q={sail} /></ul></div>}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-bold text-slate-600 hover:text-slate-900">The whole watch list ({data.stocks.length})</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">{[...data.stocks].sort((a, b) => b.pct - a.pct).map((q) => <MoverRow key={q.symbol} q={q} />)}</ul>
          </details>
        </div>
      )}
      {data.missing.length > 0 && <p className="mt-2 text-xs text-amber-700">Not answering just now: {data.missing.join(", ")}.</p>}
      <p className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-snug text-slate-600"><strong>Market data, not advice.</strong> Nothing here is a recommendation to buy, sell or hold any share. The watch list is a fixed list of large companies, not a ranking of the whole market. Check live prices with your broker before you act on any figure.</p>
    </div>
  );
}

export function MarketsCard() {
  const { state, env, error, reload } = useLive<MarketsData>("/api/live/markets");
  return (
    <LiveGate state={state} error={error} reload={reload} what="Market data">
      {env && (
        <>
          <MarketsBody data={env.data} />
          <SourceLine env={env} reload={reload} loading={state === "loading"} />
        </>
      )}
    </LiveGate>
  );
}

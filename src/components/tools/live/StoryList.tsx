// src/components/tools/live/StoryList.tsx
//
// A LIST OF HEADLINES for the news and sports cards: the first story large, the rest in rows, each with its publisher, how long ago, and a link that opens the publisher's page in a NEW TAB
// (rel noopener noreferrer: the other site learns nothing about this one). Only headlines and links are shown, never the story itself.
"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { DateTime } from "luxon";
import type { FeedItem } from "@/lib/live/rss";

/** "12 min ago", "3 h ago", "yesterday"; "" for a story without a time */
export function ago(iso: string, now: DateTime = DateTime.now()): string {
  if (!iso) return "";
  const d = DateTime.fromISO(iso);
  if (!d.isValid) return "";
  const mins = Math.max(0, Math.round(now.diff(d, "minutes").minutes));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return h < 48 ? "yesterday" : `${Math.round(h / 24)} days ago`;
}

const CHIP = ["bg-sky-100 text-sky-800", "bg-rose-100 text-rose-800", "bg-emerald-100 text-emerald-800", "bg-violet-100 text-violet-800", "bg-amber-100 text-amber-800", "bg-cyan-100 text-cyan-800"];
const chipOf = (source: string) => CHIP[[...source].reduce((a, c) => a + c.charCodeAt(0), 0) % CHIP.length];

export function StoryList({ items, lang, empty }: { items: Array<FeedItem & { tag?: string }>; lang?: string; empty: string }) {
  if (!items.length) return <p className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-600">{empty}</p>;
  const [top, ...rest] = items;
  return (
    <div lang={lang}>
      <motion.a
        href={top.link}
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="group relative block overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 p-5 text-white shadow-lg ring-1 ring-white/10 transition hover:-translate-y-0.5"
      >
        <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-sky-400/25 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="rounded-full bg-white/15 px-2.5 py-0.5">{top.source}</span>
          {top.publishedAt && <span className="text-sky-200">{ago(top.publishedAt)}</span>}
          {top.tag && <span className="rounded-full bg-amber-400/90 px-2.5 py-0.5 text-amber-950">{top.tag}</span>}
        </div>
        <h4 className="relative mt-2 text-xl font-extrabold leading-snug">{top.title}</h4>
        <span className="relative mt-3 inline-flex items-center gap-1 text-xs font-bold text-sky-200 group-hover:underline">Read at {top.source} <ArrowUpRight size={14} /></span>
      </motion.a>
      <ol className="mt-3 grid gap-2">
        {rest.map((it, i) => (
          <motion.li key={it.link} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.025 * i, type: "spring", stiffness: 260, damping: 24 }}>
            <a href={it.link} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-2.5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-extrabold text-slate-600">{i + 2}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug text-slate-900 group-hover:underline">{it.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-bold ${chipOf(it.source)}`}>{it.source}</span>
                  {it.publishedAt && <span className="text-slate-500">{ago(it.publishedAt)}</span>}
                  {it.tag && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">{it.tag}</span>}
                </span>
              </span>
              <ArrowUpRight size={16} className="mt-1 shrink-0 text-slate-300 transition group-hover:text-slate-600" />
            </a>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

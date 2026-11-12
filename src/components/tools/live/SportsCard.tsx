// src/components/tools/live/SportsCard.tsx
//
// SPORTS HEADLINES: those with India directly in them, the big world events (World Cups, the Olympics, the Asian and Commonwealth Games, Grand Slams ... with or without India), and all.
// Headlines and links to the publisher's page (a new tab), not live scores: no free steady live-score feed exists, and this card says so. Nothing typed is sent anywhere.
"use client";

import React, { useMemo, useState } from "react";
import { useLive } from "@/hooks/useLive";
import type { SportsData, SportsGroup } from "@/lib/live/sports";
import { LiveGate, SourceLine } from "./LivePieces";
import { StoryList } from "./StoryList";

type Tab = "india" | "world" | "all";
const TABS: Array<[Tab, string]> = [["india", "India"], ["world", "World events"], ["all", "All sports"]];

export function SportsCard() {
  const [tab, setTab] = useState<Tab>("india");
  const { state, env, error, reload } = useLive<SportsData>("/api/live/sports");
  const shown = useMemo(() => {
    const items = env?.data.items ?? [];
    const keep = (i: { groups: SportsGroup[] }) => tab === "all" || i.groups.includes(tab);
    return items.filter(keep).slice(0, 12).map((i) => ({ ...i, tag: tab === "all" ? (i.groups.includes("world") ? "World event" : undefined) : undefined }));
  }, [env, tab]);
  const count = (t: Tab) => (env?.data.items ?? []).filter((i) => t === "all" || i.groups.includes(t)).length;
  return (
    <div>
      <div role="tablist" aria-label="Kind of sports news" className="mb-3 flex flex-wrap gap-2">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${tab === t ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/30" : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700"}`}>
            {label}{env ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${tab === t ? "bg-white/25" : "bg-slate-100"}`}>{count(t)}</span> : null}
          </button>
        ))}
      </div>
      <LiveGate state={state} error={error} reload={reload} what="Sports news">
        {env && (
          <>
            <StoryList items={shown} empty={tab === "india" ? "No story with India in it in the latest headlines." : "No story of that kind in the latest headlines."} />
            {env.data.failed.length > 0 && <p className="mt-2 text-xs text-amber-700">Not answering just now: {env.data.failed.join(", ")}.</p>}
            <p className="mt-2 text-xs leading-snug text-slate-500">India: stories with India, an Indian team, player or league in them. World events: a World Cup, the Olympics, the Asian or Commonwealth Games, a Grand Slam and the like, whether or not India plays. These are headlines with links to the publisher (new tab), not live scores.</p>
            <SourceLine env={env} reload={reload} loading={state === "loading"} />
          </>
        )}
      </LiveGate>
    </div>
  );
}

// src/components/tools/live/NewsCard.tsx
//
// TODAY'S HEADLINES, LIVE: the Business tab first (The Economic Times, Mint, The Hindu BusinessLine, The Wall Street Journal), then English, Hindi and Bengali, from the publishers' own free feeds.
// It keeps itself current: every minute it asks again, quietly (nothing is replaced by a loading box), and the new stories slide in at the top of a list that does not jump (LiveStories.tsx).
// Checking pauses while the page is hidden and can be paused by hand (LiveStrip.tsx). Headlines and links only; each story opens on the publisher's page in a new tab; the feeds that did not answer
// are named. Nothing typed is sent anywhere (the request carries only the tab).
"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLive } from "@/hooks/useLive";
import { LANG_LABEL, NEWS_TABS, type NewsData, type NewsTab } from "@/lib/live/news";
import { LiveGate, SourceLine } from "./LivePieces";
import { LiveStories } from "./LiveStories";
import { LiveStrip, modeOf } from "./LiveStrip";

/** how often the open tab asks again: the route keeps one answer for a minute, so a faster pace would only ask the same answer */
export const NEWS_REFRESH_MS = 60_000;

export function NewsCard({ start = "biz" }: { start?: NewsTab }) {
  const [lang, setLang] = useState<NewsTab>(start);
  const [paused, setPaused] = useState(false);
  const { state, env, error, reload, refresh, refreshing, lagging } = useLive<NewsData>(`/api/live/news?lang=${lang}`, true, { refreshMs: paused ? 0 : NEWS_REFRESH_MS });
  // what is held may belong to the tab that was open a moment ago: only the open tab's answer is shown
  const mine = env && env.data.lang === lang ? env : null;
  // when the last answer came in (for the countdown and the bar)
  const [arrivedAt, setArrivedAt] = useState(() => Date.now());
  useEffect(() => { setArrivedAt(Date.now()); }, [mine, lang]);
  return (
    <div>
      <div role="tablist" aria-label="Kind and language of the news" className="mb-3 flex flex-wrap gap-2">
        {NEWS_TABS.map((l) => (
          <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)} className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${lang === l ? "bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-500/30" : "border border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700"}`}>{LANG_LABEL[l]}</button>
        ))}
      </div>
      <LiveGate state={mine ? "ok" : state} error={error} reload={reload} what="The news">
        {mine && (
          <>
            <LiveStrip fetchedAt={mine.fetchedAt} arrivedAt={arrivedAt} everyMs={NEWS_REFRESH_MS} mode={modeOf(paused, lagging)} refreshing={refreshing} onTogglePause={() => setPaused((p) => !p)} onRefresh={refresh} />
            {/* a tab change is a soft cross-fade; a refresh of the same tab never remounts the list */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={lang} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <LiveStories items={mine.data.items} lang={lang === "biz" ? "en" : lang} empty="No headlines came through just now." />
              </motion.div>
            </AnimatePresence>
            {mine.data.failed.length > 0 && <p className="mt-2 text-xs text-amber-700">Not answering just now: {mine.data.failed.join(", ")}.</p>}
            <p className="mt-2 text-xs leading-snug text-slate-500">{lang === "biz" ? "Business stories" : "Top stories"} from {mine.data.used.join(", ")}, the newest first, none older than a day and a half. The page asks again every minute while it is open and in view. Headlines and links only: a story opens on its publisher&apos;s own page in a new tab.</p>
            {lang === "bn" && <p className="mt-1 text-xs leading-snug text-slate-500">This tab is chosen like a front page, from several Bengali dailies, with Anandabazar Patrika first among them: militant attacks, war, deaths announced, stories that three papers carry, politics, sports, metro and business are chosen first, then the rest; they are shown by time, the latest at the top. A story two papers carry is shown once.</p>}
            {lang === "biz" && <p className="mt-1 text-xs leading-snug text-slate-500">The headlines are free to read here, but a paper may ask for a subscription for some of its own stories (the Wall Street Journal for most, Mint Premium, ET Prime, a BusinessLine subscriber piece). Business Standard and Financial Express are not included: their servers refuse automated requests, so their feeds cannot be read.</p>}
            <SourceLine env={mine} />
          </>
        )}
      </LiveGate>
    </div>
  );
}

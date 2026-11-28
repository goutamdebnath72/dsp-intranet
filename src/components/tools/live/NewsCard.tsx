// src/components/tools/live/NewsCard.tsx
//
// Today's headlines, live: the Business tab first (The Economic Times, Mint, The Hindu BusinessLine, The Wall Street Journal), then Steel (SAIL and every steel plant, hunted in many papers), then English, Hindi and Bengali, from the publishers' own free feeds.
// I made it keep itself current: every minute it asks again, quietly (nothing is replaced by a loading box), and the new stories slide in at the top of a list that does not jump (LiveStories.tsx).
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

/** How often the open tab asks again: the route keeps one answer for a minute, so a faster pace would only ask for the same answer. */
export const NEWS_REFRESH_MS = 60_000;

/** The lines under the Steel tab: what it hunts, how long a story stays, how many papers carried what is shown, and the engines or papers that did not answer. */
function SteelNote({ data }: { data: NewsData }) {
  const shown = data.items.length;
  const papers = data.steelPapers?.length ?? 0;
  return (
    <p className="mt-1 text-xs leading-snug text-slate-500">
      <span className="font-bold text-amber-700">Steel.</span> News of SAIL and its units and of any other steel plant or company, with the news of their shares, newest at the top; each stays for 48 hours after it was reported and sinks as it ages.
      {shown > 0 ? ` ${shown} ${shown === 1 ? "story" : "stories"} from ${papers} ${papers === 1 ? "paper" : "papers"} just now` : " No steel story in the last 48 hours just now"}, found by asking Google News and Bing News about steel in English and Hindi, so papers that no feed of ours reads are in it too, and by picking the steel stories out of the business papers&apos; own feeds. A story is taken only when its own headline is about steel (in English, about India). The same news in other words, from other papers and in the other language is ONE row, naming the first paper and a few of the others (it is matched by the companies and the figures the headlines share and, for what those cannot tell, by a light AI model, Google Gemini Flash-Lite, shown only the headlines of the public feeds).
    </p>
  );
}

export function NewsCard({ start = "biz" }: { start?: NewsTab }) {
  const [lang, setLang] = useState<NewsTab>(start);
  const [paused, setPaused] = useState(false);
  const { state, env, error, reload, refresh, refreshing, lagging } = useLive<NewsData>(`/api/live/news?lang=${lang}`, true, { refreshMs: paused ? 0 : NEWS_REFRESH_MS });
  // What is held may belong to the tab that was open a moment ago, so I show only the open tab's answer.
  const mine = env && env.data.lang === lang ? env : null;
  // When the last answer came in (for the countdown and the bar).
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
            {/* A tab change is a soft cross-fade; I never remount the list on a refresh of the same tab. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={lang} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <LiveStories items={mine.data.items} lang={lang === "biz" || lang === "steel" ? "en" : lang} empty={lang === "steel" ? "No steel story in the last 48 hours came through just now." : "No headlines came through just now."} />
              </motion.div>
            </AnimatePresence>
            {mine.data.failed.length > 0 && <p className="mt-2 text-xs text-amber-700">Not answering just now: {mine.data.failed.join(", ")}.</p>}
            <p className="mt-2 text-xs leading-snug text-slate-500">{lang === "biz" ? "Business stories" : lang === "steel" ? "Steel stories" : "Top stories"} from {mine.data.used.join(", ")}, the newest first, none older than {lang === "steel" ? "two days" : "a day and a half"}. The page asks again every minute while it is open and in view. Headlines and links only: a story opens on its publisher&apos;s own page in a new tab.</p>
            <p className="mt-1 text-xs leading-snug text-slate-500"><span className="font-bold text-slate-700">Only stories with a picture, free to read.</span> Each card shows the picture its paper gives the story (a small copy, made by this intranet and kept for a day). When a paper gives none, or does not let its page be read, I look for the same headline in Bing News and take its picture only if the headline is the same; if there is no picture after that, the story is left out, whatever it is. So is a story that its paper marks as needing a subscription (The Hindu, for one, marks its stories so). Where a paper says nothing about a subscription I take the story as free, and where I could not read a paper's page I could not check it.</p>
            {lang === "steel" && <SteelNote data={mine.data} />}
            {(lang === "en" || lang === "hi" || lang === "bn") && <p className="mt-1 text-xs leading-snug text-slate-500"><span className="font-bold text-slate-700">Priority news first.</span> The death of a renowned person (West Bengal first, then India, then the world), a big accident (in a steel plant or elsewhere, West Bengal first, then India; none from abroad) a mass killing (a massacre of ten or more dead, anywhere in the world) and a diplomatic visit (a foreign leader or delegation coming to India, or the Prime Minister abroad) stand at the top with a chip, in the tab of the language they arrived in first, and in no other, except the major ones: the death of an eminent person told by several papers in more than one language, a massacre or accident of 25 or more dead, and any story that six or more papers tell, which stand in every tab that carried them. A new death, massacre, accident or visit does not wait for the half hour: it is looked for every three minutes. They are picked out by the words of the headline, so a death, an accident or a visit whose headline does not say who or how big is not caught.</p>}
            {lang === "biz" && <p className="mt-1 text-xs leading-snug text-slate-500"><span className="font-bold text-emerald-700">Records first.</span> A record high or low of the share market, of gold or silver, or of the dollar against the rupee stands at the top with a chip, when two papers or one of the four business papers carry it. They are picked out by the words of the headline.</p>}
            {lang === "bn" && <p className="mt-1 text-xs leading-snug text-slate-500">This tab is chosen like a front page, from several Bengali dailies, with Anandabazar Patrika first among them: militant attacks, war, deaths announced, stories that three papers carry, politics, sports, metro and business are chosen first, then the rest; they are shown by time, the latest at the top. A story two papers carry is shown once.</p>}
            {lang === "biz" && <p className="mt-1 text-xs leading-snug text-slate-500">Stories that need a subscription (most of the Wall Street Journal, Mint Premium, ET Prime, a BusinessLine premium piece) are left out where the paper marks them so. The feeds of Business Standard and Financial Express cannot be read (their servers refuse automated requests), so they are not among the papers above. Share-price and market news of every company is here as the papers print it; steel news has a tab of its own.</p>}
            <SourceLine env={mine} />
          </>
        )}
      </LiveGate>
    </div>
  );
}

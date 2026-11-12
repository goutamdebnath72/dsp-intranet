// src/components/tools/live/NewsCard.tsx
//
// TODAY'S TOP HEADLINES in English, Hindi and Bengali, from the publishers' own free feeds: the first story large, the rest in rows, each opening the publisher's page in a new tab.
// Headlines and links only. The feeds that did not answer are named. Nothing typed is sent anywhere (the request carries only the language tab).
"use client";

import React, { useState } from "react";
import { useLive } from "@/hooks/useLive";
import { LANG_LABEL, NEWS_LANGS, type NewsData, type NewsLang } from "@/lib/live/news";
import { LiveGate, SourceLine } from "./LivePieces";
import { StoryList } from "./StoryList";

export function NewsCard({ start = "en" }: { start?: NewsLang }) {
  const [lang, setLang] = useState<NewsLang>(start);
  const { state, env, error, reload } = useLive<NewsData>(`/api/live/news?lang=${lang}`);
  return (
    <div>
      <div role="tablist" aria-label="Language of the news" className="mb-3 flex gap-2">
        {NEWS_LANGS.map((l) => (
          <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)} className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${lang === l ? "bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-500/30" : "border border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700"}`}>{LANG_LABEL[l]}</button>
        ))}
      </div>
      <LiveGate state={state} error={error} reload={reload} what="The news">
        {env && (
          <>
            <StoryList items={env.data.items} lang={lang} empty="No headlines came through just now." />
            {env.data.failed.length > 0 && <p className="mt-2 text-xs text-amber-700">Not answering just now: {env.data.failed.join(", ")}.</p>}
            <p className="mt-2 text-xs leading-snug text-slate-500">Top stories from {env.data.used.join(", ")}, the first of each in turn, newest within a day and a half. Headlines and links only: a story opens on its publisher&apos;s own page in a new tab.</p>
            <SourceLine env={env} reload={reload} loading={state === "loading"} />
          </>
        )}
      </LiveGate>
    </div>
  );
}

// src/tools/dates/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the date calculators (their tile and page) and the answer to a typed date question.
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { CalendarRange } from "lucide-react";
import { DatesForm } from "./DatesForm";
import { CopyButton } from "@/components/tools/toolAtoms";
import { ToolShell, fitSize } from "@/components/tools/toolKit";
import { onHit, type TopicUi } from "@/tools/uiTypes";

export const datesUi: TopicUi = {
  id: "dates",
  form: {
    title: "Date calculators",
    tone: "violet",
    icon: <CalendarRange size={18} />,
    menu: { title: "Dates", text: "Between dates, add days, age, retirement" },
    render: () => <DatesForm />,
  },
  hits: [
    onHit("date", (hit) => {
      const a = hit.answer;
      return (
        <ToolShell title={a.title} subtitle="Appears as you type" tone="violet" icon={<CalendarRange size={20} />} instant>
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
        </ToolShell>
      );
    }),
  ],
};

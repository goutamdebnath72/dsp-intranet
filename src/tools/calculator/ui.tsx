// src/tools/calculator/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the full calculator (its tile and its page) and the answer to a typed sum.
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { Calculator, Sparkles } from "lucide-react";
import { formatNumber, indianWords } from "./expression";
import { CalculatorCard } from "./CalculatorCard";
import { CopyButton } from "@/components/tools/toolAtoms";
import { ToolShell, fitSize } from "@/components/tools/toolKit";
import { onHit, type TopicUi } from "@/tools/uiTypes";

export const calcUi: TopicUi = {
  id: "calc",
  form: {
    title: "Calculator",
    tone: "violet",
    icon: <Calculator size={18} />,
    menu: { title: "Calculator", text: "Basic and scientific, like the Mac's" },
    render: () => <CalculatorCard />,
  },
  hits: [
    onHit("expression", (hit, c) => {
      const text = hit.result.exact ?? formatNumber(hit.result.value);
      const words = hit.result.exact ? "" : indianWords(hit.result.value);
      return (
        <ToolShell title="Calculator" subtitle="Appears as you type" tone="sky" icon={<Calculator size={20} />} instant>
          <div className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="min-w-0 flex-1">
              <div className="break-words text-sm font-medium text-slate-500">{hit.result.shown} =</div>
              <div className={`mt-1 break-all bg-gradient-to-r from-sky-700 via-indigo-600 to-violet-600 bg-clip-text font-extrabold leading-tight text-transparent transition-[font-size] duration-300 ${fitSize(text)}`}>{text}</div>
              {words && <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-50 to-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800"><Sparkles size={12} />{words}</div>}
              <button type="button" onClick={() => c.openForm("calc")} className="mt-2 block text-xs font-bold text-violet-700 hover:underline">Open the full calculator (basic and scientific)</button>
            </div>
            <CopyButton text={text} />
          </div>
        </ToolShell>
      );
    }),
  ],
};

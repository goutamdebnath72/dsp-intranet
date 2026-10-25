// src/components/HospitalAnswerCard.tsx
// Draws a hospital OPD answer: the title with its Open / Closed badge, the one-line verdict, THE TABLE FIRST, the short points, the pointer (for example the Emergency Department) and the red notes
// (the OPD and card registration hours by the clock). Plain text only (React escapes it); the badge and the verdict are never colour alone: their words carry the meaning.

import React from "react";
import { Ambulance } from "lucide-react";
import type { HospitalAnswer } from "@/lib/hospital/types";

const TONE: Record<"open" | "closed" | "unknown" | "info", string> = {
  open: "bg-green-100 text-green-900 border-green-200",
  closed: "bg-red-100 text-red-900 border-red-200",
  unknown: "bg-amber-100 text-amber-900 border-amber-200",
  info: "bg-slate-100 text-slate-800 border-slate-200",
};
const BADGE: Record<"open" | "closed" | "unknown", string> = {
  open: "bg-green-600 text-white",
  closed: "bg-red-600 text-white",
  unknown: "bg-amber-500 text-white",
};

export function HospitalAnswerCard({ answer }: { answer: HospitalAnswer }) {
  const suggestion = answer.suggestion ? answer.suggestion.split("\n").filter(Boolean) : [];
  return (
    <div className="space-y-2" data-hospital-answer="true">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-neutral-800">{answer.title}</p>
        {answer.badge && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE[answer.badge.tone]}`} data-badge={answer.badge.tone}>
            {answer.badge.text}
          </span>
        )}
      </div>
      {answer.status && (
        <p className={`rounded-md border px-2.5 py-1.5 text-sm font-semibold ${TONE[answer.status.tone]}`} data-tone={answer.status.tone}>
          {answer.status.text}
        </p>
      )}
      {answer.table && answer.table.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full text-left text-xs sm:text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                {answer.table.columns.map((c, i) => (
                  <th key={i} scope="col" className="px-3 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {answer.table.rows.map((row, ri) => (
                <tr key={ri} className="border-t border-neutral-100 align-top">
                  {row.map((cell, ci) => (
                    <td key={ci} className={`px-3 py-2 ${ci === 0 ? "font-medium text-neutral-800" : "text-neutral-700"}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {answer.lines && answer.lines.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-neutral-700" data-points="true">
          {answer.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {suggestion.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-sm text-blue-900" data-suggestion="true">
          <Ambulance size={16} className="mt-0.5 flex-shrink-0" />
          {suggestion.length === 1 ? (
            <span>{suggestion[0]}</span>
          ) : (
            <ul className="list-disc space-y-0.5 pl-4">
              {suggestion.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {answer.notes && answer.notes.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs font-medium text-red-700" data-notes="true">
          {answer.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

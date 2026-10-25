// src/components/HospitalAnswerCard.tsx
// Draws a hospital OPD answer (step 51a): a title, a one-line verdict (open / closed / not known / information), lines, a table and the caveats.
// Plain text only (React escapes it); the verdict is never colour alone: its words carry the meaning.

import React from "react";
import { Ambulance, AlertTriangle } from "lucide-react";
import type { HospitalAnswer } from "@/lib/hospital/types";

const TONE: Record<"open" | "closed" | "unknown" | "info", string> = {
  open: "bg-green-100 text-green-900 border-green-200",
  closed: "bg-red-100 text-red-900 border-red-200",
  unknown: "bg-amber-100 text-amber-900 border-amber-200",
  info: "bg-slate-100 text-slate-800 border-slate-200",
};

export function HospitalAnswerCard({ answer }: { answer: HospitalAnswer }) {
  return (
    <div className="space-y-2" data-hospital-answer="true">
      <p className="text-sm font-semibold text-neutral-800">{answer.title}</p>
      {answer.status && (
        <p className={`rounded-md border px-2.5 py-1.5 text-sm font-semibold ${TONE[answer.status.tone]}`} data-tone={answer.status.tone}>
          {answer.status.text}
        </p>
      )}
      {answer.suggestion && (
        <p className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-sm text-blue-900" data-suggestion="true">
          <Ambulance size={16} className="mt-0.5 flex-shrink-0" />
          <span>{answer.suggestion}</span>
        </p>
      )}
      {answer.lines?.map((line, i) => (
        <p key={i} className="text-sm text-neutral-700">
          {line}
        </p>
      ))}
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
      {answer.notes?.map((note, i) => (
        <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          <span>{note}</span>
        </p>
      ))}
    </div>
  );
}

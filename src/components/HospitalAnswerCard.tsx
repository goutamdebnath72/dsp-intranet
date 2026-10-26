// src/components/HospitalAnswerCard.tsx
// Draws a hospital OPD answer: the title with its Open / Closed badge, the one-line verdict, THE TABLE FIRST, the short points, the pointer (for example the Emergency Department) and the red notes
// (the OPD and card registration hours by the clock). Plain text only (React escapes it); the badge and the verdict are never colour alone: their words carry the meaning.

import React from "react";
import { Ambulance, CalendarCheck, HelpCircle } from "lucide-react";
import type { HospitalAnswer, HospitalTable } from "@/lib/hospital/types";

const TONE: Record<"open" | "closed" | "unknown" | "info", string> = {
  open: "bg-green-100 text-green-900 border-green-200",
  closed: "bg-red-100 text-red-900 border-red-200",
  unknown: "bg-amber-100 text-amber-900 border-amber-200",
  info: "bg-slate-100 text-slate-800 border-slate-200",
};
/** The headline: the answer itself, big and bold. Green Yes, red No, amber when it is not known; a plain value is dark. The words carry the meaning, never the colour alone. */
const HEADLINE: Record<"yes" | "no" | "info" | "unknown", string> = {
  yes: "text-green-600",
  no: "text-red-600",
  info: "text-neutral-900",
  unknown: "text-amber-600",
};
/** Under a Yes or No headline the sentence does not repeat the word. */
const withoutVerdict = (text: string, headline?: { text: string; tone: string }): string =>
  headline && (headline.tone === "yes" || headline.tone === "no") ? text.replace(new RegExp(`^${headline.text}\\b[:,.]\\s*`, "i"), "") || text : text;

const BADGE: Record<"open" | "closed" | "unknown", string> = {
  open: "bg-green-600 text-white",
  closed: "bg-red-600 text-white",
  unknown: "bg-amber-500 text-white",
};

/** A short cell ("OPD 12", "Unit III", "not recorded", a ticket) is never broken over two lines; a long one (the days, a name with a note) wraps as it needs to. The first column (Unit / OPD / Room) is given a little more room. */
const keepOnOneLine = (cell: string, columnIndex: number): boolean => cell.length <= (columnIndex === 0 ? 24 : 16);

function TableView({ table }: { table: HospitalTable }) {
  return (
    <div className="omni-noscale overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="min-w-full text-left text-xs sm:text-sm">
        <thead className="bg-neutral-50 text-neutral-600">
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className="border-t border-neutral-100 align-top">
              {row.map((cell, ci) => (
                <td key={ci} className={`px-3 py-2 ${keepOnOneLine(cell, ci) ? "whitespace-nowrap " : ""}${ci === 0 ? "font-medium text-neutral-800" : "text-neutral-700"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HospitalAnswerCard({ answer }: { answer: HospitalAnswer }) {
  const suggestion = answer.suggestion ? answer.suggestion.split("\n").filter(Boolean) : [];
  return (
    <div className="space-y-2" data-hospital-answer="true">
      {answer.headline && (
        <p className={`text-3xl font-extrabold leading-tight tracking-tight ${HEADLINE[answer.headline.tone]}`} data-headline={answer.headline.tone}>
          {answer.headline.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <p className={answer.headline ? "text-xs font-semibold text-neutral-500" : "text-sm font-semibold text-neutral-800"} data-title="true">{answer.title}</p>
        {answer.badge && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE[answer.badge.tone]}`} data-badge={answer.badge.tone}>
            {answer.badge.text}
          </span>
        )}
      </div>
      {answer.status && (answer.headline && answer.status.tone !== "unknown") ? (
        // under a headline the sentence is plain: the headline carries the colour (an amber caution keeps its box)
        <p className="text-sm text-neutral-700" data-tone={answer.status.tone} data-sentence="true">
          {withoutVerdict(answer.status.text, answer.headline)}
        </p>
      ) : answer.status ? (
        <p className={`rounded-md border px-2.5 py-1.5 text-sm font-semibold ${TONE[answer.status.tone]}`} data-tone={answer.status.tone}>
          {answer.headline ? withoutVerdict(answer.status.text, answer.headline) : answer.status.text}
        </p>
      ) : null}
      {answer.highlight && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-sm font-semibold text-emerald-900" data-highlight="true">
          <CalendarCheck size={18} className="mt-0.5 flex-shrink-0" />
          <span>{answer.highlight}</span>
        </div>
      )}
      {answer.table && answer.table.rows.length > 0 && <TableView table={answer.table} />}
      {answer.extraTables?.map((x, i) =>
        x.table.rows.length > 0 ? (
          <div key={i} className="space-y-1" data-extra-table="true">
            <p className="text-xs font-semibold text-neutral-600">{x.title}</p>
            <TableView table={x.table} />
          </div>
        ) : null,
      )}
      {answer.lines && answer.lines.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-neutral-700" data-points="true">
          {answer.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {answer.details?.map((d, i) => (
        // keyed by the ANSWER as well as the position: a folded line that was opened on one answer is closed again on the next (the same <details> element must not be reused)
        <details key={`${answer.title}|${i}|${d.summary}`} className="text-sm text-neutral-600" data-details="true">
          <summary className="cursor-pointer font-medium text-neutral-700">{d.summary}</summary>
          <p className="mt-1">{d.text}</p>
        </details>
      ))}
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
      {answer.prompt && (
        <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-white px-2.5 py-2 text-sm font-semibold text-blue-900" data-prompt="true">
          <HelpCircle size={18} className="mt-0.5 flex-shrink-0" />
          <span>{answer.prompt}</span>
        </div>
      )}
    </div>
  );
}

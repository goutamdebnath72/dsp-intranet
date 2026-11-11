// src/components/HospitalAnswerCard.tsx
// Draws a hospital OPD answer: the title with its Open / Closed badge, the one-line verdict, THE TABLE FIRST, the short points, the pointer (for example the Emergency Department) and the red notes
// (the OPD and card registration hours by the clock). Plain text only (React escapes it); the badge and the verdict are never colour alone: their words carry the meaning.

import React from "react";
import {
  Ambulance,
  Award,
  Building2,
  CalendarCheck,
  GraduationCap,
  Hash,
  HelpCircle,
  Stethoscope,
  User,
  Users,
} from "lucide-react";
import type { HospitalAnswer, HospitalTable } from "@/lib/hospital/types";

const TONE: Record<"open" | "closed" | "unknown" | "info", string> = {
  open: "bg-green-100 text-green-900 border-green-200",
  closed: "bg-red-100 text-red-900 border-red-200",
  unknown: "bg-amber-100 text-amber-900 border-amber-200",
  info: "bg-slate-100 text-slate-800 border-slate-200",
};
/** The headline: the answer itself, large and bold (text-2xl: one step below the first version, text-3xl, which was heavy for a long value such as "DNB(MEDICINE)": owner, 26 Oct 2026). Green Yes, red No, amber when it is not known; a plain value is dark. The words carry the meaning, never the colour alone. */
const HEADLINE: Record<"yes" | "no" | "info" | "unknown", string> = {
  yes: "text-green-600",
  no: "text-red-600",
  info: "text-neutral-900",
  unknown: "text-amber-600",
};
/** Under a Yes or No headline the sentence does not repeat the word. */
const withoutVerdict = (text: string, headline?: { text: string; tone: string }): string =>
  headline && (headline.tone === "yes" || headline.tone === "no")
    ? text.replace(new RegExp(`^${headline.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[:,.]\\s*`, "i"), "") || text // the headline text is escaped: it is data, not a pattern
    : text;

const BADGE: Record<"open" | "closed" | "unknown", string> = {
  open: "bg-green-600 text-white",
  closed: "bg-red-600 text-white",
  unknown: "bg-amber-500 text-white",
};

/** A short cell ("OPD 12", "Unit III", "not recorded", a ticket) is never broken over two lines; a long one (the days, a name with a note) wraps as it needs to. The first column (Unit / OPD / Room) is given a little more room. */
const keepOnOneLine = (cell: string | null | undefined, columnIndex: number): boolean => String(cell ?? "").length <= (columnIndex === 0 ? 24 : 16);

function doctorInitials(name: string): string {
  const clean = name.replace(/^dr\.?\s*/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "DR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Check if a qualification string represents a Postgraduate degree or diploma (MD, MS, DNB, MCh, MRCOG, DGO, etc.) */
function isPostgraduate(qual: string): boolean {
  if (!qual) return false;
  const q = qual.toUpperCase();
  if (/^MBBS$/i.test(q.trim())) return false;
  return (
    /\b(MD|MS|MCH|DM|DNB|DRNB|MRCOG|FRCS|MRCP|DGO|DCH|DMRD|DA|DLO|DPM)\b/i.test(q) ||
    /^(MD|MS|MCH|DM|DNB|DRNB)/i.test(q) ||
    q.includes("MS(") ||
    q.includes("MD(") ||
    q.includes("MCH") ||
    q.includes("DNB(") ||
    q.includes("MRCOG") ||
    q.includes("D.")
  );
}

function columnWidthClass(column: string, totalColumns: number): string {
  const c = column.toLowerCase();
  if (totalColumns === 5) {
    if (c.includes("doctor")) return "w-[27%]";
    if (c.includes("department")) return "w-[17%]";
    if (c.includes("specialization")) return "w-[24%]";
    if (c.includes("qualification")) return "w-[20%]";
    if (c.includes("ticket") || c.includes("list number")) return "w-[12%]";
  }
  if (totalColumns === 4) {
    if (c.includes("doctor")) return "w-[34%]";
    if (c.includes("opd") || c.includes("unit") || c.includes("room")) return "w-[18%]";
    if (c.includes("ticket")) return "w-[18%]";
    if (c.includes("days")) return "w-[30%]";
  }
  if (totalColumns === 3) {
    if (c.includes("doctor")) return "w-[44%]";
    if (c.includes("room") || c.includes("opd") || c.includes("unit")) return "w-[22%]";
    if (c.includes("days") || c.includes("timing") || c.includes("time")) return "w-[34%]";
    return "w-[26%]";
  }
  if (totalColumns === 2) {
    return "w-1/2";
  }
  return "";
}

function ColumnHeaderIcon({ column }: { column: string }) {
  const c = column.toLowerCase();
  if (c.includes("doctor")) return <User className="h-4 w-4 text-blue-600 shrink-0" />;
  if (c.includes("department")) return <Building2 className="h-4 w-4 text-slate-400 shrink-0" />;
  if (c.includes("specialization")) return <Stethoscope className="h-4 w-4 text-indigo-500 shrink-0" />;
  if (c.includes("qualification")) return <GraduationCap className="h-4 w-4 text-purple-600 shrink-0" />;
  if (c.includes("ticket") || c.includes("list number")) return <Hash className="h-4 w-4 text-slate-400 shrink-0" />;
  return null;
}

function renderCell(cell: string, column: string, columnIndex: number) {
  if (!cell) return null;
  const col = (column || "").toLowerCase();
  const low = cell.toLowerCase().trim();

  // 1. Missing data placeholders (soft, low-noise styling)
  if (low === "not recorded" || low === "not recorded yet" || low === "none" || low === "not stated") {
    return <span className="text-xs sm:text-sm font-normal italic text-slate-400">{cell}</span>;
  }
  if (low === "none (mbbs only)") {
    return (
      <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs sm:text-sm font-semibold border border-slate-200 leading-none">
        <span className="translate-y-px">MBBS only</span>
      </span>
    );
  }

  // 2. Doctor Name (or starts with Dr.)
  if (col.includes("doctor") || (columnIndex === 0 && /^dr\.?\s/i.test(cell))) {
    const isDoc = /^dr\.?\s/i.test(cell);
    return (
      <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
        <span className="inline-flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-600 text-white font-bold text-xs sm:text-sm shadow-xs leading-none select-none">
          <span className="translate-y-px">{isDoc ? doctorInitials(cell) : cell.slice(0, 2).toUpperCase()}</span>
        </span>
        <span className="font-bold text-slate-900 text-sm sm:text-base truncate sm:text-wrap leading-snug" title={cell}>
          {cell}
        </span>
      </div>
    );
  }

  // 3. Ticket / List number
  if (col.includes("ticket") || col.includes("list number") || /^[A-Z]?\d{5,7}$/i.test(cell.trim())) {
    return (
      <span className="inline-flex items-center justify-center gap-1 font-mono text-xs sm:text-sm font-bold px-3 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs tabular-nums leading-none">
        <Hash className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="translate-y-px">{cell}</span>
      </span>
    );
  }

  // 4. Qualification: Special symbol & distinct colored chip for Postgraduates (Purple + Cap) vs MBBS (Emerald + Stethoscope)
  if (col.includes("qualification")) {
    if (cell === "—" || cell === "-") {
      return <span className="text-slate-300 font-bold text-base leading-none">—</span>;
    }
    const isPg = isPostgraduate(cell);
    if (isPg) {
      // POSTGRADUATE: Prestigious Purple Chip with GraduationCap!
      return (
        <span
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-900 text-xs sm:text-sm font-bold border border-purple-200/90 shadow-2xs tracking-wide max-w-full leading-none"
          title="Postgraduate Qualification"
        >
          <GraduationCap className="h-4 w-4 text-purple-700 shrink-0" aria-hidden="true" />
          <span className="truncate translate-y-px">{cell}</span>
        </span>
      );
    }
    // GRADUATE (MBBS): Crisp Emerald Chip with Stethoscope!
    return (
      <span
        className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs sm:text-sm font-bold border border-emerald-200/90 shadow-2xs tracking-wide max-w-full leading-none"
        title="Graduate Medical Qualification"
      >
        <Stethoscope className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
        <span className="truncate translate-y-px">{cell}</span>
      </span>
    );
  }

  // 5. Specialization
  if (col.includes("specialization")) {
    return (
      <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-900 text-xs sm:text-sm font-semibold border border-indigo-200 max-w-full leading-none">
        <Stethoscope className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
        <span className="truncate translate-y-px" title={cell}>{cell}</span>
      </span>
    );
  }

  // 6. Department
  if (col.includes("department")) {
    return (
      <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs sm:text-sm font-semibold border border-slate-200 max-w-full leading-none">
        <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="truncate translate-y-px" title={cell}>{cell}</span>
      </span>
    );
  }

  // 7. Unit / Room / Days / Fallback
  if (col.includes("room") || col.includes("opd") || col.includes("unit")) {
    return (
      <span className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-xl bg-amber-50 text-amber-900 text-xs sm:text-sm font-bold border border-amber-200 shadow-2xs leading-none">
        <span className="translate-y-px">{cell}</span>
      </span>
    );
  }

  return (
    <span
      className={
        columnIndex === 0
          ? "font-bold text-slate-900 text-sm sm:text-base leading-normal"
          : "text-slate-800 text-sm sm:text-base font-medium leading-normal"
      }
    >
      {cell}
    </span>
  );
}

function TableView({ table }: { table: HospitalTable }) {
  const isLargeTable = table.rows.length > 8;
  return (
    <div
      className={`omni-noscale overflow-x-auto ${
        isLargeTable ? "max-h-[500px] overflow-y-auto " : ""
      }rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5`}
    >
      <table className="w-full table-fixed text-left text-sm sm:text-base border-collapse">
        <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-700 shadow-2xs">
          <tr>
            {table.columns.map((c, i) => (
              <th
                key={i}
                scope="col"
                className={`whitespace-nowrap px-4 py-3 sm:px-4.5 sm:py-3.5 font-extrabold text-slate-700 tracking-wider text-xs sm:text-sm ${columnWidthClass(c, table.columns.length)}`}
              >
                <div className="flex items-center gap-1.5">
                  <ColumnHeaderIcon column={c} />
                  <span>{c}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {table.rows.map((row, ri) => (
            <tr
              key={ri}
              className="group transition-colors odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/60 align-middle"
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-4 py-3 sm:px-4.5 sm:py-3.5 align-middle ${
                    keepOnOneLine(cell, ci) ? "whitespace-nowrap " : ""
                  }`}
                >
                  {renderCell(cell, table.columns[ci], ci)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.rows.length > 5 ? (
        <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 shadow-xs">
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-blue-600" />
            <span>
              Showing <strong className="text-slate-900 font-bold">{table.rows.length}</strong>{" "}
              {table.rows.length === 1 ? "entry" : "entries"}
            </span>
          </span>
          {isLargeTable ? (
            <span className="text-slate-400 text-xs font-medium">Scroll to view all records</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatStatusSentence(text: string) {
  const parts = text.split(/(\b\d+\b)/);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    /^\d+$/.test(part) ? (
      <span
        key={i}
        className="inline-flex items-center justify-center rounded-xl bg-white px-3 py-1 text-base font-extrabold text-blue-700 border-2 border-blue-400/30 shadow-xs mx-1.5 tabular-nums tracking-wide ring-2 ring-blue-500/10"
      >
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function HospitalAnswerCard({ answer }: { answer: HospitalAnswer }) {
  const suggestion = answer.suggestion ? answer.suggestion.split("\n").filter(Boolean) : [];
  return (
    <div className="space-y-2" data-hospital-answer="true">
      {answer.headline && (
        <p className={`text-2xl font-extrabold leading-tight tracking-tight ${HEADLINE[answer.headline.tone]}`} data-headline={answer.headline.tone}>
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
        answer.status.tone === "info" ? (
          <div
            className="flex items-center gap-3 rounded-2xl border border-blue-200/80 bg-slate-100 bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-slate-100 p-3.5 shadow-xs"
            data-tone="info"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
              <Stethoscope className="h-5 w-5" />
            </div>
            <p className="text-sm sm:text-base font-semibold text-slate-800 flex-1">
              {formatStatusSentence(answer.headline ? withoutVerdict(answer.status.text, answer.headline) : answer.status.text)}
            </p>
          </div>
        ) : (
          <p
            className={`rounded-md border px-2.5 py-1.5 text-sm font-semibold ${TONE[answer.status.tone]}`}
            data-tone={answer.status.tone}
          >
            {formatStatusSentence(answer.headline ? withoutVerdict(answer.status.text, answer.headline) : answer.status.text)}
          </p>
        )
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
        <ul className="list-disc space-y-1.5 pl-5 text-sm sm:text-base text-neutral-800 leading-relaxed" data-points="true">
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

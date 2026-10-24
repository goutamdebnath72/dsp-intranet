"use client";

// The switch that colours ticket numbers by origin (step 44c), and the ticket text that follows it. OFF by default; see src/lib/ui/originTint.ts.

import { Palette } from "lucide-react";
import { originOfTicket } from "@/lib/nl2sql/designationFilter";
import { originClass, originDot, useOriginTint } from "@/lib/ui/originTint";

/** A ticket number; with the tint on, coloured by origin and marked with a dot. Anything that is not an executive ticket stays plain. */
export function TicketText({ ticket, tint }: { ticket: string | null | undefined; tint: boolean }) {
  const t = String(ticket ?? "").trim();
  if (!t) return null;
  const origin = tint ? originOfTicket(t) : "";
  if (!origin) return <>{t}</>;
  return (
    <span className={originClass(origin)}>
      <span aria-hidden="true" className="mr-1 text-[9px] align-middle">
        {originDot(origin)}
      </span>
      {t}
    </span>
  );
}

export function OriginSwitch() {
  const [on, set] = useOriginTint();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => set(!on)}
        title="Colour the ticket numbers by origin (kept in this browser)"
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition-colors ${
          on ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-slate-500 ring-slate-200 hover:text-slate-700"
        }`}
      >
        <Palette size={12} aria-hidden="true" /> Ticket colours
      </button>
      {on && (
        <span className="text-[11px] text-slate-500">
          <span className="text-indigo-700">{"\u25CB"} day 1</span> {"\u00B7"} <span className="text-amber-700">{"\u25CF"} promoted</span>
        </span>
      )}
    </span>
  );
}

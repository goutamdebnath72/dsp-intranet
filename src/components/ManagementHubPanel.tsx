"use client";

// src/components/ManagementHubPanel.tsx
//
// THE MANAGEMENT PAGE, drawn in the answer area of the search bar: the titles of the management tools this person may open, each a button that opens the tool (like the list of calculators). The list comes from the server
// (src/lib/facility/hub.ts) and holds only what the login may use; pressing a title types the tool's own words into the search bar, and the tool checks the person again before it opens.
import React from "react";
import { ArrowRight, CalendarDays, Eye, FileText, Megaphone, Phone, ShieldCheck, Users } from "lucide-react";
import type { ManagementHubOpen, HubTool } from "@/lib/facility/hub";
import type { FacilityKey } from "@/lib/facility/registry";
import { BackButton, CloseButton } from "@/components/tools/toolKit";

const ICON: Record<FacilityKey, React.ReactNode> = {
  employee: <Users size={18} />,
  pax: <Phone size={18} />,
  holiday: <CalendarDays size={18} />,
  circular: <FileText size={18} />,
  announcement: <Megaphone size={18} />,
  access_log: <Eye size={18} />,
};
const TILE: Record<FacilityKey, string> = {
  employee: "bg-gradient-to-br from-blue-600 to-indigo-600",
  pax: "bg-gradient-to-br from-emerald-600 to-teal-600",
  holiday: "bg-gradient-to-br from-amber-500 to-orange-600",
  circular: "bg-gradient-to-br from-sky-600 to-blue-700",
  announcement: "bg-gradient-to-br from-fuchsia-600 to-violet-600",
  access_log: "bg-gradient-to-br from-rose-600 to-red-600",
};

export function ManagementHubPanel({ open, onOpen, onClose }: { open: ManagementHubOpen; onOpen: (phrase: string) => void; onClose: () => void }) {
  const hod = open.role === "hod";
  return (
    <section data-management-hub aria-label="Management pages" className="rounded-3xl border border-slate-200 bg-white/70 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-600 text-white shadow"><ShieldCheck size={18} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold text-slate-900">Management</h3>
          <p className="text-xs text-slate-500">Open a page. {hod ? "As the HOD of C&IT you hold all of them." : "You see only the pages the HOD of C&IT has given you."}</p>
        </div>
        <span data-hub-role={open.role} className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${hod ? "bg-indigo-100 text-indigo-800" : "bg-emerald-100 text-emerald-800"}`}>{hod ? "HOD of C&IT" : "Authorised delegate"}{open.name ? ` · ${open.name}` : ""}</span>
        <CloseButton label="Close the management page" onClick={onClose} />
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {open.tools.map((t: HubTool) => (
          <li key={t.key}>
            <button
              type="button"
              data-hub-tool={t.key}
              onClick={() => onOpen(t.phrase)}
              className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-3.5 py-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-white hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow ${TILE[t.key]}`}>{ICON[t.key]}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-900">{t.label}</span>
                <span className="block text-xs leading-snug text-slate-500">{t.text}</span>
              </span>
              <ArrowRight size={16} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** the Back button above a management tool's page: back to the management page (the same button, on the right as the calculators' pages have) */
export function ManagementBack({ onBack }: { onBack: () => void }) {
  return (
    <div data-management-back className="mb-3 flex justify-end">
      <BackButton label="Back to the management page" onClick={onBack} />
    </div>
  );
}

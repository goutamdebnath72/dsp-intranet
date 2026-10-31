// src/lib/pax/admin/omnibar.ts
//
// THE SEARCH BAR AND THE PAX EDITOR (step 64a). When a sentence means "change the PAX directory" (intent.ts), the omnibar either
//   - opens the editor (a panel in the answer area) for the HOD of C&IT and for an executive he has authorised,
//   - or says plainly why not: nobody is logged in; the person has no authority; a delegate asked to authorise somebody (only the HOD does that).
// The decision uses the LOGIN's ticket (the omnibar's userKey), never anything typed. The sentence is read first (pure); the database is asked only when it IS such a sentence.

import type { AnalyticsPayload } from "@/lib/employees/analytics";
import type { HospitalAnswer } from "@/lib/hospital/types";
import { detectPaxAdminIntent } from "./intent";
import type { Authority } from "./store";

export interface PaxAdminOmnibarDeps {
  authority: (ticket: string) => Promise<Authority | null>;
}

const message = (headline: string, tone: "unknown" | "no", text: string): AnalyticsPayload => {
  const card: HospitalAnswer = { title: "PAX directory", headline: { text: headline, tone }, status: { tone: tone === "no" ? "closed" : "unknown", text } };
  return { kind: "count", answer: text, hospital: card };
};

export async function answerPaxAdmin(typed: string, ticket: string | null, deps: PaxAdminOmnibarDeps): Promise<AnalyticsPayload | null> {
  const intent = detectPaxAdminIntent(typed);
  if (!intent) return null;
  if (!ticket) {
    return message("Please log in", "unknown", "Changing PAX numbers is only for the HOD of C&IT, or an executive he has authorised. Log in with your ticket number, then ask again.");
  }
  const role = await deps.authority(ticket).catch(() => null);
  if (!role) {
    return message("Not allowed", "no", "Only the HOD of C&IT, or an executive he has authorised, can change the PAX directory.");
  }
  if (intent.op === "delegate" && role !== "hod") {
    return message("Not allowed", "no", "Only the HOD of C&IT can authorise an executive, or withdraw the authority of one.");
  }
  return { kind: "count", answer: "The PAX directory editor is open below.", paxAdmin: { op: intent.op, role, ...(intent.prefill ? { prefill: intent.prefill } : {}) } };
}

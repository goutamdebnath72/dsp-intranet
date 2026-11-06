// src/lib/holidays/admin/omnibar.ts
//
// Omnibar responder for Holiday Management.
// Detects holiday admin intent and returns the payload to render the HolidayAdminPanel in the modal.

import type { AnalyticsPayload } from "@/lib/employees/analytics";
import type { HospitalAnswer } from "@/lib/hospital/types";
import { detectHolidayAdminIntent } from "./intent";
import type { Authority } from "@/lib/facility/types";

export interface HolidayAdminOmnibarDeps {
  authority: (ticket: string) => Promise<Authority | null>;
  nameOf?: (ticket: string) => Promise<string | null>;
}

const message = (headline: string, tone: "unknown" | "no", text: string): AnalyticsPayload => {
  const card: HospitalAnswer = {
    title: "Holiday Manager",
    headline: { text: headline, tone },
    status: { tone: tone === "no" ? "closed" : "unknown", text },
  };
  return { kind: "count", answer: text, hospital: card };
};

export async function answerHolidayAdmin(
  typed: string,
  ticket: string | null,
  deps: HolidayAdminOmnibarDeps,
): Promise<AnalyticsPayload | null> {
  const intent = detectHolidayAdminIntent(typed);
  if (!intent) return null;

  if (!ticket) {
    return message(
      "Please log in",
      "unknown",
      "Managing holidays is only for the HOD of C&IT, or an authorised delegate. Please log in with your ticket number first.",
    );
  }

  const [role, name] = await Promise.all([
    deps.authority(ticket).catch(() => null),
    deps.nameOf ? deps.nameOf(ticket).catch(() => null) : Promise.resolve(null),
  ]);

  const who = name && name.trim() ? { name: name.trim() } : {};

  if (!role) {
    return message(
      "Not allowed",
      "no",
      "Only the HOD of C&IT, or an authorised delegate, can manage holidays.",
    );
  }

  if (intent.op === "delegate" && role !== "hod") {
    return message(
      "Not allowed",
      "no",
      "Only the HOD of C&IT can authorise or withdraw delegates for holiday management.",
    );
  }

  return {
    kind: "count",
    answer: "The Holiday Manager is open below.",
    holidayAdmin: {
      op: intent.op,
      role,
      ticket,
      ...who,
      ...(intent.prefill ? { prefill: intent.prefill } : {}),
    },
  } as any;
}

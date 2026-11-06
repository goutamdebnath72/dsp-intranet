// src/lib/accessLog/admin/omnibar.ts
//
// Omnibar responder for Contact Access Log.
// Detects contact access log intent and returns the payload to render AccessLogAdminPanel in the modal.

import type { AnalyticsPayload } from "@/lib/employees/analytics";
import type { HospitalAnswer } from "@/lib/hospital/types";
import { detectAccessLogAdminIntent } from "./intent";
import type { Authority } from "@/lib/facility/types";

export interface AccessLogAdminOmnibarDeps {
  authority: (ticket: string) => Promise<Authority | null>;
  nameOf?: (ticket: string) => Promise<string | null>;
}

const message = (headline: string, tone: "unknown" | "no", text: string): AnalyticsPayload => {
  const card: HospitalAnswer = {
    title: "Contact Access Log",
    headline: { text: headline, tone },
    status: { tone: tone === "no" ? "closed" : "unknown", text },
  };
  return { kind: "count", answer: text, hospital: card };
};

export async function answerAccessLogAdmin(
  typed: string,
  ticket: string | null,
  deps: AccessLogAdminOmnibarDeps,
): Promise<AnalyticsPayload | null> {
  const intent = detectAccessLogAdminIntent(typed);
  if (!intent) return null;

  if (!ticket) {
    return message(
      "Please log in",
      "unknown",
      "Inspecting employee contact access logs is restricted to the HOD of C&IT, or an authorised delegate. Please log in with your ticket number first.",
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
      "Only the HOD of C&IT, or an authorised delegate, can view the contact access log.",
    );
  }

  if (intent.op === "delegate" && role !== "hod") {
    return message(
      "Not allowed",
      "no",
      "Only the HOD of C&IT can authorise or withdraw delegates for contact access logging.",
    );
  }

  return {
    kind: "count",
    answer: "The Contact Access Log is open below.",
    accessLogAdmin: {
      op: intent.op,
      role,
      ticket,
      ...who,
      ...(intent.prefill ? { prefill: intent.prefill } : {}),
    },
  } as any;
}

// src/lib/accessLog/admin/intent.ts
//
// Omnibar intent detection for Contact Access Log facility.
// Recognizes requests from authorised users to inspect or manage contact access logs.

import type { AccessLogAdminOp } from "./types";

export interface AccessLogAdminIntent {
  op: AccessLogAdminOp;
  prefill?: {
    viewer?: string;
    viewed?: string;
    field?: "mobile" | "email";
    action?: "reveal" | "copy";
  };
}

// Phrases specifically indicating Contact Access Log facility
const EXACT_PHRASES = [
  "contact access log",
  "contact access logs",
  "contact access log management",
  "contact access log admin",
  "contact access log manager",
  "contact access management",
  "contact access admin",
  "contact access manager",
  "access log",
  "access logs",
  "access log management",
  "access log admin",
  "access log manager",
  "contact log",
  "contact logs",
  "contact log management",
  "contact log admin",
  "contact log manager",
  "contact privacy audit",
  "contact reveal log",
  "contact reveal logs",
  "contact copy log",
  "contact copy logs",
  "view access log",
  "view access logs",
  "show access log",
  "open access log",
  "audit contact access",
  "who viewed contacts",
  "who accessed contacts",
];

const ACCESS_LOG_CUE = /\b(?:contact\s+access\s+logs?|contact\s+logs?|access\s+logs?|contact\s+reveals?|contact\s+cop(?:y|ies))\b/i;
const ADMIN_WORDS = /\b(?:manage|management|manager|admin|administration|dashboard|view|viewing|audit|auditing|inspect|inspection|history|delegate|delegating|authorise|authorize|privilege|permission|access|revoke|withdraw)\b/i;

export function detectAccessLogAdminIntent(typed: string): AccessLogAdminIntent | null {
  const norm = typed.toLowerCase().trim().replace(/\s+/g, " ");
  if (!norm) return null;

  // Direct exact phrase or start-with matching
  const hasExact = EXACT_PHRASES.some((phrase) => norm === phrase || norm.startsWith(phrase + " "));

  if (!hasExact) {
    // Both CUE and an administration/audit keyword must be present
    if (!ACCESS_LOG_CUE.test(norm) || !ADMIN_WORDS.test(norm)) {
      return null;
    }
  }

  // Pure unrelated questions should not trigger
  if (
    /^(?:what\s+is|where\s+is|how\s+to\s+login|network\s+access|gate\s+access|vpn\s+access)\b/i.test(norm)
  ) {
    return null;
  }

  let op: AccessLogAdminOp = "logs";

  if (/\b(?:delegate|authorise|authorize|grant|revoke|withdraw|permission|privilege)\b/i.test(norm)) {
    op = "delegate";
  } else if (/\b(?:history|audit\s+trail)\b/i.test(norm)) {
    op = "history";
  } else {
    op = "logs";
  }

  // Prefill detection if viewer or viewed was mentioned
  let viewer: string | undefined;
  let viewed: string | undefined;

  const viewerMatch = /\b(?:by|viewer)\s+([a-z0-9]+)\b/i.exec(norm);
  if (viewerMatch) viewer = viewerMatch[1];

  const viewedMatch = /\b(?:of|for|viewed)\s+([a-z0-9]+)\b/i.exec(norm);
  if (viewedMatch && !["all", "mobile", "email", "logs", "management", "admin"].includes(viewedMatch[1])) {
    viewed = viewedMatch[1];
  }

  let field: "mobile" | "email" | undefined;
  if (/\bmobile\b/i.test(norm)) field = "mobile";
  else if (/\bemail\b/i.test(norm)) field = "email";

  let action: "reveal" | "copy" | undefined;
  if (/\b(?:reveal|revealed|reveals)\b/i.test(norm)) action = "reveal";
  else if (/\b(?:copy|copied|copies)\b/i.test(norm)) action = "copy";

  const prefill = viewer || viewed || field || action ? { viewer, viewed, field, action } : undefined;

  return { op, prefill };
}

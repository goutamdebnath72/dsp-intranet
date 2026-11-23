// src/lib/accessLog/admin/intent.ts
//
// Omnibar intent detection for the Contact Access Log facility.
// It recognises requests from authorised users to inspect or manage contact access logs.

import type { AccessLogAdminOp, AccessLogField } from "./types";

export interface AccessLogAdminIntent {
  op: AccessLogAdminOp;
  prefill?: {
    viewer?: string;
    viewed?: string;
    field?: AccessLogField;
    action?: "reveal" | "copy";
  };
}

// Phrases that point specifically to the Contact Access Log facility
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

  // I match a direct exact phrase, or a phrase the text starts with
  const hasExact = EXACT_PHRASES.some((phrase) => norm === phrase || norm.startsWith(phrase + " "));

  if (!hasExact) {
    // I need both the CUE and an administration/audit keyword to be present
    if (!ACCESS_LOG_CUE.test(norm) || !ADMIN_WORDS.test(norm)) {
      return null;
    }
  }

  // Purely unrelated questions must not trigger this
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

  // I detect a prefill if a viewer or a viewed person was mentioned
  let viewer: string | undefined;
  let viewed: string | undefined;

  const viewerMatch = /\b(?:by|viewer)\s+([a-z0-9]+)\b/i.exec(norm);
  if (viewerMatch) viewer = viewerMatch[1];

  const viewedMatch = /\b(?:of|for|viewed)\s+([a-z0-9]+)\b/i.exec(norm);
  if (viewedMatch && !["all", "mobile", "email", "ticket", "pno", "logs", "management", "admin"].includes(viewedMatch[1])) {
    viewed = viewedMatch[1];
  }

  let field: AccessLogField | undefined;
  if (/\bmobile\b/i.test(norm)) field = "mobile";
  else if (/\bemail\b/i.test(norm)) field = "email";
  else if (/\b(?:p\.?\s?no|pno|personal\s+(?:no|number)|sail\s+p\.?\s?no)\b/i.test(norm)) field = "sailpno";
  else if (/\bticket\s+(?:numbers?|nos?\.?|reveals?|lookups?)\b/i.test(norm)) field = "ticket";

  let action: "reveal" | "copy" | undefined;
  if (/\b(?:reveal|revealed|reveals)\b/i.test(norm)) action = "reveal";
  else if (/\b(?:copy|copied|copies)\b/i.test(norm)) action = "copy";

  const prefill = viewer || viewed || field || action ? { viewer, viewed, field, action } : undefined;

  return { op, prefill };
}

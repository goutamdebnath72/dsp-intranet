// src/lib/circulars/admin/intent.ts
//
// Omnibar intent detection for Circular Management facility.
// Identifies when an authorised user wants to post, upload, manage, or delegate circular tools.

import type { CircularAdminOp } from "./types";

export interface CircularAdminIntent {
  op: CircularAdminOp;
  prefill?: { headline?: string };
}

const CUE = /\b(?:circulars?|circular's|office\s+orders?|memorandums?)\b/i;
const ADMIN_WORDS = /\b(?:manage|management|manager|admin|administration|dashboard|post|posting|upload|uploading|publish|publishing|add|new|recent|delegate|delegating|authorise|authorize|privilege|permission|access|revoke|withdraw|history|audit)\b/i;

export function detectCircularAdminIntent(typed: string): CircularAdminIntent | null {
  const norm = typed.toLowerCase().trim();
  if (!norm) return null;

  // Must mention circular and an administrative action word
  if (!CUE.test(norm) || !ADMIN_WORDS.test(norm)) {
    // Also catch direct phrases like "circular admin", "manage circulars", "circular management", "post circular"
    if (!/\bcirculars?\s+(?:admin|manager|management|dashboard|upload|post)\b/i.test(norm)) {
      return null;
    }
  }

  // Pure questions about circular content ("what is the circular on pf", "how to apply under circular 12") are NOT admin intents
  if (/^(?:what|which|where|when|how\s+to|tell\s+me|show|display|find|search|list\s+all)\b/i.test(norm) &&
      !/^(?:how\s+to\s+(?:upload|post|publish)|where\s+to\s+(?:upload|post))\b/i.test(norm)) {
    return null;
  }

  let op: CircularAdminOp = "upload";

  if (/\b(?:delegate|authorise|authorize|grant|revoke|withdraw|permission|privilege|access)\b/i.test(norm)) {
    op = "delegate";
  } else if (/\b(?:history|audit|log)\b/i.test(norm)) {
    op = "history";
  } else if (/\b(?:recent|list\s+circulars|all\s+circulars)\b/i.test(norm)) {
    op = "recent";
  } else {
    op = "upload";
  }

  // Check if headline was suggested in quotes from original typed string to preserve casing: post circular "Festival Advance Scheme 2026"
  const quoted = /"([^"]+)"|'([^']+)'/.exec(typed);
  const headline = quoted ? (quoted[1] || quoted[2]).trim() : undefined;

  return {
    op,
    prefill: headline ? { headline } : undefined,
  };
}

// src/lib/holidays/admin/intent.ts
//
// Omnibar intent detection for Holiday Management facility.
// Identifies when an authorised user wants to manage, seed, clear, review, or delegate holiday tools.

import type { HolidayAdminOp } from "./types";

export interface HolidayAdminIntent {
  op: HolidayAdminOp;
  prefill?: { year?: number };
}

const CUE = /\b(?:holidays?|holiday's|rh\b|restricted\s+holidays?|festival\s+holidays?)\b/i;
const ADMIN_WORDS = /\b(?:manage|management|manager|admin|administration|dashboard|seed|seeding|unseed|unseeding|upload|uploading|clear|clearing|erase|delete|staging|extractions?|review|delegate|delegating|authorise|authorize|privilege|permission|access|revoke|history|audit)\b/i;

const YEAR_RE = /\b(202\d|203\d)\b/;

export function detectHolidayAdminIntent(typed: string): HolidayAdminIntent | null {
  const norm = typed.toLowerCase().trim();
  if (!norm) return null;

  // Must mention holiday and an administrative action word
  if (!CUE.test(norm) || !ADMIN_WORDS.test(norm)) {
    // Also catch direct phrases like "holiday admin", "holidays admin", "manage holidays", "holiday manager"
    if (!/\bholidays?\s+(?:admin|manager|management|dashboard)\b/i.test(norm)) {
      return null;
    }
  }

  // Pure questions about calendar dates ("is tomorrow a holiday", "when is durga puja") are NOT admin intents
  if (/^(?:when\s+is|is\s+today|is\s+tomorrow|list\s+of\s+holidays\s+in|how\s+many\s+holidays|upcoming\s+holidays)/i.test(norm) && !ADMIN_WORDS.test(norm)) {
    return null;
  }

  const yearMatch = norm.match(YEAR_RE);
  const year = yearMatch ? Number(yearMatch[1]) : undefined;

  let op: HolidayAdminOp = "seed";

  if (/\b(?:clear|unseed|erase|remove\s+year|delete\s+year)\b/i.test(norm)) {
    op = "clear";
  } else if (/\b(?:staging|extraction|review)\b/i.test(norm)) {
    op = "staging";
  } else if (/\b(?:delegate|authorise|authorize|grant|revoke|withdraw|permission|privilege|access)\b/i.test(norm)) {
    op = "delegate";
  } else if (/\b(?:history|audit|log)\b/i.test(norm)) {
    op = "history";
  } else {
    op = "seed";
  }

  return {
    op,
    prefill: year ? { year } : undefined,
  };
}

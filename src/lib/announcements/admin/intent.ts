// src/lib/announcements/admin/intent.ts
//
// Omnibar intent detection for Announcement Management facility.
// Identifies when an authorised user wants to post, publish, manage, or delegate announcements.

import type { AnnouncementAdminOp } from "./types";

export interface AnnouncementAdminIntent {
  op: AnnouncementAdminOp;
  prefill?: { title?: string; editId?: number };
}

const CUE = /\b(?:announcements?|announcement's|notices?|bulletins?)\b/i;
const ADMIN_WORDS = /\b(?:manage|management|manager|admin|administration|dashboard|post|posting|publish|publishing|add|new|create|creating|recent|delegate|delegating|authorise|authorize|privilege|permission|access|revoke|withdraw|history|audit|edit|update|delete|remove)\b/i;

export function detectAnnouncementAdminIntent(typed: string): AnnouncementAdminIntent | null {
  const norm = typed.toLowerCase().trim();
  if (!norm) return null;

  // Must mention announcement / notice and an administrative action word
  if (!CUE.test(norm) || !ADMIN_WORDS.test(norm)) {
    // Also catch direct phrases like "announcement admin", "announcement management", "manage announcements", "post announcement"
    if (!/\bannouncements?\s+(?:admin|manager|management|dashboard|post|publish)\b/i.test(norm)) {
      return null;
    }
  }

  // Pure questions about announcement content ("what is the announcement on bonus", "show today's announcements") are NOT admin intents
  if (
    /^(?:what|which|where|when|tell\s+me|show|display|find|search|is\s+there\s+any|any\s+new|list\s+all)\b/i.test(norm) &&
    !/^(?:how\s+to\s+(?:post|publish|add)|where\s+to\s+(?:post|publish))\b/i.test(norm)
  ) {
    return null;
  }

  let op: AnnouncementAdminOp = "publish";

  if (/\b(?:delegate|authorise|authorize|grant|revoke|withdraw|permission|privilege|access)\b/i.test(norm)) {
    op = "delegate";
  } else if (/\b(?:history|audit|log)\b/i.test(norm)) {
    op = "history";
  } else if (/\b(?:recent|list\s+announcements|all\s+announcements)\b/i.test(norm)) {
    op = "recent";
  } else {
    op = "publish";
  }

  // Check if headline was suggested in quotes: post announcement "Safety Day Celebrations"
  const quoted = /"([^"]+)"|'([^']+)'/.exec(typed);
  const title = quoted ? (quoted[1] || quoted[2]).trim() : undefined;

  // Check if an announcement id was mentioned: edit announcement 12
  const idMatch = /\b(?:announcement|notice)\s+#?(\d+)\b/i.exec(norm);
  const editId = idMatch ? Number(idMatch[1]) : undefined;

  return {
    op,
    prefill: title || editId ? { title, editId } : undefined,
  };
}

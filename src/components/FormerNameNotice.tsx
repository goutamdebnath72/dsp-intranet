// src/components/FormerNameNotice.tsx
// The line that stands above the answer when the question used a FORMER name of a department (step 59a): "CHRD" is now called Centre for L & D (CL&D).
// Plain text only (React escapes it). It is not an answer and not a warning: a quiet note that the name was understood and what the department is called now.

import React from "react";
import { History } from "lucide-react";
import type { FormerNameNotice as Notice } from "@/lib/search/formerNames";

export function FormerNameNotice({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <div role="note" data-former-name="true" className="mx-2 mt-2 flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900">
      <History size={16} aria-hidden className="mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold" data-former-sentence="true">{notice.sentence}</p>
        <p className="text-xs text-sky-800" data-former-history="true">{notice.history}</p>
      </div>
    </div>
  );
}

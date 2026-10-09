"use client";

import { Sparkles } from "lucide-react";
import type { LoginHint } from "@/lib/search/loginHints";

/** A slim, text-only suggestion bar shown above the results. See lib/search/loginHints.ts for when. */
export function OmniLoginHint({ hint }: { hint: LoginHint }) {
  return (
    <div
      role="note"
      className="mx-2 mb-1 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
    >
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
      <span className="flex-1 leading-snug">{hint.text}</span>
    </div>
  );
}

"use client";

import { Sparkles } from "lucide-react";
import type { LoginHint } from "@/lib/search/loginHints";

/** A slim suggestion bar shown above the results. See lib/search/loginHints.ts for when. An "eds-signin" hint also carries a Sign in button (it opens the sign-in window). */
export function OmniLoginHint({ hint, onSignIn }: { hint: LoginHint; onSignIn?: () => void }) {
  return (
    <div
      role="note"
      className="mx-2 mb-1 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
    >
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
      <span className="flex-1 leading-snug">{hint.text}</span>
      {hint.action === "signin" && onSignIn && (
        <button
          type="button"
          onClick={onSignIn}
          className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100"
        >
          Sign in
        </button>
      )}
    </div>
  );
}

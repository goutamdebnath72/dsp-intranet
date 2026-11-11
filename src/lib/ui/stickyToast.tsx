// src/lib/ui/stickyToast.tsx
"use client";
//
// A success toast that STAYS until the person closes it with its cross (✕) button. The library's default success toast disappears by itself after about
// 2 seconds, too briefly to read what an upload did (or to notice it at all while looking at the upload window closing). It looks the same as the other
// toasts (same box, same position, same Toaster settings); it only has no timer, and has the close button. The button is pulled 12 px into the toast's own side padding
// (-mr-3) so it sits evenly in its corner, as far from the right edge as the first character is from the left one.

import toast from "react-hot-toast";
import { X } from "lucide-react";

export function stickySuccess(message: string): string {
  return toast.success(
    (t) => (
      <span className="flex items-center gap-3">
        <span>{message}</span>
        <button
          type="button"
          onClick={() => toast.dismiss(t.id)}
          aria-label="Close this message"
          title="Close"
          className="-mr-3 ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        >
          <X size={14} strokeWidth={2.5} aria-hidden />
        </button>
      </span>
    ),
    { duration: Infinity },
  );
}

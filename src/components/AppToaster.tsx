"use client";

// src/components/AppToaster.tsx
//
// The ONE place where toast messages appear (mounted once in the root layout), top-centre of the screen, above the search modal.
// Success toasts carry their own tick in the message text ("✅ ..."), so the library's built-in success icon is switched off for a single consistent look.
// A message that must stay until it is read (an upload that finished at the back end) uses stickySuccess() from "@/lib/ui/stickyToast": it has no timer and a close (✕) button.
import { Toaster } from "react-hot-toast";

export default function AppToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        style: { whiteSpace: "nowrap", maxWidth: "none" },
        success: { icon: null },
      }}
    />
  );
}

"use client";

import { useEffect } from "react";
import { useSession, signOut } from "next-auth/react";

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();

  useEffect(() => {
    // If the user is authenticated but the session marker is missing
    // in sessionStorage (e.g., after tab close/crash), force logout.
    if (status === "authenticated") {
      const activeMarker = sessionStorage.getItem("is_session_active");
      if (!activeMarker) {
        signOut({ callbackUrl: "/" });
      }
    }
  }, [status]);

  // ✅ This is the critical part: you must return the children here
  return <>{children}</>;
}

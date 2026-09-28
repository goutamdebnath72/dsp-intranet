"use client";

// This is the SINGLE, authoritative gate between next-auth's raw session
// state and every part of the app that needs to know "is the user really
// logged in, right now, in this tab."
//
// Why this exists: next-auth's own session cookie is (by design, for its
// own token-validity purposes) a normal persistent cookie -- it survives a
// full browser close, not just a tab close. This app additionally wants a
// tab-scoped "log out when the tab/browser is closed" behaviour, tracked via
// a sessionStorage marker (which the browser genuinely does clear on tab
// close). The problem: on a freshly (re)opened tab with a still-valid
// leftover cookie, next-auth's useSession() legitimately resolves to
// "authenticated" BEFORE anything has had a chance to check the
// sessionStorage marker -- and if every component that cares about login
// state calls useSession() directly, each one independently renders that
// stale "authenticated" flash for itself, however briefly. Patching each
// component after the fact (hide the notification faster, hide the name
// faster) doesn't fix the race, it just narrows the window per-component and
// leaves it open for every future one.
//
// The fix is architectural: NOTHING in the app is allowed to read raw
// next-auth session state to decide what to show. Everything goes through
// useVerifiedSession() below, which only ever reports "authenticated" once
// the tab-liveness marker has actually been checked -- so the stale flash
// is never exposed anywhere, now or for any component added later.

import { createContext, useContext, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import type { Session } from "next-auth";

/** The single source of truth for the tab-liveness marker's key name.
 *  Anything that needs to mark "a real login just happened in this tab"
 *  should call markTabSessionActive() below, not touch sessionStorage
 *  directly, so this key never has to be duplicated/re-typed elsewhere. */
const TAB_MARKER_KEY = "is_session_active";

export function markTabSessionActive() {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(TAB_MARKER_KEY, "true");
  }
}

type VerifiedSessionValue =
  | { data: Session; status: "authenticated" }
  | { data: null; status: "unauthenticated" | "loading" };

const VerifiedSessionContext = createContext<VerifiedSessionValue>({
  data: null,
  status: "loading",
});

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: rawSession, status: rawStatus } = useSession();
  const [verified, setVerified] = useState<VerifiedSessionValue>({
    data: null,
    status: "loading",
  });

  useEffect(() => {
    if (rawStatus === "loading") {
      setVerified({ data: null, status: "loading" });
      return;
    }

    if (rawStatus === "unauthenticated") {
      setVerified({ data: null, status: "unauthenticated" });
      return;
    }

    // rawStatus === "authenticated" from here on -- this is exactly the
    // moment that used to be trusted blindly. Verify it against this tab's
    // own liveness marker before ever exposing it downstream.
    const tabIsLive =
      typeof window !== "undefined" &&
      sessionStorage.getItem(TAB_MARKER_KEY) === "true";

    if (tabIsLive && rawSession) {
      setVerified({ data: rawSession, status: "authenticated" });
    } else {
      // A leftover, still-valid cookie from before this tab was opened (or
      // reopened after being closed). Never let "authenticated" reach any
      // consumer for this -- report unauthenticated immediately and clear
      // the stale cookie in the background. No component ever sees the
      // in-between state, so there is nothing left to flash.
      setVerified({ data: null, status: "unauthenticated" });
      signOut({ redirect: false });
    }
  }, [rawStatus, rawSession]);

  return (
    <VerifiedSessionContext.Provider value={verified}>
      {children}
    </VerifiedSessionContext.Provider>
  );
}

/** Every component that needs to know "is this user really logged in right
 *  now" must use this hook -- never next-auth's useSession() directly --
 *  so the stale-cookie flash described above can never leak into any UI. */
export function useVerifiedSession() {
  return useContext(VerifiedSessionContext);
}

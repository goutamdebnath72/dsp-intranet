// src/components/HolidayNotificationToast.tsx
//
// Mounted once, in TopBar (present on every authenticated page). Runs once
// per browser session (sessionStorage-gated) rather than on every route
// navigation -- "at every fresh login" is interpreted as "once per new
// session," not "every single page you click to." A genuinely new login
// (new session) always re-triggers this, since sessionStorage doesn't
// survive that.
//
// The suppress/should-show DECISION is made server-side (see the GET
// handler in api/holiday-notifications/route.ts) -- this component only
// decides whether it's ALREADY checked this session, never whether it's
// "allowed" to show something the server said not to.

"use client";

import { useEffect, useState } from "react";
import { useVerifiedSession } from "@/components/SessionGuard";
import { X, Bell, BellOff } from "lucide-react";

// Keyed per-user, not just per-tab: on a shared terminal, User A logging
// out and User B logging into the SAME tab right after must still get
// checked fresh -- a flag scoped only to the tab would otherwise silently
// swallow User B's own notification because User A already "used up" the
// tab-wide flag.
const SESSION_FLAG_PREFIX = "holidayNotifCheckedThisSession:";

interface UpcomingHoliday {
  date: string;
  name: string;
}

interface StatusResponse {
  registered: boolean;
  suppressAfterFirstView: boolean;
  shouldShowNotification: boolean;
  upcoming: UpcomingHoliday[];
  error?: string;
}

type ToastState =
  | { view: "hidden" }
  | { view: "registerPrompt" }
  | { view: "notification"; upcoming: UpcomingHoliday[]; suppressAfterFirstView: boolean };

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function HolidayNotificationToast() {
  const { status: sessionStatus, data: session } = useVerifiedSession();
  const userId = (session?.user as any)?.id as string | undefined;
  const [state, setState] = useState<ToastState>({ view: "hidden" });
  const [suppressChoice, setSuppressChoice] = useState(false); // registration-time checkbox
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Verified session status: this can only ever be "authenticated" once
    // SessionGuard has confirmed it against this tab's own liveness marker,
    // so there is no leftover-cookie flash left to worry about here.
    if (sessionStatus !== "authenticated" || !userId) return;
    if (typeof window === "undefined") return;
    const sessionFlagKey = SESSION_FLAG_PREFIX + userId;
    if (sessionStorage.getItem(sessionFlagKey) === "1") return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/holiday-notifications");
        if (!res.ok) return;
        const data: StatusResponse = await res.json();
        if (cancelled) return;
        sessionStorage.setItem(sessionFlagKey, "1");

        if (!data.registered) {
          setState({ view: "registerPrompt" });
        } else if (data.shouldShowNotification && data.upcoming.length > 0) {
          setState({
            view: "notification",
            upcoming: data.upcoming,
            suppressAfterFirstView: data.suppressAfterFirstView,
          });
          // If this showing is the ONE allowed showing (suppress mode),
          // tell the server it's been seen so it won't show again on the
          // next login until re-enabled.
          if (data.suppressAfterFirstView) {
            fetch("/api/holiday-notifications", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ markSeen: true }),
            }).catch(() => {});
          }
        }
        // registered && !shouldShowNotification -- correctly suppressed,
        // stay hidden.
      } catch {
        /* best-effort; a failed check should never block the page */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionStatus, userId]);

  if (state.view === "hidden") return null;

  const dismiss = () => setState({ view: "hidden" });

  async function register(subscribe: boolean) {
    if (!subscribe) {
      dismiss();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/holiday-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suppressAfterFirstView: suppressChoice }),
      });
      if (res.ok) {
        const statusRes = await fetch("/api/holiday-notifications");
        const data: StatusResponse = await statusRes.json();
        if (data.upcoming.length > 0) {
          setState({
            view: "notification",
            upcoming: data.upcoming,
            suppressAfterFirstView: data.suppressAfterFirstView,
          });
          if (data.suppressAfterFirstView) {
            fetch("/api/holiday-notifications", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ markSeen: true }),
            }).catch(() => {});
          }
          return;
        }
      }
      dismiss();
    } finally {
      setBusy(false);
    }
  }

  async function toggleSuppress(next: boolean) {
    setBusy(true);
    try {
      await fetch("/api/holiday-notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suppressAfterFirstView: next }),
      });
      if (state.view === "notification") {
        setState({ ...state, suppressAfterFirstView: next });
      }
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      await fetch("/api/holiday-notifications", { method: "DELETE" });
    } finally {
      setBusy(false);
      dismiss();
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[9999] w-80 max-w-[calc(100vw-2.5rem)] animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-xl border border-neutral-200 bg-white shadow-lg">
        {state.view === "registerPrompt" && (
          <div className="p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-blue-600" />
                <h4 className="text-sm font-semibold text-neutral-800">
                  Show upcoming holidays at login?
                </h4>
              </div>
              <button
                onClick={dismiss}
                className="text-neutral-400 hover:text-neutral-600"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-3 text-xs text-neutral-500">
              We can remind you of upcoming holidays each time you log in.
            </p>
            <label className="mb-3 flex items-center gap-2 text-xs text-neutral-600">
              <input
                type="checkbox"
                checked={suppressChoice}
                onChange={(e) => setSuppressChoice(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Only show me this once (not every login)
            </label>
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => register(true)}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Subscribe
              </button>
              <button
                disabled={busy}
                onClick={() => register(false)}
                className="flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
              >
                No thanks
              </button>
            </div>
          </div>
        )}

        {state.view === "notification" && (
          <div className="p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-blue-600" />
                <h4 className="text-sm font-semibold text-neutral-800">
                  Upcoming holidays
                </h4>
              </div>
              <button
                onClick={dismiss}
                className="text-neutral-400 hover:text-neutral-600"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
            <ul className="mb-3 space-y-1">
              {state.upcoming.map((h) => (
                <li key={`${h.date}-${h.name}`} className="flex justify-between text-xs text-neutral-700">
                  <span className="truncate pr-2">{h.name}</span>
                  <span className="flex-shrink-0 font-medium text-neutral-500">
                    {formatDate(h.date)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-neutral-100 pt-2">
              <button
                disabled={busy}
                onClick={() => toggleSuppress(!state.suppressAfterFirstView)}
                className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
                title={
                  state.suppressAfterFirstView
                    ? "Currently: only shown once. Click to show every login."
                    : "Currently: shown every login. Click to only show once."
                }
              >
                {state.suppressAfterFirstView ? <BellOff size={12} /> : <Bell size={12} />}
                {state.suppressAfterFirstView ? "Show every login" : "Show only once"}
              </button>
              <button
                disabled={busy}
                onClick={unsubscribe}
                className="text-[11px] font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                Unsubscribe
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

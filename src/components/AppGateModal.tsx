// src/components/AppGateModal.tsx
"use client";

// THE DOOR OF THE APPLICATION BUTTONS (ESS and IMS) on the home page. Pressing one calls openAppGate("ess") or openAppGate("ims"), and what happens depends on who is pressing:
//   - NOT signed in to the intranet: the application's own sign-in page opens in a NEW tab (nothing else is needed: it asks for the ticket number and password there);
//   - signed in to the intranet: this password window opens, showing the person's own name and ticket, and asks ONLY for the password. The password is sent to the application (POST <APP>/api/gate), which checks it with its own rules.
//     Only when it is right does the application answer with a one-time code, and then a NEW tab opens at the application and hands the code over (POST <APP>/enter), which lands on its home page.
// When the password is wrong, or the application cannot be reached, NO tab opens and the reason is shown here. Both applications speak the same two-step contract, so one window serves both.
//
// How it opens: any code calls openAppGate(app) (the buttons in QuickAccessBar do); the window listens for that event, so no provider needs adding.
// The password is checked FIRST and the new tab opens only after the application has said yes, so a wrong password never flashes a blank tab. A browser lets a page open a tab for a few seconds after a click, which is enough for the check;
// if the check was slower than that (the first try after an application starts can be) and the browser refuses the tab, the window says the password is right and the next press of the button opens the tab. Each try uses a tab name of its own.
// The addresses come from NEXT_PUBLIC_ESS_URL (http://localhost:3001 in development when it is not set; in production it must be set) and NEXT_PUBLIC_IMS_URL (http://localhost:3002 in development; in production the live IMS address when it is not set).
// This intranet window never sees an application's session: the code is posted straight from the browser to the application in a form, so it is in no address and no history.

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, X } from "lucide-react";
import { AnimatedInput } from "./AnimatedInput";

const OPEN_EVENT = "app-gate:open";
const dev = process.env.NODE_ENV !== "production";
const trim = (url: string) => url.replace(/\/+$/, "");

/** The applications behind the buttons. The addresses are written out as process.env.NEXT_PUBLIC_... so Next can put them into the page. */
export type AppKey = "ess" | "ims";
const APPS: Record<AppKey, { label: string; url: string }> = {
  ess: { label: "ESS", url: trim(process.env.NEXT_PUBLIC_ESS_URL ?? (dev ? "http://localhost:3001" : "")) },
  ims: { label: "IMS", url: trim(process.env.NEXT_PUBLIC_IMS_URL ?? (dev ? "http://localhost:3002" : "https://ims-revamp.vercel.app")) },
};

/** Opens the password window of one application (called by its button). */
export function openAppGate(app: AppKey) {
  window.dispatchEvent(new CustomEvent<AppKey>(OPEN_EVENT, { detail: app }));
}

/** Posts the one-time code to the application in the new tab, as a form, so the code is never in an address. */
function postCode(url: string, code: string, tabName: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${url}/enter`;
  form.target = tabName;
  const field = document.createElement("input");
  field.type = "hidden";
  field.name = "code";
  field.value = code;
  form.appendChild(field);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

/** Opens a new tab and posts the one-time code into it; false when the browser refused the tab. */
function openAppTab(url: string, code: string): boolean {
  const tabName = `app-${crypto.randomUUID()}`;
  const tab = window.open("", tabName);
  if (!tab) return false;
  postCode(url, code, tabName);
  return true;
}

export default function AppGateModal() {
  const { data: session, status } = useSession();
  const signedTicket = (session?.user as { ticketNo?: string | number } | undefined)?.ticketNo;
  const signedName = session?.user?.name ?? "";
  const signedIn = status === "authenticated" && signedTicket !== undefined && String(signedTicket).trim() !== "";

  const [app, setApp] = useState<AppKey | null>(null); // which application's window is open (null: none)
  const open = app !== null;
  const target = APPS[app ?? "ess"];
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingCode, setPendingCode] = useState(""); // a code the application has issued but the browser would not open a tab for; the next press of the button uses it

  useEffect(() => {
    const onOpen = (e: Event) => {
      const key = (e as CustomEvent<AppKey>).detail;
      if (!APPS[key]) return;
      if (!signedIn) {
        // not signed in: the application's own sign-in page, in a new tab. This runs inside the click, so the browser allows the tab.
        if (APPS[key].url) window.open(`${APPS[key].url}/login`, "_blank", "noopener");
        return;
      }
      setPassword(""); setError(""); setBusy(false); setPendingCode(""); setApp(key);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setApp(null); };
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener(OPEN_EVENT, onOpen); window.removeEventListener("keydown", onKey); };
  }, [signedIn]);

  async function submit() {
    if (busy) return;
    const ticket = String(signedTicket ?? "").trim();
    if (!ticket) return;

    // The password was right earlier but the browser refused the tab; this press is a fresh click, so the tab is allowed now.
    if (pendingCode) {
      if (openAppTab(target.url, pendingCode)) { setPendingCode(""); setApp(null); }
      else setError("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
      return;
    }

    if (!password) { setError("Please enter your password."); return; }
    if (!target.url) { setError(`The ${target.label} address is not set up yet.`); return; }

    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${target.url}/api/gate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticketNo: ticket, password }) });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
      if (res.ok && data?.ok && data.code) {
        if (openAppTab(target.url, data.code)) {
          setApp(null);
        } else {
          setPendingCode(data.code);
          setError(`Password is right. Press Open ${target.label} again.`);
        }
        return;
      }
      setPassword("");
      setError(res.status === 429 ? "Too many tries. Please wait a minute." : res.status === 403 ? `You do not have access to ${target.label}.` : res.status >= 500 ? `${target.label} cannot check passwords right now.` : "Wrong password.");
    } catch {
      setError(`${target.label} cannot be reached right now.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setApp(null)}
        >
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative w-full max-w-sm rounded-lg bg-white shadow-2xl overflow-hidden min-h-[370px] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setApp(null)} className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-800 transition-colors z-20" aria-label="Close">
              <X size={24} />
            </button>
            <div className="flex flex-col flex-grow p-8">
              <div>
                <h2 className="mb-2 text-2xl font-bold font-heading text-neutral-800">Open {target.label}</h2>
                <p className={`h-5 text-sm ${pendingCode ? "text-green-700" : "text-red-600"}`}>{error || " "}</p>
              </div>
              <div className="my-auto space-y-8">
                {signedName && <p className="text-sm font-semibold text-neutral-700">{signedName}</p>}
                <AnimatedInput id="essTicketDisplay" label="Ticket Number" value={String(signedTicket)} disabled={true} />
                <AnimatedInput
                  id="essPassword"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
                  autoFocus
                />
                <p className="-mt-5 text-xs text-neutral-500">{target.label} opens in a new tab after your password is checked.</p>
              </div>
              <div className="mt-auto flex flex-col items-center">
                <button onClick={() => void submit()} disabled={busy} className="flex flex-col items-center text-neutral-600 hover:text-primary-600 transition-colors disabled:opacity-50">
                  <span className="font-semibold text-lg">Open {target.label}</span>
                  {/* The arrow under the label is the same as the "Next" button of the login window; while the password is being checked it turns into a spinner of the same size, so nothing jumps. */}
                  {busy ? <Loader2 size={20} className="animate-spin" /> : <ArrowRight size={20} />}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

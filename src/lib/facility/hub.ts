// src/lib/facility/hub.ts
//
// THE MANAGEMENT PAGE: one page that lists, as titles that open them, every management tool the signed-in person may use (the Employee manager, the PAX directory editor, the Holiday, Circular and Announcement managers,
// the Contact access log). Typed as "management", "management page", "admin", "managers"...
//   not signed in            -> "Please log in", and nothing about the tools
//   signed in, no authority  -> "Not allowed", and nothing about the tools
//   the HOD of C&IT          -> all of them
//   a delegate               -> only the tools the HOD gave him (a withdrawn one is gone at once: asked from the database on every request)
// The two refusals are not plain sentences but a small card of their own (src/components/ManagementHubPanel.tsx, ManagementGatePanel): "login" has a Sign in button that opens the login window (and when the person has signed in the
// same question is asked again by itself, so the page, or the refusal, comes up without typing anything); "denied" says, in the same words whether the person was signed in already or has just signed in, that he is not authorised.
// The list is only a convenience. The authority of a tool is checked again by the tool itself when a title is opened (a title types the tool's own phrase into the search bar, and the tool's own responder asks the
// database who is asking), so the page can never open more than the person may use. Who is asking is always the login (the route ignores a ticket sent by the browser).
// PURE apart from the `authorities` and `nameOf` that the caller gives (src/lib/facility/hubAccess.ts gives the database's).

import type { AnalyticsPayload } from "@/lib/employees/analytics";
import { FACILITIES, type FacilityKey } from "./registry";
import type { Authority } from "./types";

export interface HubTool {
  key: FacilityKey;
  label: string;
  /** what the tool is for, in one line */
  text: string;
  /** the words that open the tool: typed into the search bar when its title is pressed */
  phrase: string;
  /** how this person holds the tool */
  role: Authority;
}

/** what a person who may not have the page is shown: asked to sign in (he is not signed in: nobody is told who may or may not have the page), or told he is not authorised (signed in, and holding no management tool) */
export interface ManagementGate {
  state: "login" | "denied";
  /** the signed-in person's name, for the refusal ("signed in as ..."), when it is known */
  name?: string;
}

/** the words of the two refusals, said once (the card and the plain `answer` use them) */
export const GATE_TEXT = {
  loginTitle: "Sign in to open the management pages",
  login: "The management pages are for the HOD of C&IT and for the people he has authorised. Sign in with your ticket number: if you are one of them, the page opens at once.",
  deniedTitle: "You are not authorised to access this page",
  denied: "Only the HOD of C&IT, or a person he has authorised for a management page, can open the management pages.",
} as const;

export interface ManagementHubOpen {
  ticket: string;
  name?: string;
  /** hod when the person is the HOD of C&IT, else delegate */
  role: Authority;
  tools: HubTool[];
}

/** what each tool is for and the words that open it (each phrase is checked against the tool's own reader in hub.selftest.ts, and the list against FACILITIES: a new tool without a line here fails the test) */
export const HUB_TOOLS: Record<FacilityKey, { text: string; phrase: string }> = {
  employee: { text: "Add, change and remove employee records; authorise delegates", phrase: "employee management" },
  pax: { text: "The PAX directory: add, change and delete telephone numbers; authorise delegates", phrase: "pax directory management" },
  holiday: { text: "The holiday list of each year: seed, edit and clear; authorise delegates", phrase: "holiday management" },
  circular: { text: "Upload and manage circulars; authorise delegates", phrase: "circular management" },
  announcement: { text: "Publish and manage announcements, with or without a PDF; authorise delegates", phrase: "announcement management" },
  access_log: { text: "Who revealed or copied whose contact details; authorise delegates (executives only)", phrase: "contact access log management" },
};

const ORDER = Object.keys(FACILITIES) as FacilityKey[];

// ---- the typed line ----
const CORE = new Set(["management", "managements", "manager", "managers", "admin", "admins", "administration"]);
const FILLER = new Set(["please", "kindly", "open", "show", "take", "me", "to", "the", "my", "all", "our", "list", "of", "page", "pages", "menu", "panel", "panels", "console", "dashboard", "home", "tools", "tool", "and", "a"]);

/**
 * "management", "management page", "admin", "admin tools", "open the management pages", "all managers", "administration": a line made ONLY of the words above, with at least one of management, manager or admin.
 * A line with any other word ("employee management", "how to become a manager", "circular admin") is not the page: it is that tool's own, or an ordinary question.
 */
export function detectManagementHubIntent(typed: string): boolean {
  const words = (typed ?? "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  return words.every((w) => CORE.has(w) || FILLER.has(w)) && words.some((w) => CORE.has(w));
}

// ---- who holds what ----
export type Authorities = Record<FacilityKey, Authority | null>;

export interface HubDeps {
  /** the person's authority for each tool, asked from the database (a withdrawn delegation is none) */
  authorities: (ticket: string) => Promise<Authorities>;
  nameOf?: (ticket: string) => Promise<string | null>;
}

const gate = (g: ManagementGate): AnalyticsPayload => ({ kind: "count", answer: g.state === "login" ? GATE_TEXT.login : GATE_TEXT.denied, managementGate: g }) as AnalyticsPayload;

/** the tools this person holds, in the usual order (empty when none) */
export function toolsOf(a: Authorities): HubTool[] {
  return ORDER.flatMap((key): HubTool[] => {
    const role = a[key];
    return role ? [{ key, label: FACILITIES[key].label, text: HUB_TOOLS[key].text, phrase: HUB_TOOLS[key].phrase, role }] : [];
  });
}

export async function answerManagementHub(typed: string, ticket: string | null, deps: HubDeps): Promise<AnalyticsPayload | null> {
  if (!detectManagementHubIntent(typed)) return null;

  const who = (ticket ?? "").trim();
  if (!who) {
    return gate({ state: "login" });
  }

  const [held, name] = await Promise.all([
    deps.authorities(who).catch(() => null),
    deps.nameOf ? deps.nameOf(who).catch(() => null) : Promise.resolve(null),
  ]);
  const tools = held ? toolsOf(held) : [];
  if (tools.length === 0) {
    return gate({ state: "denied", ...(name && name.trim() ? { name: name.trim() } : {}) });
  }

  const role: Authority = tools.some((t) => t.role === "hod") ? "hod" : "delegate";
  const open: ManagementHubOpen = { ticket: who, ...(name && name.trim() ? { name: name.trim() } : {}), role, tools };
  return { kind: "count", answer: "The management page is open below.", managementHub: open } as AnalyticsPayload;
}

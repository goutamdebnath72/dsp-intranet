// src/components/OmnibarModal.tsx
"use client";

import { isAnnouncementSourceId, realSourceId } from "@/lib/search/sourceKey";
import { isIdQuery } from "@/lib/search/idQuery";
import { formatCircularTitle } from "@/lib/circularTitle";
import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { lockPageScroll } from "@/lib/ui/scrollLock";
import {
  Search,
  Loader2,
  FileText,
  Megaphone,
  CalendarDays,
  Sparkles,
  X,
  Lock,
} from "lucide-react";
import { DateTime } from "luxon";
import { useOmniSearch } from "@/hooks/useOmniSearch";
import { RecordsScopeBar } from "@/components/RecordsScopeBar";
import { ADMIN_CHOICE, EDS_CHOICE, domainById, facetById } from "@/records/domains";
import { suggestDomain } from "@/records/plan";
import { AUTO_SELECTION, finderLabel, finderReady } from "@/records/scope";
import type { Selection } from "@/records/types";
import { OMNIBAR_PREFILL_EVENT } from "@/lib/help/sampleQuestions";
import { ToolPanel } from "@/components/tools/ToolPanel";
import { toolFormIsWide, toolFormMaxRem } from "@/components/tools/toolWidth";
import { detectTool, type FormKind } from "@/lib/tools/detect";
import { clearIntent, intentById, worthAsking } from "@/lib/tools/intent";
import { askIntent } from "@/lib/tools/intentClient";
import { answerNeedsWideModal, needsWideModal } from "@/lib/search/edsLayout";
import { useVerifiedSession } from "@/components/SessionGuard";
import { useModal } from "@/context/ModalContext";
import { InterpretationNote, PatternFeedbackBar } from "@/components/AnalyticsFeedback";
import { Nl2SqlAnswerExtras } from "@/components/Nl2SqlAnswerExtras";
import { AnswerResult } from "@/components/AnswerResult";
import { departmentGroups, isSingleRowTable, mergePage } from "@/lib/nl2sql/display";
import { AnswerFeedback, type AnswerSource } from "@/components/AnswerFeedback";
import { CircularViewerLightbox } from "@/components/CircularViewerLightbox";
import { OmniLoginHint } from "@/components/OmniLoginHint";
import { WEAK_NOTE } from "@/lib/search/weakMatch";
import { looksLikeNameSearch } from "@/lib/search/nameSearchGate";
import { AnswerHeadline } from "@/components/AnswerHeadline";
import { FormattedAnswerText } from "@/components/FormattedAnswerText";
import { afterVerdict } from "@/lib/ui/answerHeadline";
import { FormerNameNotice } from "@/components/FormerNameNotice";
import { formerNameNotice } from "@/lib/search/formerNames";
import { HolidayAnswerCard } from "@/components/HolidayAnswerCard";
import { HolidayCompareCard } from "@/components/HolidayCompareCard";
import "./omniScale.css";
import { omniScaleFor } from "@/lib/ui/omniScale";
import { CircularAnswerCard } from "@/components/CircularAnswerCard";
import { tidyDesignation } from "@/lib/nl2sql/designationFilter";
import { withTitle } from "@/lib/employees/honorific";
import { PersonBadges } from "@/components/PersonBadges";
import { ClarifyChoices } from "@/components/ClarifyChoices";
import { HospitalAnswerCard } from "@/components/HospitalAnswerCard";
import { AccessLogAdminPanel, AnnouncementAdminPanel, CircularAdminPanel, EmployeeAdminPanel, ExecutiveBriefing, HolidayAdminPanel, PaxAdminPanel, preloadManagementPanels } from "@/components/managementPanels"; // loaded on first need, not with the search window
import { ManagementBack, ManagementGatePanel, ManagementHubPanel } from "@/components/ManagementHubPanel";
import { detectManagementHubIntent } from "@/lib/facility/hub";
import { TicketText } from "@/components/OriginSwitch";
import { useOriginTint } from "@/lib/ui/originTint";
import { detectNameHint } from "@/lib/search/nameHint/nameHint";
import { NAME_HINT_MODE, nameHintSources } from "@/lib/search/nameHint/config";
import { useNameVocab } from "@/hooks/useNameVocab";
import { answerFirstEnabled, useCircularAnswer } from "@/hooks/useCircularAnswer";
import { decideLoginHint, excludeShownPeople, resumeAskedEds, shouldAskExecutive, type ExecutiveAsk } from "@/lib/search/loginHints";
import { OmniExecutiveAsk } from "@/components/OmniExecutiveAsk";
import { OmniAdminAsk } from "@/components/OmniAdminAsk";
import { autoEdsEnabled, detectSynthesisIntent } from "@/lib/search/synthesisIntent";
import { resumeAsEds } from "@/lib/search/loginHints";
import { Tooltip } from "@/components/Tooltip";
import AnnouncementModal from "@/components/AnnouncementModal";
import { generateSmartSnippet } from "@/lib/utils/searchUtils";
import { searchSites } from "@/lib/search/siteSearch";
import { findDepartmentInText } from "@/lib/employees/departments";
import { ExternalLink, Globe, UserRound, Phone, Mail, ShieldCheck, Copy, Check, AlertTriangle } from "lucide-react";

interface OmnibarModalProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  isExecutive?: boolean;
  ticketNo?: string;
}

const BASE_MODAL_WIDTH_REM = 52; // the floor: never narrower than this
const BASE_MODAL_WIDTH_VW = 60; // the width on a laptop or a desktop: a share of the screen (the page itself is 80vw), so it holds at any zoom
const MODAL_MAX_PX = 1600; // never wider than this, even on a very large monitor
const EXECUTIVE_SCALE = 1.08;
// The box while an answer shows a table of 4+ columns (src/lib/search/edsLayout.ts) is exactly as wide as the PAGE behind it: --omni-page-width (globals.css) is the page's own width
// (--content-width from the md breakpoint up, the full width below), so the two cannot differ at any screen size or zoom, and NO box ever crosses it.
const PAGE_WIDTH_VAR = "var(--omni-page-width)";
// Every text in the box is this much smaller than the size the screen gives it (owner, 10 Nov 2026, for the widest box, a table of 4+ columns: "a very small amount"; the same lowering
// for the normal width on 11 Nov 2026): 3%, so a 15 px text is drawn at 14.5 px. The factor multiplies the text scale (--omni-k) of the card, which every text size and line height of
// the modal already follows (omniScale.css), so nothing can escape it and the proportions stay as they were. This is the only place the amount is written: change it here.
const MODAL_TEXT_FACTOR = 0.97;
const MD_BREAKPOINT_PX = 768; // where the page changes from full width to --content-width (Tailwind md)

/** what can be revealed on a card, each time a signed-in person presses it (the server logs it): the mobile number, the e-mail, the SAIL P.No. and the ticket number */
type RevealField = "mobile" | "email" | "ticket" | "sailpno";
type Revealed = Partial<Record<RevealField, string>>;
const MASK_BUTTON = "cursor-pointer rounded px-0.5 underline decoration-dotted underline-offset-2 hover:bg-neutral-200 hover:text-emerald-700";

function PersonRow({
  emp,
  rev,
  authStatus,
  copiedId,
  onReveal,
  onCopy,
  notice,
}: {
  emp: any;
  rev: Revealed;
  authStatus: string;
  copiedId: string | null;
  onReveal: (id: string, field: RevealField) => void;
  onCopy: (emp: any) => void;
  /** a refused or failed reveal for this person (the hourly cap, a log fault): said under the card */
  notice?: string | null;
  /** Kept for the callers; the department (name and code) is now shown on every card, also under a department heading. */
  hideDepartment?: boolean;
}) {
  const [tint] = useOriginTint();
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-transparent hover:bg-neutral-100 transition-all duration-200">
      <div className="p-2 rounded-md bg-emerald-100 text-emerald-700 flex-shrink-0">
        <UserRound size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-neutral-800 truncate">
          {withTitle(emp.name, emp.title)}
          <PersonBadges isExecutive={emp.isExecutive} phd={emp.phd} discipline={emp.discipline} />
        </p>
        <p className="text-xs text-neutral-500 truncate">
          {(() => {
            // The ticket number and the SAIL P.No. arrive MASKED; pressing one asks the server for the real value (a sign-in is asked for first, and the press is logged).
            const parts: React.ReactNode[] = [];
            if (emp.ticketNo)
              parts.push(
                rev.ticket ? (
                  <TicketText ticket={rev.ticket} tint={tint} />
                ) : (
                  <button type="button" onClick={() => onReveal(emp.id, "ticket")} title="Press to show the ticket number (sign-in needed; every press is recorded)" className={MASK_BUTTON}>
                    <TicketText ticket={emp.ticketNo} tint={tint} origin={emp.ticketOrigin} />
                  </button>
                ),
              );
            if (emp.sailPNo)
              parts.push(
                rev.sailpno ? (
                  <span>{rev.sailpno}</span>
                ) : (
                  <button type="button" onClick={() => onReveal(emp.id, "sailpno")} title="Press to show the SAIL personal number (sign-in needed; every press is recorded)" className={MASK_BUTTON}>
                    {emp.sailPNo}
                  </button>
                ),
              );
            if (emp.designation) parts.push(<span>{`${tidyDesignation(emp.designation)}${emp.designationCode ? ` (${emp.designationCode})` : ""}`}</span>);
            if (emp.department) parts.push(<span>{`${emp.department}${emp.departmentCode ? ` (${emp.departmentCode})` : ""}`}</span>);
            return parts.map((node, i) => (
              <React.Fragment key={i}>
                {i > 0 ? "\u00a0\u00b7\u00a0 " : null}
                {node}
              </React.Fragment>
            ));
          })()}
        </p>
        {Array.isArray(emp.extraFields) && emp.extraFields.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {emp.extraFields.map((f: { label: string; value: string }) => (
              <span
                key={f.label}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
              >
                <span className="text-slate-400">{f.label}</span>
                <span className="font-medium text-slate-700">{f.value}</span>
              </span>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {emp.hasMobile && (
            <button
              type="button"
              onClick={() => onReveal(emp.id, "mobile")}
              disabled={!!rev.mobile}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-default disabled:border-emerald-200 disabled:text-emerald-700"
            >
              <Phone size={12} />
              {rev.mobile ? rev.mobile : emp.mobileMasked}
              {!rev.mobile && (
                <span className="text-[10px] text-neutral-400">reveal</span>
              )}
            </button>
          )}
          {emp.hasEmail && (
            <button
              type="button"
              onClick={() => onReveal(emp.id, "email")}
              disabled={!!rev.email}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-default disabled:border-emerald-200 disabled:text-emerald-700"
            >
              <Mail size={12} />
              {rev.email ? rev.email : emp.emailMasked}
              {!rev.email && (
                <span className="text-[10px] text-neutral-400">reveal</span>
              )}
            </button>
          )}
        </div>
        {notice && <p role="alert" className="mt-1 text-[11px] text-red-600">{notice}</p>}
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-1 self-start">
        {emp.matchKind === "name-phonetic" && (
          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
            sounds-like
          </span>
        )}
        <button
          type="button"
          onClick={() => onCopy(emp)}
          disabled={authStatus !== "authenticated"}
          title={authStatus === "authenticated" ? "Copy record" : "Log in to copy"}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-neutral-700"
        >
          {copiedId === emp.id ? <Check size={12} /> : <Copy size={12} />}
          {copiedId === emp.id ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** the two pages that list things: the calculators, and every utility service */
const isListPage = (k: string): k is "menu" | "services" => k === "menu" || k === "services";

export function OmnibarModal({
  isOpen,
  setIsOpen,
  isExecutive = false,
  ticketNo,
}: OmnibarModalProps) {
  const {
    query,
    submittedQuery,
    attempt,
    requestRetry,
    setQuery,
    clearSearch,
    isStale,
    mode,
    triggerSearch,
    prefetchSearch,
    selection,
    setSelection,
    results,
    synthesis,
    analytics,
    isLoading,
    error,
  } = useOmniSearch(isOpen, ticketNo);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The calculator form (or the menu of them) opened with Enter. Sums, conversions and date questions need no state: they answer as you type (src/components/tools/ToolPanel.tsx).
  const [toolForm, setToolForm] = useState<FormKind | "menu" | "services" | null>(null);
  // THE UTILITY SERVICES BUTTON opens the page ALONE: the box and the choices above it go away (they would only take height), and the page's own Back returns to the ordinary window of the search.
  // The page stays alone while a calculator opened from it is open, and ends when the page is closed.
  const [utilityShellOn, setUtilityShellOn] = useState(false);
  const utilityFocus = utilityShellOn && toolForm !== null;
  useEffect(() => { if (toolForm === null) setUtilityShellOn(false); }, [toolForm]);
  // Escape on the page alone goes back to the ordinary window (it does not close the search); heard before the window's own handler
  useEffect(() => {
    if (!utilityFocus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && toolForm === "services") { e.preventDefault(); e.stopImmediatePropagation(); setToolForm(null); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [utilityFocus, toolForm]);
  // A MANAGEMENT TOOL'S OWN PAGE (Employee manager, PAX directory editor, Holiday, Circular and Announcement managers, Contact access log) stands alone exactly like the Utility Services page: the box and the choices go away
  // (they would only take height), the page has the whole height of the window, and its Back button (ManagementBack) returns to the management page with the ordinary window around it. Escape on the page goes back the same way.
  // It is a pure function of the answer on screen, so it is gone the moment that answer goes (Back, a new search, a closed window).
  const adminFocus = !isLoading && !!analytics && !!(analytics.employeeAdmin || analytics.paxAdmin || analytics.holidayAdmin || analytics.circularAdmin || analytics.announcementAdmin || analytics.accessLogAdmin);
  const pageAlone = utilityFocus || adminFocus;
  useEffect(() => {
    if (!adminFocus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); triggerSearch("semantic", { query: "management" }); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // triggerSearch is read as it is at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminFocus]);
  // A utility found from a line that used none of its words (src/lib/tools/intent.ts for what the app can tell by itself, intentAi.ts for what the AI is asked): the utility's id and who found it. The line itself
  // is NEVER sent to the search then (a figure of someone's loan or pay is not logged); `routedQuery` is the sample line that makes the utility's card, for a utility that is a card and not a form.
  const [routed, setRouted] = useState<{ id: string; via: "local" | "ai" } | null>(null);
  const [routedQuery, setRoutedQuery] = useState<string | null>(null);
  const [understanding, setUnderstanding] = useState(false);
  const routeReq = useRef(0);
  const forgetRoute = () => { routeReq.current++; setRouted(null); setRoutedQuery(null); setUnderstanding(false); };
  useEffect(() => {
    if (!isOpen) { setToolForm(null); forgetRoute(); }
  }, [isOpen]);
  const openRouted = (id: string, via: "local" | "ai") => {
    const e = intentById(id);
    if (!e) return;
    clearSearch();
    setEmployeeResults([]);
    setUnderstanding(false);
    if ("form" in e.open) { setRoutedQuery(null); setToolForm(id as FormKind); } else { setToolForm(null); setRoutedQuery(e.open.query); }
    setRouted({ id, via });
  };
  // while typing: the utility the line is CLEARLY about, when no exact reader has it (the hint says Enter opens it). Only on Everything: under a chosen button the reader said where to look, so no utility is guessed and no hint is shown (owner, 23 Nov 2026: "pf loan repayment" under Circulars & Notices showed "Press Enter to open the provident fund")
  const clearHit = useMemo(() => {
    const q = (query || "").trim();
    return selection.scope !== "auto" || toolForm || routed || q.length < 4 || detectTool(q) ? null : clearIntent(q);
  }, [query, toolForm, routed, selection.scope]);
  // the management page typed ("management", "admin"...) but not sent yet: the hint that Enter opens it (it goes once the line has been sent)
  const hubTyped = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    return !toolForm && detectManagementHubIntent(q) && (submittedQuery || "").trim().toLowerCase() !== q;
  }, [query, submittedQuery, toolForm]);
  // "Looks like a name": one to four words that read as an Indian name earn the hint that Enter searches people (src/lib/search/nameHint/nameHint.ts). Only a hint: it is shown when no command, utility or
  // management page has claimed the line and the line has not been searched yet; it runs in the browser with no network call per keystroke (the plant's name words are fetched once, when the box opens).
  const nameSources = nameHintSources(NAME_HINT_MODE);
  const plantNames = useNameVocab(isOpen && nameSources.usePlant);
  const nameHint = useMemo(() => {
    const q = (query || "").trim();
    if (selection.scope !== "auto" || NAME_HINT_MODE === "off" || !q || mode === "intellectual" || toolForm || routed || clearHit || hubTyped || (submittedQuery || "").trim() === q || detectTool(q)) return null;
    return detectNameHint(q, { useBuiltin: nameSources.useBuiltin, plant: nameSources.usePlant ? plantNames : null });
  }, [query, mode, toolForm, routed, clearHit, hubTyped, submittedQuery, plantNames, nameSources.useBuiltin, nameSources.usePlant, selection.scope]);
  // Step 59a: a question that uses a FORMER name of a department ("CHRD", "Training Department") is answered with the CURRENT name first: shown above the results, whatever the kind of answer.
  const nameNotice = useMemo(() => formerNameNotice(submittedQuery || ""), [submittedQuery]);

  const [loadingStep, setLoadingStep] = useState(0);
  const [selectedCircularId, setSelectedCircularId] = useState<number | null>(
    null,
  );
  // Set when the circular was opened from an answer's "Source" line: the pages on which the people of the answer are listed (the viewer scrolls to
  // the first and marks them all). Cleared when the viewer closes.
  const [sourceViewer, setSourceViewer] = useState<{ pages: number[] } | null>(null);
  // Set when the circular was opened from the ANSWER card: the exact words of that answer, shown as the viewer's banner instead of the search's own
  // best clause (which can be a different one: the room of the report collection, not the room of the check-up). Cleared when the viewer closes.
  const [answerQuote, setAnswerQuote] = useState<string | null>(null);
  // Whether the user has dismissed the "Target Clause Reference" banner for the
  // currently-open circular. Reset each time a new circular is opened/closed.
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // Full announcement (with HTML content) fetched on click, to open the modal.
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(
    null,
  );
  // How many times the window has been opened (counted in the render in which it opens, so the first frame of an opening already has its own animation state).
  const [openings, setOpenings] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setOpenings((n) => n + 1);
  }
  // Closing the search window by ANY route (X, a click outside, Escape, Ctrl+K, a click on the search bar's toggle) leaves nothing of it behind: a document viewer or an announcement that was
  // open over it stays open no more, and the next opening starts clean. (A viewer left set with the window closed would make the next opening draw nothing at all: the box is not shown while one is set.)
  useEffect(() => {
    if (isOpen) return;
    setSelectedCircularId(null);
    setSelectedAnnouncement(null);
    setSourceViewer(null);
    setAnswerQuote(null);
    setBannerDismissed(false);
  }, [isOpen]);

  // Step 56b: the modal is wider than it was (step 54i) but its text was not: the text grows with the width, so that it keeps the proportion it had at the old 52rem (omniScale.css).
  // The doctors' unit tables opt out (omni-noscale): they keep their size and the room the extra width gave them.
  const modalRef = useRef<HTMLDivElement>(null);

  // The text scale (--omni-k) is a pure function of the SCREEN and the mode: it is the scale of the width the box is going to have, not of the width it has at this moment.
  // It used to be re-measured from the box (ResizeObserver, offsetWidth) as well. While the box unfolds (every opening, and above all when it comes back after the circular's
  // PDF viewer is closed: the whole answer is drawn again, the unfolding stalls) the box is narrow, the measurement came out as 1, the text was drawn small and then jumped to its
  // real size when the unfolding ended. Nothing the box does while it animates may change the text size, so nothing is measured from it any more
  // (src/components/OmnibarModal.layout.selftest.ts keeps the measuring out).
  const getExpectedK = useCallback(() => {
    if (typeof window === "undefined") return 1;
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const executive = mode === "intellectual";
    const rem = executive ? BASE_MODAL_WIDTH_REM * EXECUTIVE_SCALE : BASE_MODAL_WIDTH_REM;
    const vw = executive ? BASE_MODAL_WIDTH_VW * EXECUTIVE_SCALE : BASE_MODAL_WIDTH_VW;
    const view = window.innerWidth;
    // the box sits in a row with 1rem of room on each side, inside the page without its scrollbar
    const room = (document.documentElement.clientWidth || view) - 2 * rootPx;
    // the page behind the box: --content-width (a share of the screen, "80vw") from the md breakpoint up, the full width below; the box is never wider than it
    const contentVw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--content-width")) || 80;
    const pagePx = view >= MD_BREAKPOINT_PX ? (contentVw * view) / 100 : view;
    const targetPx = Math.min(Math.max(rem * rootPx, (vw * view) / 100), MODAL_MAX_PX, 0.92 * view, room, pagePx);
    return omniScaleFor(targetPx, BASE_MODAL_WIDTH_REM * rootPx);
  }, [mode]);

  const [omniK, setOmniK] = useState(() => (typeof window !== "undefined" ? getExpectedK() : 1));

  // Frame 0 of every opening, a mode change, and a resized window (zoom included) all take the same pure value.
  useEffect(() => {
    const apply = () => {
      const expected = getExpectedK();
      setOmniK((prev) => (Math.abs(prev - expected) >= 0.01 ? expected : prev));
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [getExpectedK, isOpen, selectedCircularId, selectedAnnouncement]);
  const { status: authStatus } = useVerifiedSession();
  // Answer first (step 29a, off unless NEXT_PUBLIC_FRONT_PATH_ANSWER_FIRST=true): once the search has found documents, the answer they
  // prove is written above them, with the source and the exact words. Nothing appears if the text does not prove an answer.
  const circularAnswer = useCircularAnswer({ enabled: answerFirstEnabled(), query: submittedQuery, results: isLoading ? [] : results, mode, allowSummary: !looksLikeNameSearch(submittedQuery) && !isIdQuery((submittedQuery || "").trim()) });
  // The documents the answer already cites are not listed a second time below it: the answer's source line is their one link.
  // The same for the documents a SUMMARY is drawn from: its "Summarised from" line is their link, so they are not listed a second time below it.
  const answeredKeys = new Set([...(circularAnswer.answer?.sources ?? []), ...(circularAnswer.summary?.sources ?? [])].map((s) => `${s.type}-${s.id}`));
  const { openModal } = useModal();
  // The "sign in" advice for an EDS-category question (step 83): when the visitor signs in as an executive while that question is on screen, it runs by itself through EDS.
  // (Signing in changes the search address, so the plain search restarts by itself; this sends it to EDS instead, so nobody has to close the window and ask again.)
  const wasExecutiveRef = useRef(isExecutive);
  useEffect(() => {
    const was = wasExecutiveRef.current;
    wasExecutiveRef.current = isExecutive;
    if (
      resumeAsEds({
        wasExecutive: was,
        isExecutive,
        isOpen,
        mode,
        query,
        submittedQuery,
        edsEnabled: autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: process.env.NEXT_PUBLIC_FRONT_PATH_AUTO_EDS }),
      })
    ) {
      triggerSearch("intellectual", { auto: true, query: submittedQuery });
    }
    // only a change of isExecutive is the trigger; the other values are read as they are at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExecutive]);
  // "Are you an executive?" (src/lib/search/loginHints.ts): a signed-out visitor who asks an EDS-kind question is asked before anything is searched. `executiveAsk` is the question being asked (said: "yes" once he
  // has said he is an executive); `declinedAsk` is the question for which he said No (the simple answer was shown, so the sign-in advice is not repeated above it).
  const [executiveAsk, setExecutiveAsk] = useState<ExecutiveAsk | null>(null);
  const [declinedAsk, setDeclinedAsk] = useState<string | null>(null);
  // THE ADMIN BUTTON (More tools): a signed-out visitor is asked "Are you authorised to access them?" (Yes opens the sign-in window; No goes back to Everything); a signed-in person goes straight to the check.
  // `adminWant` asks for the management page once the Admin selection and the login are both in place: the server says who the login is, and answers the management page or the red "not authorised" card.
  const [adminAsk, setAdminAsk] = useState<{ said: "yes" | null } | null>(null);
  const [adminWant, setAdminWant] = useState(false);
  const askRef = useRef<ExecutiveAsk | null>(null);
  askRef.current = executiveAsk;
  const wasExecutiveAskRef = useRef(isExecutive);
  useEffect(() => {
    const was = wasExecutiveAskRef.current;
    wasExecutiveAskRef.current = isExecutive;
    const ask = askRef.current;
    if (ask && ask.query === "" && isExecutive) setExecutiveAsk(null); // signed in as an executive after pressing the EDS button: the question is asked of the box, nothing is waiting to resume
    if (ask && resumeAskedEds({ ask, wasExecutive: was, isExecutive, isOpen, query, edsEnabled: autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: process.env.NEXT_PUBLIC_FRONT_PATH_AUTO_EDS }) })) {
      setExecutiveAsk(null);
      triggerSearch("intellectual", { auto: true, query: ask.query });
    }
    // only a change of isExecutive is the trigger; the other values are read as they are at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExecutive]);
  // a visitor pressed the EDS button, said Yes and signed in as someone who is NOT an executive: the card goes and the note says what EDS is for
  useEffect(() => {
    if (executiveAsk && executiveAsk.query === "" && authStatus === "authenticated" && !isExecutive) {
      setExecutiveAsk(null);
      setEdsNote(EDS_NOT_EXECUTIVE);
    }
  }, [authStatus, isExecutive, executiveAsk]);
  // signed in while the Admin question is on the screen (after Yes, or when the sign-in state arrived late): the question goes and the check is made
  useEffect(() => {
    if (selection.scope === "admin" && authStatus === "authenticated" && adminAsk) { setAdminAsk(null); setAdminWant(true); }
  }, [selection.scope, authStatus, adminAsk]);
  useEffect(() => {
    if (adminWant && selection.scope === "admin" && authStatus === "authenticated") { setAdminWant(false); triggerSearch("semantic", { query: "management" }); }
    // triggerSearch is read as it is at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminWant, selection.scope, authStatus]);
  // the Admin question goes when something is typed
  useEffect(() => {
    if (adminAsk && query.trim() !== "") setAdminAsk(null);
  }, [query, adminAsk]);
  // the question is dropped when the text is edited, and when the window closes
  useEffect(() => {
    if (executiveAsk && query.trim() !== executiveAsk.query) setExecutiveAsk(null);
    if (declinedAsk !== null && query.trim() !== declinedAsk) setDeclinedAsk(null);
  }, [query, executiveAsk, declinedAsk]);
  useEffect(() => {
    if (!isOpen) { setExecutiveAsk(null); setDeclinedAsk(null); setAdminAsk(null); setAdminWant(false); }
  }, [isOpen]);
  // A reveal the user clicked while logged out; retried after they log in.
  const pendingRevealRef = useRef<{ empId: string; field: RevealField } | null>(null);

  // Client-side site directory matches (the "site" result type). Sites are a
  // static list, so this needs no server round-trip. Shown pinned above the
  // circular/announcement results. Skipped in Executive synthesis mode.
  const siteResults = useMemo(() => {
    if (mode === "intellectual" || selection.scope !== "auto") return []; // a chosen selection shows its own answers only: no intranet-site links beside them
    const q = (query || "").trim();
    if (q.length < 2) return [];
    let hits = searchSites(q, 6);
    // Hybrid "<name> <department>" (e.g. "gautham c&it"): the whole string won't
    // match a site because of the name, but the department the user typed still
    // should show its link. Look it up by department name and pin it to the top.
    const dept = findDepartmentInText(q);
    if (dept) {
      const deptHits = searchSites(dept.group.name, 3);
      if (deptHits.length) {
        const seen = new Set(hits.map((h) => `${h.category}-${h.title}`));
        const add = deptHits.filter(
          (h) => !seen.has(`${h.category}-${h.title}`),
        );
        hits = [...add, ...hits].slice(0, 6);
      }
    }
    return hits;
  }, [query, mode, selection.scope]);

  // ---- Employee (People) search --------------------------------------------
  // Live exact-ID lookups (ticket / mobile / SAIL PNO) as the user types, and
  // fuzzy+phonetic NAME search triggered on Enter. Contacts arrive masked; the
  // reveal endpoint unmasks + audits.
  const [employeeResults, setEmployeeResults] = useState<any[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  // The directory name search can find the same person as the answer card: print each person once.
  const extraEmployees = useMemo(
    () => excludeShownPeople(analytics?.people, employeeResults),
    [analytics, employeeResults],
  );
  // "Show more": further pages (100 at a time) of the SAME answer, appended below the first page. The browser sends only the
  // answer's id and how many rows it already has; the server runs the stored, re-checked SQL (signed-in people only).
  const [more, setMore] = useState<{
    key: string;
    people: any[];
    rows: any[];
    total: number | null;
    hasMore: boolean;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const moreNow = more && more.key === String(analytics?.nl2sql?.logId ?? "") ? more : null;
  const loadMore = useCallback(async () => {
    const nl = analytics?.nl2sql;
    if (!nl?.logId || !nl.table || moreNow?.loading) return;
    const key = String(nl.logId);
    const cur = moreNow ?? { key, people: [], rows: [], total: nl.table.total, hasMore: true, loading: false, error: null };
    setMore({ ...cur, loading: true, error: null });
    try {
      const res = await fetch("/api/omnibar/more", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logId: nl.logId,
          offset: nl.table.rows.length + cur.rows.length,
          labels: nl.display?.columns?.map((c) => ({ key: c.key, label: c.label })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Could not load more just now.");
      setMore({
        key,
        people: [...cur.people, ...(j.people ?? [])],
        rows: [...cur.rows, ...(j.rows ?? [])],
        total: typeof j.total === "number" ? j.total : cur.total,
        hasMore: !!j.hasMore,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setMore({ ...cur, loading: false, error: e?.message || "Could not load more just now." });
    }
  }, [analytics, moreNow]);
  // Suggest signing in (or using Executive Deep Synthesis) where that would help.
  const loginHint = useMemo(
    () =>
      isLoading
        ? null
        : decideLoginHint({
            query: submittedQuery || "",
            authenticated: authStatus === "authenticated",
            isExecutive,
            mode,
            circularShown: results.length > 0,
            answerCardShown: !!analytics,
            authStatus: authStatus as "authenticated" | "unauthenticated" | "loading",
            edsEnabled: autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: process.env.NEXT_PUBLIC_FRONT_PATH_AUTO_EDS }),
            executiveAskAnsweredNo: declinedAsk !== null && declinedAsk === (submittedQuery || "").trim(),
          }),
    [isLoading, submittedQuery, authStatus, isExecutive, mode, analytics, results, declinedAsk],
  );
  // id -> { mobile?, email?, ticket?, sailpno? } once revealed in this session.
  const [revealed, setRevealed] = useState<Record<string, Revealed>>({});
  // a reveal the server refused (the hourly cap) or could not log: said under that person's card
  const [revealNotice, setRevealNotice] = useState<{ empId: string; text: string } | null>(null);
  // id of the row most recently copied (for a transient "Copied" confirmation).
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ID-shape detector (mirror of the server's detectShape for the live path).
  // Live: run ID lookups as the user types (debounced). Names wait for Enter.
  useEffect(() => {
    const q = (query || "").trim();
    // the live lookup of a number belongs to Everything and to People > Name or number; under any other selection a number is not a person
    const idLive = selection.scope === "auto" || (selection.scope === "people" && selection.facet === "find");
    if (!idLive || mode === "intellectual" || !isIdQuery(q)) {
      // Clear employee results unless a name-search populated them (Enter path
      // sets them directly and should persist until the query changes).
      return;
    }
    let cancelled = false;
    setEmployeeLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/employees/search?mode=id&q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d) => {
          if (!cancelled) setEmployeeResults(Array.isArray(d.results) ? d.results : []);
        })
        .catch(() => {
          if (!cancelled) setEmployeeResults([]);
        })
        .finally(() => {
          if (!cancelled) setEmployeeLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, mode, selection.scope, selection.facet]);

  // When the query is cleared or becomes an id/name, keep employee list sane.
  useEffect(() => {
    const q = (query || "").trim();
    if (q.length < 2) {
      setEmployeeResults([]);
      setRevealed({});
    } else if (!isIdQuery(q) && !looksLikeNameSearch(q)) {
      setEmployeeResults([]);
    }
  }, [query]);

  // ONE employee lookup at a time wins: every request takes a number, and only the NEWEST one may write its answer. (A slow
  // answer for an old query used to arrive after the box was cleared or edited and put the old people back; the Enter-ID
  // lookup also had no .catch.)
  const employeeReq = useRef(0);
  const fetchEmployees = useCallback(async (kind: "name" | "id", q: string) => {
    const mine = ++employeeReq.current;
    setEmployeeLoading(true);
    try {
      const r = await fetch(`/api/employees/search?mode=${kind}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const d = r.ok ? await r.json() : { results: [] };
      if (mine === employeeReq.current) setEmployeeResults(Array.isArray(d.results) ? d.results : []);
    } catch {
      if (mine === employeeReq.current) setEmployeeResults([]);
    } finally {
      if (mine === employeeReq.current) setEmployeeLoading(false);
    }
  }, []);

  // Enter -> fuzzy + phonetic NAME search.
  const runEmployeeNameSearch = useCallback(async () => {
    const q = (query || "").trim();
    if (q.length < 2) return;
    await fetchEmployees("name", q);
  }, [query, fetchEmployees]);

  // THE FIXED SELECTIONS (src/records). A line under a chosen selection is answered by that selection's own engines only. People > Name or number is looked up by the directory's own routes (no AI);
  // the server is still asked once (it answers an empty list at once) so the screen knows a search was made and can say "No results found".
  const runScoped = (line: string) => {
    const text = line.trim();
    if (text.length < 2) return;
    if (selection.scope === "people" && selection.facet === "find") {
      void fetchEmployees(isIdQuery(text) ? "id" : "name", text);
    } else {
      employeeReq.current++;
      setEmployeeResults([]);
    }
    triggerSearch("semantic", { query: text });
  };
  // People > Department & designation: the two picked lists (and an optional part of a name) are the whole question; the box shows the words that stand for it
  const runFinder = (labels: { deptName: string | null; gradeName: string | null }) => {
    if (!finderReady(selection)) return;
    employeeReq.current++;
    setEmployeeResults([]);
    triggerSearch("semantic", { query: finderLabel({ ...labels, nm: selection.nm }) });
  };
  // choosing another selection (or another way of looking for a person) leaves nothing of the old one on the screen
  const changeSelection = (next: Selection) => {
    const moved = next.scope !== selection.scope || next.facet !== selection.facet;
    setSelection(next);
    if (moved) {
      employeeReq.current++;
      setEmployeeResults([]);
      clearSearch();
      setQuery(""); // the words written for one choice are not carried over to another: the box starts empty
      setEdsNote(null);
      setToolForm(null);
      forgetRoute();
      setExecutiveAsk(null);
      setAdminAsk(null);
      // Executive Deep Search pressed: a visitor is asked at once "Are you an executive?" (Yes: sign in; No: the circulars), a signed-in person who is not an executive is told, an executive just gets the box
      if (next.scope === "eds") {
        if (authStatus === "unauthenticated") { setExecutiveAsk({ query: "", said: null }); setDeclinedAsk(null); }
        else if (authStatus === "authenticated" && !isExecutive) setEdsNote(EDS_NOT_EXECUTIVE);
      }
      textareaRef.current?.focus();
    }
    // Admin pressed (again too): a signed-in person goes straight to the check of their authority; anyone else is asked first
    if (next.scope === "admin") {
      if (authStatus === "authenticated") setAdminWant(true);
      else setAdminAsk((cur) => cur ?? { said: null });
    }
  };
  // Executive Deep Search, chosen on purpose: an executive's question goes straight to it; a visitor is asked the usual "Are you an executive?"; a signed-in person who is not one is told so
  const [edsNote, setEdsNote] = useState<string | null>(null);
  const EDS_NOT_EXECUTIVE = "Executive Deep Search is for signed-in executives. To search the circulars, choose Circulars & Notices.";
  const runEds = (line: string) => {
    const text = line.trim();
    if (text.length < 3) return;
    setEdsNote(null);
    if (authStatus === "loading") return;
    if (authStatus === "unauthenticated") {
      setExecutiveAsk({ query: text, said: null });
      setDeclinedAsk(null);
      return;
    }
    if (!isExecutive) {
      setEdsNote(EDS_NOT_EXECUTIVE);
      return;
    }
    employeeReq.current++;
    setEmployeeResults([]);
    triggerSearch("intellectual", { query: text });
  };
  // the cross of the management page (or of its "not authorised" card): the page goes; if it came from the Admin button the Admin choice goes with it, the box is wiped and the choice returns to Everything (every way back lands there)
  const closeManagement = () => { if (selection.scope === "admin") changeSelection({ ...AUTO_SELECTION }); else clearSearch(); };
  // the Utility Services button: the page of all the utilities, with the box and any answer cleared
  const openUtilities = () => {
    setUtilityShellOn(true);
    employeeReq.current++;
    setEmployeeResults([]);
    clearSearch();
    setQuery("");
    setEdsNote(null);
    setExecutiveAsk(null);
    setAdminAsk(null);
    forgetRoute();
    setSelection(AUTO_SELECTION);
    setToolForm("services");
  };
  // what the box says while a selection is chosen
  const placeholderText = useMemo(() => {
    if (selection.scope === "eds") return EDS_CHOICE.placeholder;
    if (selection.scope === "admin") return ADMIN_CHOICE.placeholder;
    if (selection.scope === "auto") return "Search people, departments, circulars, announcements & sites — press Enter…";
    if (selection.scope === "people") return selection.facet === "roster" ? "Pick a department and a designation below, then press “List the people”…" : facetById(selection.facet)?.placeholder ?? "";
    return domainById(selection.scope)?.placeholder ?? "";
  }, [selection.scope, selection.facet]);
  // under Everything: what the typed words look like they are for (pure, in the browser; only a hint)
  const suggestion = useMemo(() => (selection.scope === "auto" ? suggestDomain(query || "") : null), [query, selection.scope]);

  // Reveal a masked contact field: unmask inline + server writes the audit row.
  const doReveal = useCallback(
    async (empId: string, field: RevealField): Promise<boolean> => {
      try {
        const r = await fetch(`/api/employees/${empId}/reveal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field }),
        });
        if (r.status === 401) return false; // not logged in
        if (!r.ok) {
          // the cap (429) or a fault: say so under the card; do not loop into login
          const e = await r.json().catch(() => null);
          setRevealNotice({ empId, text: typeof e?.error === "string" ? e.error : "That could not be shown just now. Please try again." });
          return true;
        }
        setRevealNotice(null);
        const d = await r.json();
        setRevealed((prev) => ({
          ...prev,
          [empId]: { ...prev[empId], [field]: d.value || "\u2014" },
        }));
        return true;
      } catch {
        return true; // network error: don't trigger login loop
      }
    },
    [],
  );

  const revealContact = useCallback(
    async (empId: string, field: RevealField) => {
      // Logged in -> reveal directly (session cookie carries identity).
      if (authStatus === "authenticated") {
        await doReveal(empId, field);
        return;
      }
      // Logged out -> remember what to reveal, open the normal login modal,
      // and retry automatically once the session becomes authenticated.
      pendingRevealRef.current = { empId, field };
      openModal();
    },
    [authStatus, doReveal, openModal],
  );

  // Copy an employee's visible directory record to the clipboard (logged-in
  // only) and record the event as action='copy'. Masked contacts are included
  // only if they were already revealed in this session.
  const copyRecord = useCallback(
    async (emp: any) => {
      if (authStatus !== "authenticated") return; // button is disabled anyway
      const rev = revealed[emp.id] || {};
      // the ticket number and the P.No. are copied only if this person has already revealed them (otherwise the record carries the name, designation and department)
      const line = [
        withTitle(emp.name, emp.title),
        rev.ticket,
        rev.sailpno,
        emp.designation ? `${tidyDesignation(emp.designation)}${emp.designationCode ? ` (${emp.designationCode})` : ""}` : null,
        emp.department ? `${emp.department}${emp.departmentCode ? ` (${emp.departmentCode})` : ""}` : null,
      ]
        .filter(Boolean)
        .join("  \u00b7  ");
      const extra: string[] = [];
      if (rev.mobile) extra.push(`Mobile: ${rev.mobile}`);
      if (rev.email) extra.push(`Email: ${rev.email}`);
      const text = [line, ...extra].join("\n");
      try {
        await navigator.clipboard.writeText(text);
        setCopiedId(emp.id);
        setTimeout(() => setCopiedId((c) => (c === emp.id ? null : c)), 1500);
      } catch {
        // clipboard blocked; still record the intent below
      }
      // Best-effort audit; never blocks the UX.
      fetch(`/api/employees/${emp.id}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "record" }),
      }).catch(() => {});
    },
    [authStatus, revealed],
  );

  // After a successful login, complete any pending reveal.
  useEffect(() => {
    if (authStatus === "authenticated" && pendingRevealRef.current) {
      const { empId, field } = pendingRevealRef.current;
      pendingRevealRef.current = null;
      doReveal(empId, field);
    }
  }, [authStatus, doReveal]);

  // A comparison table of 4+ columns on the screen widens the box; it is a pure function of the answer being shown, so it narrows again the moment that answer goes
  // (a new query, an edit of the text, a narrower answer). The text scale (omniK) deliberately stays that of the normal width: the extra room is for the table, not bigger text.
  // A calculator page that asks for the wide box (its ui says `wide`: the PF page, with three boxes in a row and a table of years) gets exactly the same width, and the same rule: it goes the moment the form is closed.
  const wideModal = (mode === "intellectual" && needsWideModal(synthesis)) || (!isLoading && answerNeedsWideModal(analytics)) || toolFormIsWide(toolForm);
  // the normal box: its own width, but never wider than the page. The wide box: the page's width, nothing more, nothing less (100% = the room the row gives it, for a narrow screen).
  const normalMaxWidth = `min(max(${(mode === "intellectual" ? BASE_MODAL_WIDTH_REM * EXECUTIVE_SCALE : BASE_MODAL_WIDTH_REM).toFixed(2)}rem, ${mode === "intellectual" ? (BASE_MODAL_WIDTH_VW * EXECUTIVE_SCALE).toFixed(2) : String(BASE_MODAL_WIDTH_VW)}vw), ${MODAL_MAX_PX}px, 92vw, ${PAGE_WIDTH_VAR}, 100%)`;
  // a page that asks for a width of its own (`wide: { maxRem }`) gets that many rem, but never more than the page; every other wide box is the page's width
  const toolRem = toolFormMaxRem(toolForm);
  const currentMaxWidth = toolRem !== null ? `min(${toolRem}rem, ${PAGE_WIDTH_VAR}, 100%)` : wideModal ? `min(${PAGE_WIDTH_VAR}, 100%)` : normalMaxWidth;

  const handleCloseAll = () => {
    setSelectedCircularId(null);
    setIsOpen(false);
  };

  const handleCloseLightbox = () => {
    setSelectedCircularId(null);
    setSourceViewer(null);
    setAnswerQuote(null);
    setBannerDismissed(false);
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading && mode === "intellectual") {
      setLoadingStep(0);
      timer = setInterval(() => {
        setLoadingStep((prev) => (prev < 2 ? prev + 1 : prev));
      }, 900);
    }
    return () => clearInterval(timer);
  }, [isLoading, mode]);

  // Lock background page scroll while the omnibar is open so mouse-wheel
  // scrolling inside the reply modal never bleeds through to the home page.
  // Compensate for the scrollbar width so the page doesn't shift on lock.
  useEffect(() => {
    if (!isOpen) return;
    const html = document.documentElement;
    // one shared lock (src/lib/ui/scrollLock.ts): the last window to let go restores the page, in whatever order the windows close
    const lock = lockPageScroll();
    const scrollBarWidth = lock.scrollBarWidth;
    // The page stays centred in (screen - scrollbar) because of that padding, but the box's own row (fixed, inset 0) spans the whole screen once the scrollbar is gone: the box
    // sat half a scrollbar (about 7 px) to the right of the page behind it. The row takes the same room on its right (--scrollbar-comp, used below), so both share one centre.
    html.style.setProperty("--scrollbar-comp", `${scrollBarWidth}px`);
    return () => {
      lock.release();
      html.style.removeProperty("--scrollbar-comp");
    };
  }, [isOpen]);

  // A sample question of the user guide ("Try it") is typed into the box; it is NOT sent: the reader edits any [blank] and presses Enter
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const text = (e as CustomEvent<{ query?: string }>).detail?.query;
      if (typeof text !== "string" || !text.trim()) return;
      setQuery(text);
      window.setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        const open = text.indexOf("[");
        if (open >= 0 && text.indexOf("]", open) > open) el.setSelectionRange(open, text.indexOf("]", open) + 1); // the first blank is selected, ready to be typed over
        else el.setSelectionRange(text.length, text.length);
      }, 160);
    };
    window.addEventListener(OMNIBAR_PREFILL_EVENT, onPrefill);
    return () => window.removeEventListener(OMNIBAR_PREFILL_EVENT, onPrefill);
  }, [setQuery]);

  useEffect(() => {
    if (isOpen && !selectedCircularId) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen, selectedCircularId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If lightbox is open, let lightbox handle its own Escape key
      if (selectedCircularId) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleCloseAll();
      }
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        handleCloseAll();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedCircularId]);

  const loadingMessages = [
    "Consulting executive knowledge base...",
    "Synthesizing cross-departmental circulars...",
    "Preparing deep strategic insights, this may take a brief moment...",
  ];

  const handleResultClick = (
    e: React.MouseEvent,
    result: (typeof results)[0],
  ) => {
    if (result.type === "circular") {
      e.preventDefault();
      setBannerDismissed(false);
      setSelectedCircularId(result.id);
      return;
    }
    if (result.type === "announcement") {
      e.preventDefault();
      // a result found inside the PDF: the window shows the PDF at that page
      openAnnouncement(realSourceId(result.id), result.matchInPdf ? result.matchPage ?? null : null);
    }
  };

  // Search rows carry only plain text; fetch the full announcement (with its rich-text HTML) so the modal renders formatting correctly.
  const openAnnouncement = (id: number, pdfPage: number | null) => {
    fetch(`/api/announcements/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setSelectedAnnouncement({ ...data, pdfPage });
      })
      .catch(() => {
        // Non-fatal: if the fetch fails, simply do nothing.
      });
  };

  // A source of a deep summary: a circular (its viewer) or an announcement (its window). An announcement travels under a moved number (sourceKey.ts).
  const openEdsSource = (id: number) => {
    if (isAnnouncementSourceId(id)) openAnnouncement(realSourceId(id), null);
    else setSelectedCircularId(id);
  };

  const activeMatchedCircular = selectedCircularId
    ? results.find((r) => r.id === selectedCircularId)
    : null;
  // One row (a lookup of one person or one ticket): the big number and "1 row." add nothing, the table shows it.
  const hideRowCount = !!analytics && isSingleRowTable(analytics.kind, analytics.count, !!analytics.nl2sql?.table);
  // An answer that is a sentence written for the question (an empty health check-up answer) keeps its text but has no big number above it.
  const hideCountNumber = hideRowCount || !!analytics?.nl2sql?.plainAnswer || !!analytics?.holidayCompare;

  return (
    <>
      {/* Every opening gets its own AnimatePresence (key={openings}): a closing animation that is still running, or that ever stuck, can never meet the next opening's box. And a window that is
          only fading out catches no clicks (its exit sets pointerEvents none: AnimatePresence keeps the element as it was drawn, so a condition on isOpen would never reach it): a layer left over its fade can never swallow the click on the search bar behind it. */}
      <AnimatePresence key={openings}>
        {isOpen && !selectedCircularId && !selectedAnnouncement && (
          <motion.div exit={{ pointerEvents: "none", transition: { duration: 0 } }} className="fixed inset-0 z-[100] flex items-start justify-center pt-12 sm:pt-14 px-4" style={{ paddingRight: "calc(1rem + var(--scrollbar-comp, 0px))" }}>
            {/* The dimming covers the whole screen, but the BLUR only covers the page behind the box (same width and centre as the page: --omni-page-width, and the room the
                scrollbar's lock padding leaves). The box is exactly as wide as the page, so a blur over the whole screen smeared the page's dark edge (the banner) a few pixels
                outward, just outside the box's edge: two thin dark lines down both sides (read from a real screenshot: 139 fading to 190 over 4 px). With the blur kept inside the
                page's own footprint nothing is smeared outside it. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseAll}
              className="fixed inset-0 bg-neutral-900/40"
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseAll}
              className="fixed inset-y-0 left-0 mx-auto backdrop-blur-sm"
              style={{ right: "var(--scrollbar-comp, 0px)", width: PAGE_WIDTH_VAR, maxWidth: "100%" }}
            />

            {/* Step 62a: NO `layout` prop on this box. With a classic (always visible) scrollbar the page width changes by the scrollbar's width when the scroll lock above is set and
                released; the box's layout animation then ran against its exit animation, and AnimatePresence deleted the NEW box 3 ms after it appeared: after the first closing the
                click on the search bar did nothing (a blue ring only) and the first Ctrl+K "closed" the already hidden box. Reproduced in Chrome, fixed by removing `layout`
                (src/components/OmnibarModal.layout.selftest.ts keeps it out). The box keeps its fade and slide; only the height no longer glides when an answer arrives. */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
                maxWidth: currentMaxWidth,
              }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{
                layout: { type: "spring", stiffness: 380, damping: 26 },
                duration: 0.25,
              }}
              ref={modalRef}
              style={{ "--omni-k": Number((omniK * MODAL_TEXT_FACTOR).toFixed(4)) } as React.CSSProperties}
              className="omni-scale relative w-full bg-white rounded-xl shadow-2xl overflow-hidden border border-neutral-200 flex flex-col max-h-[calc(100vh-5.5rem)]"
            >
              {pageAlone && <span data-escape-back="true" hidden />}
              {/* the box, the choices and what hangs under them are left out while the Utility Services page stands alone (utilityFocus) */}
              {!pageAlone && (
              <>
              {/* Multiline Search Input Header */}
              <div className="flex items-start px-4 py-3.5 border-b border-neutral-200 gap-3">
                <Search className="h-5 w-5 text-neutral-400 mt-2 shrink-0" />
                <textarea
                  ref={textareaRef}
                  rows={3}
                  value={query}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQuery(val);
                    if (toolForm) setToolForm(null); // editing the text closes a calculator that Enter had opened
                    if (routed || routedQuery || understanding) forgetRoute(); // ... and a utility that was found from the old line
                    if (val.trim() === "" || isIdQuery(val.trim())) {
                      employeeReq.current++; // an answer still on its way for the old text must not land
                      setEmployeeResults([]);
                      clearSearch();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      handleCloseAll();
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const qTrim = (query || "").trim();
                      if (qTrim.length < 2) return;
                      if (routed) return; // the utility found from this very line is already open

                      // A calculator: a sum, a conversion or a date question already shows its answer (as you type); a request for a calculator form opens it now. Either way the line
                      // is NEVER sent to the search: a figure of someone's loan, pay or savings is not logged anywhere.
                      // under a chosen button no utility opens from the typed words (the Utility Services page is a button of its own)
                      const tool = detectTool(qTrim);
                      if (tool && selection.scope === "auto") {
                        if (tool.kind === "form") setToolForm(tool.form);
                        else if (isListPage(tool.kind)) setToolForm(tool.kind);
                        return;
                      }

                      // A FIXED SELECTION (src/records/): the line is answered by that selection's own engines and nowhere else (no utility is guessed, no other record is tried). Circulars & Notices
                      // keep the ordinary path below, minus the people name search and the utility guesses. (No utility opens from typed words under a chosen button: Utility Services is a button of its own.)
                      if (selection.scope === "eds") {
                        runEds(qTrim);
                        return;
                      }
                      if (selection.scope !== "auto" && selection.scope !== "documents") {
                        if (selection.scope === "people" && selection.facet === "roster") return; // the two lists and their button (RecordsScopeBar) run it
                        runScoped(qTrim);
                        return;
                      }

                      // ID Query: ticket, mobile, CUG, SAIL PNO (already handled live).
                      // Keep employee results and NEVER send an ID to circular search!
                      if (isIdQuery(qTrim)) {
                        if (employeeResults.length === 0) void fetchEmployees("id", qTrim);
                        return;
                      }

                      // THE MANAGEMENT PAGE ("management", "admin"...): the server answers it from the words alone, so it is sent at once. It must not wait for the AI that is asked "which utility do you mean" (a call to the model, up to 5 seconds,
                      // with "Understanding your request" on the screen) nor start the people name search (database time, and people shown under a page of titles): neither has anything to add for a line that is the page's own words.
                      if (detectManagementHubIntent(qTrim)) {
                        setEmployeeResults([]);
                        triggerSearch("semantic");
                        return;
                      }

                      // WHAT THE LINE MEANS, when no exact reader has it. First what the app can tell by itself (instant, nothing leaves the browser): a utility the line is clearly about opens, and the
                      // line is not searched. Then, for a whole sentence that could be neither a name nor an ID, the AI is asked which utility it means (only the line goes, src/lib/tools/intentAi.ts);
                      // its answer is a utility id or none. Failing both, or on none, the line is searched as it always was.
                      // a chosen button (Circulars & Notices too) is not second-guessed: no utility is guessed from its words
                      if (selection.scope === "auto") {
                        const understood = clearIntent(qTrim);
                        if (understood) {
                          openRouted(understood.id, "local");
                          return;
                        }
                      }
                      // AN EDS-KIND QUESTION FROM A VISITOR WHO IS SIGNED OUT: nothing is searched yet; the bar asks "Are you an executive?" (Yes: sign in to get the EDS reply; No: the simple reply).
                      if (shouldAskExecutive({ authStatus, query: qTrim, edsEnabled: autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: process.env.NEXT_PUBLIC_FRONT_PATH_AUTO_EDS }) })) {
                        setExecutiveAsk({ query: qTrim, said: null });
                        setDeclinedAsk(null);
                        return;
                      }
                      const proceed = () => {
                        // Smart Enter: fire ALL deterministic channels at once —
                        // employee name search + employee/department analytics +
                        // circular/announcement Smart Semantic. IDs & sites are
                        // already live as you type.
                        // Step 27a, ON by default since step 41a (kill switch NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=false): for a LOGGED-IN EXECUTIVE a question that needs
                        // several circulars built into one answer (compare / correlate / what is hidden / what changed ...: see
                        // src/lib/search/synthesisIntent.ts) starts Executive Deep Synthesis BY ITSELF (there is no button any more):
                        // same processing panel, same briefing. The server verifies the executive again. Anyone else, and every
                        // other question, takes the normal Enter path.
                        if (
                          isExecutive &&
                          autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: process.env.NEXT_PUBLIC_FRONT_PATH_AUTO_EDS }) &&
                          detectSynthesisIntent(query).synthesis
                        ) {
                          if (!isLoading) triggerSearch("intellectual", { auto: true });
                        } else {
                          // the people name search is for what can be a NAME (one to four words, not a question): a sentence only burned 1 to 7 s of database time (step 61a)
                          if (selection.scope === "auto" && query.trim().length >= 2 && looksLikeNameSearch(query)) {
                            runEmployeeNameSearch();
                          } else {
                            setEmployeeResults([]);
                          }
                          triggerSearch("semantic");
                        }
                      };
                      const synthesis = isExecutive && autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: process.env.NEXT_PUBLIC_FRONT_PATH_AUTO_EDS }) && detectSynthesisIntent(query).synthesis;
                      if (!synthesis && worthAsking(qTrim) && selection.scope === "auto") {
                        const mine = ++routeReq.current;
                        setUnderstanding(true);
                        const ctl = new AbortController();
                        const timer = setTimeout(() => ctl.abort(), 5000);
                        void askIntent(qTrim, ctl.signal).then((pick) => {
                          clearTimeout(timer);
                          if (routeReq.current !== mine) return; // the text was edited meanwhile
                          if (pick) openRouted(pick.id, "ai");
                          else { setUnderstanding(false); proceed(); }
                        });
                        return;
                      }
                      proceed();
                    }
                  }}
                  placeholder={placeholderText}
                  className="flex-1 bg-transparent text-sm sm:text-base text-neutral-900 placeholder-neutral-400 focus:outline-none resize-none leading-relaxed overflow-y-auto max-h-24 py-1"
                />
                {isLoading && mode !== "intellectual" && (
                  <Loader2 className="h-5 w-5 animate-spin text-primary-600 mt-2 shrink-0" />
                )}
                <div className="flex items-center gap-2 border-l border-neutral-200 pl-3 ml-1 mt-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleCloseAll}
                    className="hidden sm:inline-block focus:outline-none group"
                  >
                    <kbd className="px-2 py-1 text-xs font-semibold text-neutral-500 bg-neutral-100 rounded border border-neutral-300 group-hover:bg-neutral-200 group-hover:text-neutral-700 transition-colors cursor-pointer">
                      ESC
                    </kbd>
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseAll}
                    className="p-1 hover:bg-neutral-100 rounded-md transition-colors"
                  >
                    <X className="h-5 w-5 text-neutral-500" />
                  </button>
                </div>
              </div>

              {/* Step 41a: no Executive Deep Synthesis button any more. The Enter key decides (see the Enter handler above). */}

              {/* The fixed selections (src/records): Everything, People, PAX, Hospital OPD, Holidays, Degrees, Circulars & Notices. */}
              <RecordsScopeBar selection={selection} onChange={changeSelection} suggestion={selection.scope === "auto" ? suggestion : null} onExample={selection.scope === "eds" ? runEds : runScoped} onRunFinder={runFinder} utilitiesOpen={toolForm === "services"} onUtilities={openUtilities} notice={edsNote} edsReady={authStatus === "authenticated" && isExecutive} adminReady={authStatus === "authenticated"} onAdminHint={() => { if (authStatus === "authenticated") preloadManagementPanels(); if (authStatus === "authenticated") prefetchSearch("semantic", "management", { ...AUTO_SELECTION, scope: "admin" }); }} />

              {nameNotice && <FormerNameNotice notice={nameNotice} />}
              {executiveAsk && (
                <OmniExecutiveAsk
                  ask={executiveAsk}
                  onYes={() => { setExecutiveAsk({ ...executiveAsk, said: "yes" }); openModal(); }} // Yes is the click on Sign in: the login window opens at once
                  onNo={() => {
                    // the EDS button pressed with no question yet: No goes back to the default choice, Everything, with the box empty (every way back lands on Everything)
                    if (executiveAsk.query === "") { changeSelection({ ...AUTO_SELECTION }); return; }
                    // No: the simple reply, exactly as for any other question
                    const q = executiveAsk.query;
                    setExecutiveAsk(null);
                    setDeclinedAsk(q);
                    if (looksLikeNameSearch(q)) runEmployeeNameSearch(); else setEmployeeResults([]);
                    triggerSearch("semantic");
                  }}
                />
              )}
              {adminAsk && (
                <OmniAdminAsk
                  said={adminAsk.said}
                  onYes={() => { setAdminAsk({ said: "yes" }); openModal(); }} // Yes is the click on Sign in: the login window opens at once; once signed in, the authority is checked
                  onNo={() => changeSelection({ ...AUTO_SELECTION })} // every way back lands on Everything
                />
              )}
              {loginHint && <OmniLoginHint hint={loginHint} onSignIn={openModal} />}
              </>
              )}

              <div className="scrollbar-thin overflow-y-auto overscroll-contain p-2 flex-1">
                {isLoading && mode === "intellectual" ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-600 mb-4" />
                    <div className="flex flex-col gap-2.5 max-w-md w-full">
                      {loadingMessages.map((msg, idx) => (
                        <motion.div
                          key={msg}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{
                            opacity: idx <= loadingStep ? 1 : 0.3,
                            y: idx <= loadingStep ? 0 : 4,
                          }}
                          transition={{ duration: 0.3 }}
                          className={`text-sm font-medium flex items-center justify-center gap-2 ${
                            idx === loadingStep
                              ? "text-amber-800 font-semibold"
                              : "text-neutral-400"
                          }`}
                        >
                          <span>{msg}</span>
                          {idx === loadingStep && (
                            <span className="flex gap-1">
                              <span className="animate-bounce">•</span>
                              <span className="animate-bounce [animation-delay:0.2s]">
                                •
                              </span>
                              <span className="animate-bounce [animation-delay:0.4s]">
                                •
                              </span>
                            </span>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Calculators, converters and date answers: as you type, or a form after Enter. Runs in the browser; nothing typed here is stored or sent. */}
                    {understanding && (
                      <div role="status" className="mb-3 flex items-center gap-2 rounded-2xl border border-dashed border-violet-300 bg-violet-50 px-4 py-2.5 text-sm text-violet-900">
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" /> Understanding your request&hellip;
                      </div>
                    )}
                    {clearHit && !understanding && (
                      <div data-intent-hint className="mb-3 flex items-center gap-2 rounded-2xl border border-dashed border-sky-300 bg-gradient-to-r from-sky-50 to-indigo-50 px-4 py-2.5 text-sm text-sky-900">
                        <span>Looks like <strong>{intentById(clearHit.id)?.title}</strong>. Press <kbd className="rounded-md border border-sky-300 bg-white px-2 py-0.5 text-xs font-bold shadow-sm">Enter</kbd> to open it.</span>
                      </div>
                    )}
                    {nameHint && !clearHit && !understanding && (
                      <div data-name-hint={nameHint.basis} className="mb-3 flex items-center gap-2 rounded-2xl border border-dashed border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2.5 text-sm text-emerald-900">
                        <UserRound size={16} className="shrink-0 text-emerald-700" aria-hidden="true" />
                        <span>
                          Looks like a name{nameHint.wordCount === 1 ? " (or part of one)" : ""}. Press <kbd className="rounded-md border border-emerald-300 bg-white px-2 py-0.5 text-xs font-bold shadow-sm">Enter</kbd> to search people.{" "}
                          <span className="text-xs text-emerald-800/70">
                            {nameHint.basis === "plant" ? "Found in the DSP name list." : nameHint.basis === "builtin" ? "A common Indian name." : `Similar to ${nameHint.similarTo?.took} in the DSP name list.`}
                          </span>
                        </span>
                      </div>
                    )}
                    {routed && (
                      <div data-intent-routed={routed.id} className="mb-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs leading-snug text-emerald-900">
                        Understood as <strong>{intentById(routed.id)?.title}</strong>.
                        {routed.via === "ai" ? " Gemini, the AI, was shown only the line you typed, to find the right utility; nothing you enter in the utility is sent to it." : " Found from the words of your line, in your browser; nothing was sent anywhere."}
                      </div>
                    )}
                    {hubTyped && (
                      <div data-management-hint className="mb-3 flex items-center gap-3 rounded-2xl border border-dashed border-sky-300 bg-gradient-to-r from-sky-50 to-indigo-50 px-4 py-3 text-sm text-sky-900 shadow-sm">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-500 text-white"><ShieldCheck size={16} aria-hidden="true" /></span>
                        <span>Press <kbd className="rounded-md border border-sky-300 bg-white px-2 py-0.5 text-xs font-bold shadow-sm">Enter</kbd> to open the management page.</span>
                      </div>
                    )}
                    <ToolPanel query={routedQuery ?? (selection.scope === "auto" ? query : "")} form={toolForm} onForm={setToolForm} />

                    {error && (
                      <div className="p-4 text-center text-red-600 text-sm font-medium">
                        Failed to perform search. Please try again.
                      </div>
                    )}

                    {/* Employee analytics answer (Smart Semantic, DB-grounded) */}
                    {!isLoading && analytics && (
                      <div
                        className={`mb-3 rounded-xl border p-4 ${
                          analytics.kind === "error"
                            ? "border-red-200 bg-red-50"
                            : "border-blue-100 bg-blue-50/60"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white ${
                              analytics.kind === "error" ? "bg-red-600" : "bg-blue-600"
                            }`}
                          >
                            {analytics.kind === "error" ? (
                              <AlertTriangle size={16} />
                            ) : (
                              <UserRound size={16} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <AnswerHeadline headline={analytics.headline} />
                            {typeof analytics.count === "number" &&
                              analytics.kind !== "breakdown" &&
                              !hideCountNumber &&
                              !analytics.headline && (
                                <div className="text-2xl font-bold leading-tight text-blue-900">
                                  {analytics.count.toLocaleString()}
                                </div>
                              )}
                            {analytics.lead && (
                              <p className="mb-2 text-sm font-semibold text-neutral-800">{analytics.headline ? afterVerdict(analytics.lead) : analytics.lead}</p>
                            )}
                            {(analytics.paxAdmin || analytics.employeeAdmin || analytics.holidayAdmin || analytics.circularAdmin || analytics.announcementAdmin || analytics.accessLogAdmin) && (
                              <ManagementBack onBack={() => triggerSearch("semantic", { query: "management" })} />
                            )}
                            {analytics.managementGate ? (
                              <ManagementGatePanel gate={analytics.managementGate} onSignIn={openModal} onClose={closeManagement} />
                            ) : analytics.managementHub ? (
                              <ManagementHubPanel open={analytics.managementHub} onOpen={(phrase) => triggerSearch("semantic", { query: phrase })} onPrefetch={(phrase) => prefetchSearch("semantic", phrase)} onClose={closeManagement} />
                            ) : analytics.paxAdmin ? (
                              <PaxAdminPanel open={analytics.paxAdmin} />
                            ) : analytics.employeeAdmin ? (
                              <EmployeeAdminPanel open={analytics.employeeAdmin} />
                            ) : analytics.holidayAdmin ? (
                              <HolidayAdminPanel open={analytics.holidayAdmin} />
                            ) : analytics.circularAdmin ? (
                              <CircularAdminPanel open={analytics.circularAdmin} />
                            ) : analytics.announcementAdmin ? (
                              <AnnouncementAdminPanel open={analytics.announcementAdmin} />
                            ) : analytics.accessLogAdmin ? (
                              <AccessLogAdminPanel open={analytics.accessLogAdmin} />
                            ) : analytics.hospital ? (
                              <HospitalAnswerCard answer={analytics.hospital} onAsk={(text) => triggerSearch("semantic", { query: text })} />
                            ) : analytics.holidayCompare ? (
                              <HolidayCompareCard view={analytics.holidayCompare} />
                            ) : analytics.holidayDetails && analytics.holidayDetails.length > 0 ? (
                              <HolidayAnswerCard details={analytics.holidayDetails} />
                            ) : hideRowCount ? null : (
                              <p
                                className={`text-sm ${
                                  analytics.kind === "error"
                                    ? "font-semibold text-red-700"
                                    : "text-neutral-700"
                                }`}
                              >
                                {analytics.kind === "error" && "Bad query: "}
                                <FormattedAnswerText text={analytics.headline ? afterVerdict(analytics.answer) : analytics.answer} />
                              </p>
                            )}
                            {analytics.kind === "clarify" && analytics.ask && (
                              <ClarifyChoices key={analytics.answer} ask={analytics.ask} onAsk={(text) => triggerSearch("semantic", { query: text })} />
                            )}
                            {analytics.notice && (
                              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                                <span>{analytics.notice}</span>
                              </p>
                            )}
                            {/* the model's own "Understood as" line is not shown (22 Nov 2026); the lookups that are not written by the model (PAX, dates, holidays ...) keep theirs, it carries their source and limits */}
                            {analytics.interpretation && !analytics.nl2sql && (
                              <InterpretationNote text={analytics.interpretation} />
                            )}
                            {typeof analytics.pendingPatternId === "number" && authStatus === "authenticated" && (
                              <PatternFeedbackBar
                                key={analytics.pendingPatternId}
                                patternId={analytics.pendingPatternId}
                              />
                            )}
                            {analytics.nl2sql && (
                              <Nl2SqlAnswerExtras
                                key={analytics.nl2sql.logId ?? analytics.answer}
                                nl2sql={analytics.nl2sql}
                              />
                            )}
                            {analytics.typeBreakdown &&
                              analytics.typeBreakdown.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {analytics.typeBreakdown.map((b) => (
                                    <div
                                      key={b.type}
                                      className="flex min-w-[64px] flex-col items-center rounded-lg border border-blue-100 bg-white px-3 py-1.5"
                                    >
                                      <span className="text-base font-bold leading-tight text-blue-900">
                                        {b.count}
                                      </span>
                                      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                        {b.type}
                                      </span>
                                    </div>
                                  ))}
                                  {typeof analytics.rawEntryCount === "number" &&
                                    typeof analytics.count === "number" &&
                                    analytics.rawEntryCount > analytics.count && (
                                      <span className="self-center pl-1 text-xs text-neutral-500">
                                        {analytics.rawEntryCount} entries total —{" "}
                                        {analytics.rawEntryCount - analytics.count} day
                                        {analytics.rawEntryCount - analytics.count === 1
                                          ? ""
                                          : "s"}{" "}
                                        counted under two types
                                      </span>
                                    )}
                                </div>
                              )}
                            {analytics.rhQuotaByCategory &&
                              analytics.rhQuotaByCategory.length > 0 && (
                                <div className="mt-2">
                                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                    RH Quota by Category
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {analytics.rhQuotaByCategory.map((q) => (
                                      <div
                                        key={q.category}
                                        className="flex min-w-[52px] flex-col items-center rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-1.5"
                                      >
                                        <span className="text-base font-bold leading-tight text-amber-800">
                                          {q.quota}
                                        </span>
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                          Cat {q.category}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            {analytics.categoryLabels && (
                              <div className="mt-2 space-y-0.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                  Category Key
                                </p>
                                {Object.entries(analytics.categoryLabels).map(
                                  ([letter, desc]) => (
                                    <div
                                      key={letter}
                                      className="flex items-baseline gap-2 text-xs text-neutral-600"
                                    >
                                      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-neutral-200 text-[10px] font-bold text-neutral-700">
                                        {letter}
                                      </span>
                                      <span>{desc}</span>
                                    </div>
                                  ),
                                )}
                              </div>
                            )}
                            {analytics.kind === "breakdown" &&
                              analytics.rows &&
                              analytics.rows.length > 0 && (
                                <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-blue-100 bg-white">
                                  <table className="w-full text-sm">
                                    <tbody>
                                      {analytics.rows.map((r, i) => {
                                        const prev = analytics.rows![i - 1];
                                        const showHeader =
                                          !prev || prev.class !== r.class;
                                        const groupLabel =
                                          r.class === "exec"
                                            ? "Executives"
                                            : r.class === "medical"
                                              ? "Medical & Health Services"
                                              : r.class === "nonexec"
                                                ? "Non-executives"
                                                : "Other";
                                        return (
                                          <React.Fragment key={r.designation}>
                                            {showHeader && (
                                              <tr className="bg-blue-50/70">
                                                <td
                                                  colSpan={2}
                                                  className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-700"
                                                >
                                                  {groupLabel}
                                                </td>
                                              </tr>
                                            )}
                                            <tr className="border-t border-neutral-100">
                                              <td className="px-3 py-1.5 text-neutral-700">
                                                {r.short}
                                              </td>
                                              <td className="px-3 py-1.5 text-right font-semibold text-neutral-900">
                                                {r.count.toLocaleString()}
                                              </td>
                                            </tr>
                                          </React.Fragment>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* The answer's rows: person cards, a table or a chart (AnswerResult adapts to what the SQL returned);
                        answers from the older engines keep showing just the person cards. */}
                    {!isLoading &&
                      (() => {
                        // the first page plus any pages fetched with "Show more"
                        const nl = analytics?.nl2sql;
                        const mergedTable =
                          nl?.table && moreNow
                            ? mergePage(nl.table, { rows: moreNow.rows, total: moreNow.total ?? nl.table.total, hasMore: moreNow.hasMore })
                            : nl?.table;
                        const mergedNl = nl ? { ...nl, ...(mergedTable ? { table: mergedTable } : {}), canPage: moreNow ? moreNow.hasMore : nl.canPage } : null;
                        const mergedPeople: any[] = [...(analytics?.people ?? []), ...(moreNow?.people ?? [])];
                        const morePanel =
                          mergedNl?.canPage && mergedTable
                            ? {
                                shown: mergedTable.rows.length,
                                total: mergedTable.total,
                                loading: moreNow?.loading ?? false,
                                error: moreNow?.error ?? null,
                                locked: authStatus !== "authenticated",
                                onMore: loadMore,
                              }
                            : null;
                        const peopleBlock =
                          mergedPeople.length > 0 ? (
                        <div
                          className={`flex flex-col gap-1 p-1 mb-2 ${
                            authStatus === "authenticated"
                              ? "select-text"
                              : "select-none"
                          }`}
                          onCopy={
                            authStatus !== "authenticated"
                              ? (e) => e.preventDefault()
                              : undefined
                          }
                          onContextMenu={
                            authStatus !== "authenticated"
                              ? (e) => e.preventDefault()
                              : undefined
                          }
                        >
                          <h4 className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            People
                            {mergedTable
                              ? mergedTable.truncated
                                ? ` (${mergedPeople.length.toLocaleString()} of ${mergedTable.total.toLocaleString()})`
                                : ""
                              : analytics?.listTruncated
                                ? " (first 100)"
                                : ""}
                          </h4>
                          {(() => {
                            const list = mergedPeople;
                            const row = (emp: any, hideDepartment: boolean) => (
                              <PersonRow
                                key={`ap-${emp.id}`}
                                emp={emp}
                                rev={revealed[emp.id] || {}}
                                authStatus={authStatus}
                                copiedId={copiedId}
                                onReveal={revealContact}
                                onCopy={copyRecord}
                                notice={revealNotice && revealNotice.empId === emp.id ? revealNotice.text : null}
                                hideDepartment={hideDepartment}
                              />
                            );
                            const groups = departmentGroups(list);
                            if (!groups) return list.map((emp) => row(emp, false));
                            return groups.map((g, gi) => (
                              <div key={`grp-${gi}`} className="flex flex-col gap-1">
                                <div className="mt-2 flex items-center gap-2 border-b border-slate-200/80 px-2 pb-1 pt-1">
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{g.label}</span>
                                  {g.code && (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{g.code}</span>
                                  )}
                                  <span className="ml-auto text-[11px] text-slate-400">
                                    {g.people.length} {g.people.length === 1 ? "person" : "people"}
                                  </span>
                                </div>
                                {g.people.map((emp) => row(emp, true))}
                              </div>
                            ));
                          })()}
                        </div>
                          ) : null;
                        if (mergedNl && (mergedNl.table || peopleBlock)) {
                          return (
                            <AnswerResult
                              key={mergedNl.logId ?? mergedNl.sql}
                              nl2sql={mergedNl}
                              authenticated={authStatus === "authenticated"}
                              peopleView={peopleBlock}
                              more={morePanel}
                              onOpenCircular={(circularId, pages) => {
                                setBannerDismissed(false);
                                setSourceViewer({ pages });
                                setSelectedCircularId(circularId);
                              }}
                            />
                          );
                        }
                        return peopleBlock;
                      })()}

                    {/* Analytics holiday list (Stage 2 — holiday list/breakdown queries) */}
                    {!isLoading &&
                      analytics?.holidays &&
                      analytics.holidays.length > 0 &&
                      (() => {
                        // Group same-date, same-name rows (the documented
                        // dual FH/RH pattern -- see the holidays/analytics.ts
                        // header comment on "the same holiday, same year"
                        // pattern) into one table row with a tick in each
                        // applicable type column, instead of showing two
                        // separate stacked entries for what is really one
                        // holiday. Grouped by (date + name) specifically,
                        // not date alone -- two genuinely different
                        // holidays can share a date (e.g. Doljatra / Holi)
                        // and must stay as separate rows.
                        //
                        // Category applicability (A/B/C/D) differs by TYPE,
                        // not just by holiday, so it's computed per group
                        // from whichever type rows are present:
                        //  - CH -> every category, always (no per-row data
                        //    needed; this is a confirmed domain fact, not a
                        //    guess -- see employees/analytics.ts's CH
                        //    category-filter handling).
                        //  - FH -> exactly the categories that row's own
                        //    `categories` field names.
                        //  - RH -> NOT ticked here. The RH pool is available
                        //    to every category, so ticking all four would be
                        //    technically true but would hide the one fact
                        //    that actually differs per category: the quota.
                        //    That's shown once, above the table, from
                        //    rhQuotaByCategory -- see the chip row in the
                        //    summary card.
                        const ALL_CATEGORIES = ["A", "B", "C", "D"];
                        type GroupedHoliday = {
                          key: string;
                          date: string;
                          name: string;
                          aliases: string[] | null;
                          types: Set<string>;
                          categories: Set<string>;
                        };
                        const groups = new Map<string, GroupedHoliday>();
                        for (const h of analytics.holidays as any[]) {
                          const key = `${h.date}|${h.name}`;
                          let existing = groups.get(key);
                          if (!existing) {
                            existing = {
                              key,
                              date: h.date,
                              name: h.name,
                              aliases: h.aliases ?? null,
                              types: new Set(),
                              categories: new Set(),
                            };
                            groups.set(key, existing);
                          }
                          existing.types.add(h.type);
                          if (h.type === "CH") {
                            ALL_CATEGORIES.forEach((c) => existing!.categories.add(c));
                          } else if (h.type === "FH" && h.categories) {
                            String(h.categories)
                              .split(/[,&\s]+/)
                              .map((c: string) => c.trim().toUpperCase())
                              .filter((c: string) => ALL_CATEGORIES.includes(c))
                              .forEach((c: string) => existing!.categories.add(c));
                          }
                        }
                        const rows = Array.from(groups.values()).sort((a, b) =>
                          a.date.localeCompare(b.date),
                        );

                        return (
                          <div className="flex flex-col gap-1 p-1 mb-2">
                            <h4 className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                              Holidays
                            </h4>
                            <div className="scrollbar-thin overflow-x-auto overflow-y-visible rounded-lg border border-neutral-200">
                              <table className="w-full text-sm border-collapse">
                                <thead>
                                  <tr className="sticky top-0 z-10 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
                                    <th className="px-3 py-2 font-semibold whitespace-nowrap">
                                      Date
                                    </th>
                                    <th className="px-3 py-2 font-semibold">
                                      Holiday
                                    </th>
                                    <th className="w-14 px-3 py-2 text-center font-semibold">
                                      RH
                                    </th>
                                    <th className="w-14 px-3 py-2 text-center font-semibold">
                                      CH
                                    </th>
                                    <th className="w-14 px-3 py-2 text-center font-semibold">
                                      FH
                                    </th>
                                    <th className="w-10 border-l border-neutral-200 px-2 py-2 text-center font-semibold">
                                      A
                                    </th>
                                    <th className="w-10 px-2 py-2 text-center font-semibold">
                                      B
                                    </th>
                                    <th className="w-10 px-2 py-2 text-center font-semibold">
                                      C
                                    </th>
                                    <th className="w-10 px-2 py-2 text-center font-semibold">
                                      D
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((r) => (
                                    <tr
                                      key={r.key}
                                      className="border-t border-neutral-100 hover:bg-neutral-50"
                                    >
                                      <td className="whitespace-nowrap px-3 py-2 text-neutral-700">
                                        {DateTime.fromISO(r.date).toFormat("d LLL yyyy")}
                                      </td>
                                      <td className="px-3 py-2 text-neutral-800">
                                        <span className="font-semibold">{r.name}</span>
                                        {r.aliases && r.aliases.length > 0 && (
                                          <span className="text-neutral-400">
                                            {" "}
                                            ({r.aliases.join(", ")})
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {r.types.has("RH") && (
                                          <span className="font-bold text-black">✓</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {r.types.has("CH") && (
                                          <span className="font-bold text-black">✓</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {r.types.has("FH") && (
                                          <span className="font-bold text-black">✓</span>
                                        )}
                                      </td>
                                      {ALL_CATEGORIES.map((c, i) => (
                                        <td
                                          key={c}
                                          className={`px-2 py-2 text-center ${i === 0 ? "border-l border-neutral-200" : ""}`}
                                        >
                                          {r.categories.has(c) && (
                                            <span className="font-bold text-black">✓</span>
                                          )}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <p className="px-2 pt-1 text-[11px] text-neutral-400">
                              A–D columns show Closed and Festival holiday
                              eligibility only. Restricted Holidays are a
                              shared pool every category can pick from
                              {analytics.rhQuotaByCategory &&
                              analytics.rhQuotaByCategory.length > 0
                                ? " — see the RH quota above for how many each category gets."
                                : "."}
                            </p>
                          </div>
                        );
                      })()}


                    {!isLoading &&
                      mode !== null &&
                      !isStale &&
                      query.trim().length >= 3 &&
                      !analytics &&
                      results.length === 0 &&
                      siteResults.length === 0 &&
                      employeeResults.length === 0 &&
                      !error && (
                        <div className="p-8 text-center text-neutral-500">
                          No results found for &quot;{query}&quot;
                        </div>
                      )}

                    {/* People (employee directory) — live ID lookups + Enter name search */}
                    {extraEmployees.length > 0 && (
                      <div
                        className={`flex flex-col gap-1 p-1 mb-2 ${
                          authStatus === "authenticated"
                            ? "select-text"
                            : "select-none"
                        }`}
                        onCopy={
                          authStatus !== "authenticated"
                            ? (e) => e.preventDefault()
                            : undefined
                        }
                        onContextMenu={
                          authStatus !== "authenticated"
                            ? (e) => e.preventDefault()
                            : undefined
                        }
                      >
                        <h4 className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          People
                        </h4>
                        {extraEmployees.map((emp) => (
                          <PersonRow
                            key={`emp-${emp.id}`}
                            emp={emp}
                            rev={revealed[emp.id] || {}}
                            authStatus={authStatus}
                            copiedId={copiedId}
                            onReveal={revealContact}
                            onCopy={copyRecord}
                            notice={revealNotice && revealNotice.empId === emp.id ? revealNotice.text : null}
                          />
                        ))}
                      </div>
                    )}

                    {!isLoading && results.length > 0 && !isIdQuery((query || "").trim()) && (
                      <div className="flex flex-col gap-4 p-1">
                        {mode === "intellectual" && synthesis && (
                          <ExecutiveBriefing
                            data={synthesis}
                            onOpenCircular={openEdsSource}
                            question={submittedQuery}
                          />
                        )}

                        {mode === "semantic" && (
                          <CircularAnswerCard
                            state={circularAnswer}
                            onOpenSource={(id, target, type) => {
                              // an announcement opens in its own window, at the page of the PDF the answer came from; closing it brings this window back as it was
                              if (type === "announcement") {
                                openAnnouncement(id, target?.page ?? null);
                                return;
                              }
                              setBannerDismissed(false);
                              // the viewer opens on the page of the answer and shows the answer's own words (not the search's best clause)
                              setSourceViewer(target?.page ? { pages: [target.page] } : null);
                              setAnswerQuote(target?.quote ? target.quote : null);
                              setSelectedCircularId(id);
                            }}
                          />
                        )}

                        <div className="flex flex-col gap-1">
                          {mode !== "intellectual" && results.length > 0 && results.every((r) => (r as any).weakMatch) && (
                            <p className="mb-1 px-2 text-xs font-medium text-amber-700" data-weak-note="true">
                              {WEAK_NOTE}
                            </p>
                          )}
                          {mode === "intellectual" ? (
                            <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2">
                              Primary Sources
                            </h4>
                          ) : employeeResults.length > 0 && looksLikeNameSearch(submittedQuery) ? (
                            <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2">
                              Mentioned in circulars
                            </h4>
                          ) : answeredKeys.size > 0 && results.some((r) => !answeredKeys.has(`${r.type}-${r.id}`)) ? (
                            <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2">
                              Other matching circulars
                            </h4>
                          ) : null}
                          {/* In synthesis mode, only show cards for sources
                              the synthesis actually cited in a finding (see
                              executiveSynthesis.ts's citation-relevance
                              filter) -- not every raw candidate that merely
                              cleared the upstream search/qualify floor.
                              Every other mode is unaffected: `results`
                              itself is untouched here, this only changes
                              what renders under "Primary Sources" in
                              intellectual mode specifically. Known minor
                              edge case: if `synthesis.citations` ends up
                              empty (a table/chart-only answer with no key
                              findings -- see executiveSynthesis.ts), the
                              "Primary Sources" heading above will still
                              render with no cards beneath it; not fixed
                              here to keep this change small and low-risk. */}
                          {(mode === "intellectual" && synthesis
                            ? results.filter((r) =>
                                synthesis.citations.some((c) => c.id === r.id),
                              )
                            : results.filter((r) => !answeredKeys.has(`${r.type}-${r.id}`))
                          ).map((result) => (
                            <div
                              key={`${result.type}-${result.id}`}
                              onClick={(e) => handleResultClick(e, result)}
                              className={`cursor-pointer flex flex-col gap-2 p-3 rounded-lg border transition-all duration-200 group ${
                                result.isPerfectMatch
                                  ? "bg-amber-50/50 border-amber-300 shadow-sm"
                                  : "border-transparent hover:bg-neutral-100"
                              }`}
                            >
                              {result.type === "circular" ? (
                                <>
                                  <div className="flex items-start gap-4">
                                    <div
                                      className={`p-2 rounded-md ${
                                        result.isPerfectMatch
                                          ? "bg-amber-100 text-amber-700"
                                          : "bg-blue-100 text-blue-700"
                                      }`}
                                    >
                                      <FileText size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span
                                          className={`font-semibold truncate transition-colors ${
                                            result.isPerfectMatch
                                              ? "text-amber-900 group-hover:text-primary-600 group-hover:underline"
                                              : "text-neutral-900 group-hover:text-primary-600 group-hover:underline"
                                          }`}
                                        >
                                          {formatCircularTitle(result.headline)}
                                        </span>
                                        {/* Clean Match Percentage Badge */}
                                        {typeof (result as any)
                                          .matchPercentage === "number" ? (
                                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">
                                            {(result as any).matchPercentage}%
                                            Match
                                          </span>
                                        ) : result.similarity ? (
                                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">
                                            {Math.round(
                                              result.similarity * 100,
                                            )}
                                            % Match
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="flex items-center gap-3 text-xs text-neutral-500 font-medium">
                                        <span className="uppercase tracking-wider">
                                          {result.type}
                                        </span>
                                        <span>&bull;</span>
                                        <span>
                                          {result.publishedAt
                                            ? DateTime.fromISO(
                                                result.publishedAt,
                                              ).toLocaleString(
                                                DateTime.DATE_MED,
                                              )
                                            : "No date"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {result.isPerfectMatch &&
                                    result.chunkText &&
                                    mode === "semantic" && (
                                      <div className="ml-12 mt-2 text-xs text-neutral-800 bg-yellow-50 p-3 rounded-md border border-yellow-200 leading-relaxed shadow-sm">
                                        <div className="font-bold text-yellow-800 uppercase tracking-wider text-[10px] flex items-center gap-1 mb-1.5">
                                          <Sparkles
                                            size={12}
                                            className="text-yellow-600"
                                          />
                                          Exact Match Context:
                                        </div>
                                        <div className="font-medium font-serif italic text-neutral-700">
                                          &quot;
                                          {generateSmartSnippet(
                                            result.chunkText,
                                            query,
                                          )}
                                          &quot;
                                        </div>
                                      </div>
                                    )}
                                </>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-start gap-4">
                                    <div
                                      className={`p-2 rounded-md ${
                                        result.isPerfectMatch
                                          ? "bg-amber-100 text-amber-700"
                                          : result.type === "holiday"
                                            ? "bg-purple-100 text-purple-700"
                                            : "bg-orange-100 text-orange-700"
                                      }`}
                                    >
                                      {result.type === "holiday" ? (
                                        <CalendarDays size={20} />
                                      ) : (
                                        <Megaphone size={20} />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span
                                          className={`font-semibold truncate transition-colors ${
                                            result.isPerfectMatch
                                              ? "text-amber-900 group-hover:text-primary-600 group-hover:underline"
                                              : "text-neutral-900 group-hover:text-primary-600 group-hover:underline"
                                          }`}
                                        >
                                          {formatCircularTitle(result.headline)}
                                        </span>
                                        {/* Clean Match Percentage Badge */}
                                        {typeof (result as any)
                                          .matchPercentage === "number" ? (
                                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">
                                            {(result as any).matchPercentage}%
                                            Match
                                          </span>
                                        ) : result.similarity ? (
                                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">
                                            {Math.round(
                                              result.similarity * 100,
                                            )}
                                            % Match
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="flex items-center gap-3 text-xs text-neutral-500 font-medium">
                                        <span className="uppercase tracking-wider">
                                          {result.type}
                                        </span>
                                        <span>&bull;</span>
                                        <span>
                                          {result.publishedAt
                                            ? DateTime.fromISO(
                                                result.publishedAt,
                                              ).toLocaleString(
                                                DateTime.DATE_MED,
                                              )
                                            : "No date"}
                                        </span>
                                        {result.type === "announcement" && result.matchInPdf && (
                                          <>
                                            <span>&bull;</span>
                                            <span data-match-in-pdf className="font-semibold text-red-600">
                                              In the PDF{result.matchPage ? `, page ${result.matchPage}` : ""}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* an announcement found by what its PDF says: the passage, so the reader sees why it matched */}
                                  {result.type === "announcement" && result.matchInPdf && !result.isPerfectMatch && result.chunkText && (
                                    <div data-pdf-passage className="ml-12 mt-1 flex items-start gap-3 rounded-md bg-neutral-50 p-2 text-xs leading-relaxed text-neutral-600">
                                      {result.matchPage ? (
                                        // the picture of the page the words are on, as the search index kept it (hidden if there is none)
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={`/api/announcements/${realSourceId(result.id)}/page/${result.matchPage}`} alt={`Page ${result.matchPage} of the PDF`} data-pdf-page-picture loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} className="h-24 w-auto shrink-0 rounded border border-neutral-200 bg-white object-contain" />
                                      ) : null}
                                      <span>&quot;{generateSmartSnippet(result.chunkText, query)}&quot;</span>
                                    </div>
                                  )}
                                  {result.isPerfectMatch &&
                                    result.chunkText &&
                                    mode === "semantic" && (
                                      <div className="ml-12 mt-2 text-xs text-neutral-800 bg-yellow-50 p-3 rounded-md border border-yellow-200 leading-relaxed shadow-sm">
                                        <div className="font-bold text-yellow-800 uppercase tracking-wider text-[10px] flex items-center gap-1 mb-1.5">
                                          <Sparkles
                                            size={12}
                                            className="text-yellow-600"
                                          />
                                          Exact Match Context:
                                        </div>
                                        <div className="font-medium font-serif italic text-neutral-700">
                                          &quot;
                                          {generateSmartSnippet(
                                            result.chunkText,
                                            query,
                                          )}
                                          &quot;
                                        </div>
                                      </div>
                                    )}
                                  {/* Holiday chunks have no document to open and no
                                      full-record fetch on click -- the chunk text
                                      IS the entire answer, so it always shows
                                      inline rather than being gated behind
                                      isPerfectMatch/semantic mode like the other
                                      two types above. */}
                                  {result.type === "holiday" && result.chunkText && (
                                    <div className="ml-12 mt-2 text-xs text-neutral-800 bg-purple-50 p-3 rounded-md border border-purple-200 leading-relaxed shadow-sm">
                                      {result.chunkText}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Intranet Sites — always shown at the very bottom, below People and circulars */}
                    {!isLoading && siteResults.length > 0 && (
                      <div className="flex flex-col gap-1 p-1 mb-2">
                        <h4 className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Intranet Sites
                        </h4>
                        {siteResults.map((site) => (
                          <div
                            key={`site-${site.category}-${site.title}`}
                            className="flex items-center gap-3 p-3 rounded-lg border border-transparent hover:bg-neutral-100 transition-all duration-200 group"
                          >
                            <div className="p-2 rounded-md bg-sky-100 text-sky-700 flex-shrink-0">
                              <Globe size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-neutral-800 truncate">
                                {site.title}
                                {site.subtitle && (
                                  <span className="ml-1.5 text-xs font-normal text-neutral-400">
                                    {site.subtitle}
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-neutral-500 uppercase tracking-wide">
                                {site.category === "sail"
                                  ? "SAIL Site"
                                  : site.category === "department"
                                    ? "Department Site"
                                    : "Quick Link"}
                              </p>
                            </div>
                            {site.hasLink ? (
                              <a
                                href={site.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1.5 flex-shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 transition-colors"
                              >
                                Open <ExternalLink size={13} />
                              </a>
                            ) : (
                              <span className="flex-shrink-0 rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-400 italic">
                                Link not available yet
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                  </>
                )}
              </div>

              {/* Universal Yes / No for the answer on screen: the entry point of the learning loop.
                  Only for SIGNED-IN people (the feedback routes enforce this on the server as well).
                  A VERIFIED answer (source "cache") shows only "Report this answer as wrong": it was already confirmed,
                  so Yes/No would only confuse, but a wrong confirmation must always be challengeable. */}
              {!isLoading && authStatus === "authenticated" && mode === "semantic" && submittedQuery.trim().length >= 3 && !error && (
                <div className="border-t border-slate-200/70 bg-white/80">
                  <AnswerFeedback
                    query={submittedQuery}
                    source={
                      (analytics?.source ?? (analytics ? "legacy" : results.length > 0 ? "circular" : "none")) as AnswerSource
                    }
                    nl2sqlLogId={analytics?.nl2sql?.logId ?? analytics?.feedbackLogId ?? null}
                    userKey={ticketNo ?? null}
                    attempt={attempt}
                    onRetry={requestRetry}
                    reportOnly={analytics?.source === "cache"}
                  />
                </div>
              )}

              {/* Persistent AI disclaimer footer */}
              <div className="border-t border-slate-200/70 bg-white/60 px-4 py-2 text-center">
                <p className="text-[11px] font-medium text-slate-400">
                  AI can make mistakes, hence always double-check responses.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Context Banner cleanly wrapped inside AnimatePresence */}
      <AnimatePresence>
        {selectedCircularId &&
          !bannerDismissed &&
          (answerQuote || (activeMatchedCircular?.isPerfectMatch && activeMatchedCircular?.chunkText)) &&
          mode === "semantic" && (
            <motion.div
              key="floating-banner"
              initial={{ opacity: 0, y: -20, scale: 0.95, x: "-50%" }}
              animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
              exit={{ opacity: 0, y: -20, scale: 0.95, x: "-50%" }}
              transition={{ duration: 0.2 }}
              className="fixed top-20 left-1/2 z-[160] w-[90%] max-w-2xl bg-amber-50/95 backdrop-blur-md border-2 border-amber-400 p-3.5 pr-10 rounded-xl shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                aria-label="Dismiss match reference"
                className="absolute top-2 right-2 rounded-full p-1 text-amber-700/80 transition-colors hover:bg-amber-200/70 hover:text-amber-900"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
              <div className="font-bold text-amber-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-1.5">
                <Sparkles size={13} className="text-amber-600 shrink-0" />
                {answerQuote ? "The words the answer is taken from:" : "Target Clause Reference:"}
              </div>
              <div className="font-medium text-neutral-800 text-xs sm:text-sm leading-relaxed">
                {answerQuote ?? (activeMatchedCircular?.chunkText ? generateSmartSnippet(activeMatchedCircular.chunkText, query) : "")}
              </div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Announcement modal (rich-text body) */}
      {selectedAnnouncement && (
        <AnnouncementModal
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
          highlightQuery={query}
          pdfPage={selectedAnnouncement.pdfPage ?? null}
        />
      )}

      {/* Lightbox Viewer */}
      <CircularViewerLightbox
        circularId={selectedCircularId}
        scrollToPage={
          sourceViewer
            ? sourceViewer.pages[0] ?? null
            : mode === "semantic"
              ? activeMatchedCircular?.matchPage ?? null
              : null
        }
        matchPages={
          sourceViewer
            ? sourceViewer.pages
            : mode === "semantic"
              ? activeMatchedCircular?.matchPages ?? []
              : []
        }
        onClose={handleCloseLightbox}
      />
    </>
  );
}

// src/hooks/useOmniSearch.ts
import type { HolidayDetail } from "@/lib/holidays/format";
import type { HolidayCompareView } from "@/lib/holidays/compareView";
import { useState, useEffect, useMemo, useCallback } from "react";
import { isIdQuery } from "@/lib/search/idQuery";
import useSWR, { mutate as globalMutate, preload } from "swr";
import type { SynthesisResult } from "@/lib/search/executiveSynthesis";
import type { Nl2SqlExtras } from "@/lib/nl2sql/clientTypes";
import { markWeakMatches } from "@/lib/search/weakMatch";
import { AUTO_SELECTION, selectionQuery } from "@/records/scope";
import type { Selection } from "@/records/types";

export type SearchMode = "title" | "semantic" | "intellectual" | null;

export interface OmniSearchResult {
  id: number;
  type: "circular" | "announcement" | "holiday";
  headline: string;
  url: string | null;
  publishedAt: string | null;
  similarity: number | null;
  chunkText?: string;
  isPerfectMatch?: boolean;
  matchPage?: number | null; // page of the best-matching chunk (viewer jump target)
  matchPages?: number[]; // all pages that contain a match
  matchInPdf?: boolean; // I mark an announcement found by what its PDF says (matchPage is a page of that PDF)
}

export interface AnalyticsBreakdownRow {
  designation: string;
  short: string;
  count: number;
  class?: string;
}

export interface AnalyticsHolidayRow {
  id: number;
  name: string;
  aliases: string[] | null;
  type: "CH" | "FH" | "RH";
  date: string;
  categories: string | null;
}

export interface AnalyticsAnswer {
  kind: "count" | "total" | "breakdown" | "pending" | "error" | "clarify";
  answer: string;
  label?: string;
  count?: number;
  rows?: AnalyticsBreakdownRow[];
  people?: any[];
  listTruncated?: boolean;
  /** Stage 2: the holiday rows I return for a holiday list query. */
  holidays?: AnalyticsHolidayRow[];
  /** Structured "when is X" / "is this a holiday" layout; it mirrors AnalyticsPayload.holidayDetails. */
  holidayDetails?: HolidayDetail[];
  /** Structured year comparison that I draw as a card. It mirrors AnalyticsPayload.holidayCompare. */
  holidayCompare?: HolidayCompareView;
  /** One-line lead that I put above the holiday card. It mirrors AnalyticsPayload.lead. */
  lead?: string;
  /** Set when the question had a second part that I did not answer. It mirrors AnalyticsPayload.notice. */
  notice?: string;
  /** A clarifying question about a department word with more than one meaning (step 49a). It is the same type as AnalyticsPayload.ask. */
  ask?: import("@/lib/nl2sql/departmentAsk").DepartmentAsk;
  /** A hospital OPD answer (step 51a), drawn as a card by HospitalAnswerCard. I use the same type in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */
  hospital?: import("@/lib/hospital/types").HospitalAnswer;
  /** Set when the employee manager was asked for by someone who may use it (step 66a); EmployeeAdminPanel draws it as a panel. The same type is used in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */
  employeeAdmin?: import("@/lib/employees/admin/types").EmployeeAdminOpen;
  /** Set when the PAX directory editor was asked for by someone who may use it (step 64a); PaxAdminPanel draws it as a panel. The same type is used in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */
  paxAdmin?: import("@/lib/pax/admin/types").PaxAdminOpen;
  /** The Holiday Manager was asked for by someone who may use it; I draw it as a panel with HolidayAdminPanel. */
  holidayAdmin?: import("@/lib/holidays/admin/types").HolidayAdminOpen;
  /** The Circular Manager was asked for by someone who may use it; I draw it as a panel with CircularAdminPanel. */
  circularAdmin?: import("@/lib/circulars/admin/types").CircularAdminOpen;
  /** The Announcement Manager was asked for by someone who may use it; I draw it as a panel with AnnouncementAdminPanel. */
  announcementAdmin?: import("@/lib/announcements/admin/types").AnnouncementAdminOpen;
  /** The Contact Access Log was asked for by someone who may use it; I draw it as a panel with AccessLogAdminPanel. */
  accessLogAdmin?: import("@/lib/accessLog/admin/types").AccessLogAdminOpen;
  /** The management page (the titles of the management tools this person may open); ManagementHubPanel draws it. */
  managementHub?: import("@/lib/facility/hub").ManagementHubOpen;
  /** The management page was asked for by someone who may not have it: I show the card that asks him to sign in, or tells him he is not authorised (ManagementGatePanel). */
  managementGate?: import("@/lib/facility/hub").ManagementGate;
  /** The ONE clean answer shown first, big and bold (step 61a). I use the same type in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */
  headline?: import("@/lib/ui/answerHeadline").AnswerHeadline;
  /**
   * Per-type (RH/CH/FH) tally for a holiday list query; I only fill it when no single type was already filtered on.
   * `count` above is the DISTINCT-holiday number; rawEntryCount is the raw (date,type) row total, and `count` deliberately avoids its double-counting.
   * It mirrors AnalyticsPayload in src/lib/employees/analytics.ts: keep the two in sync if either changes.
   */
  typeBreakdown?: { type: string; label: string; count: number }[];
  rawEntryCount?: number;
  /** Per-category RH quota (holiday_rh_quota), which I send alongside a holiday list. */
  rhQuotaByCategory?: { category: string; quota: number }[];
  /** What A/B/C/D actually mean; see CATEGORY_LABEL in holidays/terms.ts. */
  categoryLabels?: Record<string, string>;
  /**
   * Present only on answers from a fresh, not-yet-trusted LLM-derived pattern: I show the tick/cross and report feedback with this id.
   * It mirrors AnalyticsPayload.pendingPatternId (employees/analytics.ts).
   */
  pendingPatternId?: number;
  /**
   * Plain-language statement of how I understood an LLM-derived query.
   * It mirrors AnalyticsPayload.interpretation.
   */
  interpretation?: string;
  /**
   * Present when the language model wrote the answer (SQL, departments covered, tick/cross,
   * and a table for breakdowns). See src/lib/nl2sql/omnibar.ts.
   */
  nl2sql?: Nl2SqlExtras;
  /** Which route produced the answer; I record the footer's Yes/No against it. */
  source?: "nl2sql" | "cache" | "holiday" | "legacy" | "circular" | "none";
  /** I send 1 for the first answer and 2 for a second attempt after a "No" ... */
  attempt?: number;
  /** The log row to rate, also for explanations that carry no SQL. */
  feedbackLogId?: number | null;
}

export interface OmniSearchResponse {
  synthesis?: SynthesisResult;
  analytics?: AnalyticsAnswer;
  results: OmniSearchResult[];
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
};

type SearchRetry = { attempt: number; reason: string; note: string; logId: number | null };

/** The address of one search: the SWR key of the answer on screen and of an answer fetched ahead are this same text, so I find a fetched-ahead answer at once */
export function searchKey(text: string, mode: SearchMode, ticketNo?: string, retry?: SearchRetry | null, sel?: Selection): string {
  return `/api/ai-search?q=${encodeURIComponent(text)}&mode=${mode}${ticketNo ? `&ticket=${ticketNo}` : ""}${selectionQuery(sel)}${
    retry
      ? `&ra=${retry.attempt}&rr=${encodeURIComponent(retry.reason)}${retry.logId ? `&rl=${retry.logId}` : ""}${
          retry.note ? `&rn=${encodeURIComponent(retry.note)}` : ""
        }`
      : ""
  }`;
}

export function useOmniSearch(isOpen: boolean, ticketNo?: string) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>(null);
  // A "No" on an answer asks for another attempt: I send the reason with the request (see AnswerFeedback.tsx).
  const [retry, setRetry] = useState<{ attempt: number; reason: string; note: string; logId: number | null } | null>(null);
  const [attempt, setAttempt] = useState(1); // the attempt number of the answer now on screen
  // I set this true when the ENTER KEY (not the old button) sent the question to Executive Deep Synthesis (step 27a)
  const [autoRouted, setAutoRouted] = useState(false);
  // The reader's fixed selection (src/records): "auto" = Everything, exactly as before. I make it part of the address of every search, so an answer found under one selection is never shown under another.
  const [selection, setSelection] = useState<Selection>(AUTO_SELECTION);

  const clearSearch = useCallback(() => {
    setSubmittedQuery("");
    setMode(null);
    setRetry(null);
    setAttempt(1);
    setAutoRouted(false);
    globalMutate(
      (key) => typeof key === "string" && key.startsWith("/api/ai-search"),
      undefined,
      { revalidate: false },
    );
  }, []);

  // I wipe all state when the modal closes.
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      clearSearch();
      setSelection(AUTO_SELECTION); // every opening starts on Everything
    }
  }, [isOpen, clearSearch]);

  // This runs ONLY when a mode button is explicitly clicked.
  const triggerSearch = (selectedMode: SearchMode, opts?: { auto?: boolean; query?: string }) => {
    if (!selectedMode) return;
    setAutoRouted(!!opts?.auto && selectedMode === "intellectual");
    setMode(selectedMode);
    setRetry(null);
    setAttempt(1);
    // A choice made under a clarifying question (step 49a) searches for its own text and puts it in the box.
    const text = (opts?.query ?? query).trim();
    if (opts?.query !== undefined) setQuery(opts.query);
    if (text.length >= 3) {
      setSubmittedQuery(text);
    } else {
      setSubmittedQuery("");
    }
  };

  // Fetch ahead: I ask for an answer before it is wanted (the management page does it when a title is pointed at, so pressing it shows the page at once). It uses the same address as triggerSearch makes, so the answer is
  // found when asked for; a request already on its way is shared, not repeated. Nothing is shown and nothing changes on screen.
  const prefetchSearch = (selectedMode: SearchMode, text: string, sel: Selection = selection) => {
    const t = text.trim();
    if (!isOpen || !selectedMode || t.length < 3) return;
    preload(searchKey(t, selectedMode, ticketNo, null, sel), fetcher).catch(() => undefined);
  };

  // I am strict here: SWR only fetches if the modal is open, a button was clicked (mode !== null), and text is submitted.
  const shouldFetch =
    isOpen && mode !== null && submittedQuery.trim().length >= 3;

  const {
    data,
    error,
    isLoading: isSwrLoading,
  } = useSWR<OmniSearchResponse | OmniSearchResult[]>(
    shouldFetch ? searchKey(submittedQuery, mode, ticketNo, retry, selection) : null,
    fetcher,
    {
      keepPreviousData: false,
      revalidateOnFocus: false,
    },
  );

  const trimmedQ = (query || "").trim();
  const trimmedSubmitted = (submittedQuery || "").trim();
  const isId = isIdQuery(trimmedQ);
  // Stale guard: if the user changed the query or typed an ID (e.g. CUG, ticket, mobile),
  // I never let results from a previous query linger as residue.
  const isStale = isId || (trimmedSubmitted.length > 0 && trimmedQ !== trimmedSubmitted);

  // I normalise the response whether it is the new synthesis object or the legacy flat array.
  const rawResults: OmniSearchResult[] = !shouldFetch || isStale || !submittedQuery || mode === null
    ? []
    : Array.isArray(data)
    ? data
    : data?.results || [];
  // A document that shares nothing with the question must not wear a confident percentage (step 61a; ledger item 57): I mark this once per answer, from the question that was searched.
  const results: OmniSearchResult[] = useMemo(
    () => (rawResults.length > 0 ? markWeakMatches(submittedQuery, rawResults) : []),
    [submittedQuery, rawResults],
  );

  const synthesis: SynthesisResult | null =
    !isStale && !Array.isArray(data) && data?.synthesis ? data.synthesis : null;

  const analytics: AnalyticsAnswer | null =
    !isStale && !Array.isArray(data) && (data as OmniSearchResponse)?.analytics
      ? (data as OmniSearchResponse).analytics!
      : null;

  const isLoading = shouldFetch && isSwrLoading;

  // An EDS-type question that the ENTER KEY sent to Executive Deep Synthesis (step 27a) but that found no relevant circular to build
  // an answer from must not end as an empty briefing: I quietly run the normal search instead, exactly as Enter did before.
  useEffect(() => {
    if (!autoRouted || mode !== "intellectual" || isLoading || !data) return;
    const syn = !Array.isArray(data) ? (data as OmniSearchResponse).synthesis : null;
    const empty = !syn || !!syn.error || ((syn.keyFindings?.length ?? 0) === 0 && (syn.citations?.length ?? 0) === 0);
    if (empty) {
      setAutoRouted(false);
      setMode("semantic");
    }
  }, [autoRouted, mode, isLoading, data]);

  // On "No" I ask for another attempt in a different way; the server chooses it from the reason.
  const requestRetry = (r: { reason: string; note: string; logId: number | null }) => {
    setRetry({ ...r, attempt });
    setAttempt((a) => a + 1);
  };

  return {
    query,
    submittedQuery,
    attempt,
    requestRetry,
    setQuery,
    clearSearch,
    /** True while the text in the box is no longer the text that was searched (the old answer is hidden meanwhile). */
    isStale,
    // I show a synthesis that arrives on the plain Enter path (the engine chose it, step 26a) as one: the screen follows the answer.
    mode: synthesis ? ("intellectual" as SearchMode) : mode,
    triggerSearch,
    prefetchSearch,
    selection,
    setSelection,
    results,
    synthesis,
    analytics,
    isLoading,
    error,
  };
}

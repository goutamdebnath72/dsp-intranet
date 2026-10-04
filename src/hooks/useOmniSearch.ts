// src/hooks/useOmniSearch.ts
import { useState, useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import type { SynthesisResult } from "@/lib/search/executiveSynthesis";
import type { Nl2SqlExtras } from "@/lib/nl2sql/clientTypes";

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
  /** Stage 2: holiday rows for a holiday list query. */
  holidays?: AnalyticsHolidayRow[];
  /** Per-type (RH/CH/FH) tally for a holiday list query, only present when
   *  no single type was already filtered on. `count` above is the
   *  DISTINCT-holiday number; rawEntryCount is the raw (date,type) row
   *  total that count deliberately excludes the double-counting from.
   *  Mirrors AnalyticsPayload in src/lib/employees/analytics.ts -- keep
   *  the two in sync if either changes. */
  typeBreakdown?: { type: string; label: string; count: number }[];
  rawEntryCount?: number;
  /** Per-category RH quota (holiday_rh_quota) alongside a holiday list. */
  rhQuotaByCategory?: { category: string; quota: number }[];
  /** What A/B/C/D actually mean -- see CATEGORY_LABEL in holidays/terms.ts. */
  categoryLabels?: Record<string, string>;
  /** Present only on answers from a fresh, not-yet-trusted LLM-derived
   *  pattern -- show the tick/cross and report feedback with this id.
   *  Mirrors AnalyticsPayload.pendingPatternId (employees/analytics.ts). */
  pendingPatternId?: number;
  /** Plain-language statement of how an LLM-derived query was understood.
   *  Mirrors AnalyticsPayload.interpretation. */
  interpretation?: string;
  /** Present when the answer was written by the language model (SQL, departments covered, tick/cross,
   *  and a table for breakdowns). See src/lib/nl2sql/omnibar.ts. */
  nl2sql?: Nl2SqlExtras;
  /** Which route produced the answer; the footer's Yes/No is recorded against it. */
  source?: "nl2sql" | "cache" | "holiday" | "legacy" | "circular" | "none";
  /** 1 for the first answer, 2 for a second attempt after a "No" ... */
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

export function useOmniSearch(isOpen: boolean, ticketNo?: string) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>(null);
  // A "No" on an answer asks for another attempt: the request carries the reason (see AnswerFeedback.tsx).
  const [retry, setRetry] = useState<{ attempt: number; reason: string; note: string; logId: number | null } | null>(null);
  const [attempt, setAttempt] = useState(1); // the attempt number of the answer now on screen

  // Wipe all state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSubmittedQuery("");
      setMode(null);
      setRetry(null);
      setAttempt(1);
      globalMutate(
        (key) => typeof key === "string" && key.startsWith("/api/ai-search"),
        undefined,
        { revalidate: false },
      );
    }
  }, [isOpen]);

  // ONLY executed when a mode button is explicitly clicked
  const triggerSearch = (selectedMode: SearchMode) => {
    if (!selectedMode) return;
    setMode(selectedMode);
    setRetry(null);
    setAttempt(1);
    if (query.trim().length >= 3) {
      setSubmittedQuery(query.trim());
    } else {
      setSubmittedQuery("");
    }
  };

  // STRICT: SWR only fetches if modal is open, a button was clicked (mode !== null), and text is submitted
  const shouldFetch =
    isOpen && mode !== null && submittedQuery.trim().length >= 3;

  const {
    data,
    error,
    isLoading: isSwrLoading,
  } = useSWR<OmniSearchResponse | OmniSearchResult[]>(
    shouldFetch
      ? `/api/ai-search?q=${encodeURIComponent(submittedQuery)}&mode=${mode}${ticketNo ? `&ticket=${ticketNo}` : ""}${
          retry
            ? `&ra=${retry.attempt}&rr=${encodeURIComponent(retry.reason)}${retry.logId ? `&rl=${retry.logId}` : ""}${
                retry.note ? `&rn=${encodeURIComponent(retry.note)}` : ""
              }`
            : ""
        }`
      : null,
    fetcher,
    {
      keepPreviousData: false,
      revalidateOnFocus: false,
    },
  );

  // Normalize response whether it's the new synthesis object or the legacy flat array
  const results: OmniSearchResult[] = Array.isArray(data)
    ? data
    : data?.results || [];

  const synthesis: SynthesisResult | null =
    !Array.isArray(data) && data?.synthesis ? data.synthesis : null;

  const analytics: AnalyticsAnswer | null =
    !Array.isArray(data) && (data as OmniSearchResponse)?.analytics
      ? (data as OmniSearchResponse).analytics!
      : null;

  const isLoading = shouldFetch && isSwrLoading;

  // "No" -> ask for another attempt in a different way (the server chooses it from the reason).
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
    mode,
    triggerSearch,
    results,
    synthesis,
    analytics,
    isLoading,
    error,
  };
}

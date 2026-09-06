// src/hooks/useOmniSearch.ts
import { useState, useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";

export type SearchMode = "title" | "semantic" | "intellectual" | null;

export interface OmniSearchResult {
  id: number;
  type: "circular" | "announcement";
  headline: string;
  url: string | null;
  publishedAt: string | null;
  similarity: number | null;
}

export interface OmniSearchResponse {
  synthesis?: string;
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

  // Wipe all state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSubmittedQuery("");
      setMode(null);
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
      ? `/api/ai-search?q=${encodeURIComponent(submittedQuery)}&mode=${mode}${ticketNo ? `&ticket=${ticketNo}` : ""}`
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

  const synthesis: string | null =
    !Array.isArray(data) && data?.synthesis ? data.synthesis : null;

  const isLoading = shouldFetch && isSwrLoading;

  return {
    query,
    setQuery,
    mode,
    triggerSearch,
    results,
    synthesis,
    isLoading,
    error,
  };
}

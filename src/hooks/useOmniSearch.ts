// src/hooks/useOmniSearch.ts
import { useState, useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export type SearchMode = "title" | "deep";

export interface OmniSearchResult {
  id: number;
  type: "circular" | "announcement";
  headline: string;
  url: string | null;
  publishedAt: string | null;
  similarity: number | null;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
};

export function useOmniSearch(isOpen: boolean) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("title");

  const debouncedQuery = useDebounce(query, 300);

  // The ultimate failsafe: if modal closes, wipe all state immediately
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setMode("title");
      globalMutate(
        (key) => typeof key === "string" && key.startsWith("/api/ai-search"),
        undefined,
        { revalidate: false },
      );
    }
  }, [isOpen]);

  const shouldFetch = isOpen && debouncedQuery.length >= 3;

  const {
    data: results,
    error,
    isLoading: isSwrLoading,
  } = useSWR<OmniSearchResult[]>(
    shouldFetch
      ? `/api/ai-search?q=${encodeURIComponent(debouncedQuery)}&mode=${mode}`
      : null,
    fetcher,
    {
      keepPreviousData: false,
      revalidateOnFocus: false,
    },
  );

  const isLoading = shouldFetch && isSwrLoading;

  return {
    query,
    setQuery,
    mode,
    setMode,
    results: results || [],
    isLoading,
    error,
  };
}

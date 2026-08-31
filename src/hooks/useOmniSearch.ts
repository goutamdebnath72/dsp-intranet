// src/hooks/useOmniSearch.ts
import { useState, useEffect } from "react";
import useSWR from "swr";

// 1. Debounce logic with strict resource cleanup
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    // Cleanup timer to prevent memory leaks on continuous dashboards
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

export function useOmniSearch() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("title"); // Default to faster title search
  const [isOpen, setIsOpen] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  // Only trigger backend reads if the modal is actually open and query is substantial
  const shouldFetch = debouncedQuery.length >= 3 && isOpen;

  const {
    data: results,
    error,
    isLoading: isSwrLoading,
  } = useSWR<OmniSearchResult[]>(
    shouldFetch
      ? `/api/ai-search?q=${encodeURIComponent(debouncedQuery)}&mode=${mode}`
      : null,
    fetcher,
    { keepPreviousData: true }, // Prevents UI flicker while user continues typing
  );

  const isLoading = shouldFetch && isSwrLoading;

  // 2. Global Keyboard Shortcut Listener (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        setQuery(""); // Clear on escape
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown); // Strict cleanup
  }, [isOpen]);

  return {
    query,
    setQuery,
    mode,
    setMode,
    isOpen,
    setIsOpen,
    results: results || [],
    isLoading,
    error,
  };
}

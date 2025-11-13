"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2, FileText } from "lucide-react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { DateTime } from "luxon";

function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface AISearchResult {
  id: number;
  headline: string;
  url: string | null;
  publishedAt: string | null;
  similarity: number | null;
}

const fetcher = (...args: Parameters<typeof fetch>) =>
  fetch(...args).then((res) => res.json());

const SearchBar: React.FC = () => {
  const { data: session, status } = useSession();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  // Allow search for all users (public access)
  const shouldFetch = debouncedQuery.length > 2;

  const { data: results, error } = useSWR<AISearchResult[]>(
    shouldFetch
      ? `/api/ai-search?q=${encodeURIComponent(debouncedQuery)}`
      : null,
    fetcher
  );

  const isLoading = shouldFetch && !results && !error;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showPopover = isFocused && shouldFetch;

  const renderResults = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center p-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      );
    }
    if (error) {
      return (
        <div className="p-4 text-sm text-red-600">
          Error fetching results. Please try again.
        </div>
      );
    }
    if (results && results.length === 0) {
      return <div className="p-4 text-sm text-gray-500">No results found.</div>;
    }
    if (results) {
      return (
        <div className="flex flex-col gap-1 p-2">
          <span className="px-2 pt-1 pb-2 text-xs font-semibold text-gray-400 uppercase">
            Circulars
          </span>
          {results.map((result) => (
            <a
              key={result.id}
              href={result.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-100"
              onClick={() => setIsFocused(false)}
            >
              <FileText className="h-5 w-5 text-blue-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <p className="font-medium text-sm text-gray-900 line-clamp-2">
                  {result.headline}
                </p>
                <p className="text-xs text-gray-500">
                  {result.publishedAt
                    ? DateTime.fromISO(result.publishedAt).toLocaleString(
                        DateTime.DATE_MED
                      )
                    : ""}
                </p>
              </div>
            </a>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative w-full max-w-lg" ref={searchRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        placeholder={
          status === "authenticated"
            ? "Search circulars, people, and more..."
            : "Search circulars (public) — try 'holiday' or 'leave'"
        }
        className="w-full pl-10 pr-4 py-2 border border-slate-400 rounded-full text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="absolute left-3 top-1/2 -translate-y-1/2">
        {isLoading ? (
          <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
        ) : (
          <Search className="h-5 w-5 text-gray-400" />
        )}
      </div>

      {showPopover && (
        <div className="absolute top-12 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-2xl z-50 max-h-96 overflow-y-auto">
          {renderResults()}
        </div>
      )}
    </div>
  );
};

export default SearchBar;

// src/components/SearchBar.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2, FileText, Sparkles } from "lucide-react";
import AiOverview from "./AiOverview";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { DateTime } from "luxon";
import { generateSmartSnippet } from "@/lib/utils/searchUtils";

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
  chunkText?: string;
  isPerfectMatch?: boolean;
}

const fetcher = (...args: Parameters<typeof fetch>) =>
  fetch(...args).then((res) => res.json());

const SearchBar: React.FC = () => {
  const { data: session, status } = useSession();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [searchMode, setSearchMode] = useState<"title" | "semantic">("title");
  const searchRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  // Allow search for all users (public access)
  const shouldFetch = debouncedQuery.length > 2;

  // Added &mode parameter to the fetch URL
  const { data: results, error } = useSWR<AISearchResult[]>(
    shouldFetch
      ? `/api/ai-search?q=${encodeURIComponent(debouncedQuery)}&mode=${searchMode}`
      : null,
    fetcher,
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

  // Safely construct the URL with the search hash for native viewers
  const getPdfUrl = (result: AISearchResult) => {
    let url = result.url ?? "#";
    if (result.isPerfectMatch && searchMode === "semantic" && debouncedQuery.length > 2) {
      const cleanQuery = debouncedQuery.replace(/^"|"$/g, "").trim();
      if (cleanQuery) {
        url += `#search=${encodeURIComponent(cleanQuery)}`;
      }
    }
    return url;
  };

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
        <div className="flex flex-col gap-2 p-2">
          <span className="px-2 pt-1 pb-1 text-xs font-semibold text-gray-400 uppercase">
            Circulars
          </span>
          {results.map((result) => (
            <a
              key={result.id}
              href={getPdfUrl(result)}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex flex-col gap-2 p-3 rounded-lg transition-colors border ${
                result.isPerfectMatch 
                  ? "bg-amber-50/50 border-amber-300 hover:bg-amber-100 shadow-sm" 
                  : "border-transparent hover:bg-gray-100"
              }`}
              onClick={() => setIsFocused(false)}
            >
              <div className="flex items-start gap-3">
                <FileText className={`h-5 w-5 flex-shrink-0 mt-1 ${result.isPerfectMatch ? "text-amber-700" : "text-blue-600"}`} />
                <div className="flex-1">
                  <p className={`font-medium text-sm line-clamp-2 ${result.isPerfectMatch ? "text-amber-900" : "text-gray-900"}`}>
                    {result.headline}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {result.publishedAt
                      ? DateTime.fromISO(result.publishedAt).toLocaleString(
                          DateTime.DATE_MED,
                        )
                      : ""}
                  </p>
                </div>
              </div>
              {/* Smart Contextual Snippet Drawer - ONLY FOR PERFECT MATCHES */}
              {result.isPerfectMatch && result.chunkText && searchMode === "semantic" && (
                <div className="ml-8 mt-1 text-xs text-neutral-800 bg-yellow-50 p-2.5 rounded-md border border-yellow-200 leading-relaxed shadow-sm">
                  <div className="font-bold text-yellow-800 uppercase tracking-wider text-[9px] flex items-center gap-1 mb-1">
                    <Sparkles size={10} className="text-yellow-600" />
                    Exact Match Context:
                  </div>
                  <div className="font-medium font-serif italic text-neutral-700">
                    "{generateSmartSnippet(result.chunkText, debouncedQuery)}"
                  </div>
                </div>
              )}
            </a>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative w-full max-w-lg" ref={searchRef}>
      <div className="relative w-full">
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
      </div>

      {/* Mode Toggle Buttons */}
      <div className="flex items-center gap-4 mt-2 px-2">
        <span className="text-sm font-medium text-gray-600">Search Mode:</span>
        <button
          onClick={() => setSearchMode("title")}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            searchMode === "title"
              ? "bg-slate-800 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Headline Match
        </button>
        <button
          onClick={() => setSearchMode("semantic")}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            searchMode === "semantic"
              ? "bg-blue-50 text-blue-700"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Deep AI Content Search
        </button>
      </div>

      {showPopover && (
        <div className="absolute top-[85px] left-0 w-full bg-white border border-gray-200 rounded-lg shadow-2xl z-50 max-h-96 overflow-y-auto flex flex-col">
          {/* AI Answer streams in at the top ONLY during Deep AI search */}
          {searchMode === "semantic" && <AiOverview query={debouncedQuery} />}

          {/* Standard Document Links sit below with a visual separator */}
          <div className="border-t border-gray-100">{renderResults()}</div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
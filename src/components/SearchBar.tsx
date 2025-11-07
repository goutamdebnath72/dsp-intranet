// src/components/SearchBar.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2, FileText } from "lucide-react";
import { useSession } from "next-auth/react";
import useSWR from "swr"; // We just installed this
import { DateTime } from "luxon"; // You already have this

// --- Helper Hook for Debouncing ---
// This prevents API calls on every keystroke
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

// --- Define the shape of our AI Search Result ---
interface AISearchResult {
  id: number;
  headline: string;
  url: string;
  publishedAt: string; // Will be a string from JSON
  similarity: number;
}

// --- SWR Fetcher Function ---
// This is the function SWR will use to fetch data
// @ts-ignore
const fetcher = (...args) => fetch(...args).then((res) => res.json());

const SearchBar: React.FC = () => {
  const { data: session, status } = useSession();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // --- Use our Debounce Hook ---
  const debouncedQuery = useDebounce(query, 300); // 300ms delay

  // --- SWR Data Fetching ---
  // It will automatically fetch when debouncedQuery changes
  const { data: results, error } = useSWR<AISearchResult[]>(
    // Only fetch if query is > 2 chars and user is logged in
    debouncedQuery.length > 2 && status === "authenticated"
      ? `/api/ai-search?q=${debouncedQuery}`
      : null, // Pass null to SWR to prevent fetching
    fetcher
  );

  // Determine the loading state
  const isLoading =
    debouncedQuery.length > 2 &&
    !results &&
    !error &&
    status === "authenticated";

  // --- Click Away to Close Popover ---
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
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchRef]);

  // Logic to decide when to show the results popover
  const showPopover =
    isFocused && debouncedQuery.length > 2 && status === "authenticated";

  // --- Helper function to render the results ---
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
        <div className="p-4 text-sm text-red-600">Error fetching results.</div>
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
              href={result.url} // This is the URL to the sanitized image
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-100"
              onClick={() => setIsFocused(false)} // Close popover on click
            >
              <FileText className="h-5 w-5 text-blue-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <p className="font-medium text-sm text-gray-900 line-clamp-2">
                  {result.headline}
                </p>
                <p className="text-xs text-gray-500">
                  {DateTime.fromISO(result.publishedAt).toLocaleString(
                    DateTime.DATE_MED
                  )}
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
        // Disable search bar if user is not logged in
        disabled={status === "loading" || status === "unauthenticated"}
        placeholder={
          status === "authenticated"
            ? "Search circulars, people, and more..."
            : // (original placeholder)
              "Please log in to use search"
        }
        className="
          w-full pl-10 pr-4 py-2 
          border border-slate-400 rounded-full 
          text-gray-900 
          bg-gray-50 
          focus:outline-none focus:ring-2 focus:ring-blue-500
          disabled:bg-gray-200"
      />
      <div className="absolute left-3 top-1/2 -translate-y-1/2">
        {/* Show loader in the icon spot */}
        {isLoading ? (
          <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
        ) : (
          <Search className="h-5 w-5 text-gray-400" />
        )}
      </div>

      {/* --- RESULTS POPOVER --- */}
      {showPopover && (
        <div className="absolute top-12 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-2xl z-50 max-h-96 overflow-y-auto">
          {renderResults()}
        </div>
      )}
    </div>
  );
};

export default SearchBar;

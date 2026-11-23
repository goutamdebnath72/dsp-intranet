"use client";

// src/hooks/useNameVocab.ts
//
// The plant's name words for the search bar's "Looks like a name" hint (src/lib/search/nameHint/nameHint.ts): I fetch them ONCE, when the search bar opens and the hint's mode uses them, keep them in SWR and in the
// browser's own cache (the route says ten minutes), and prepare them into sets once. A failed fetch leaves the hint on the built-in list alone: the hint is never blocked by it.

import { useMemo } from "react";
import useSWR from "swr";
import { buildPlantVocab, type PlantVocab } from "@/lib/search/nameHint/nameHint";

const fetchWords = async (url: string): Promise<string[]> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error("name words unavailable");
  const j = (await r.json()) as { words?: unknown };
  return Array.isArray(j.words) ? j.words.filter((w): w is string => typeof w === "string") : [];
};

export function useNameVocab(enabled: boolean): PlantVocab | null {
  const { data } = useSWR(enabled ? "/api/employees/name-words" : null, fetchWords, { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 10 * 60_000, shouldRetryOnError: false });
  return useMemo(() => (data && data.length ? buildPlantVocab(data) : null), [data]);
}

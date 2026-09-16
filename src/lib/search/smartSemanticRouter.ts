// src/lib/search/smartSemanticRouter.ts
import { DataSource } from "typeorm";
import { executePolicySearch } from "./semanticPolicySearch";
import { executeContentSearch } from "./semanticContentSearch";
import { SearchResultRow } from "./titleSearch";
import { executeAnnouncementSemanticSearch } from "./announcementSemanticSearch";

async function executeCircularRouter(
  dataSource: DataSource,
  q: string,
): Promise<{ uniqueResults: SearchResultRow[]; isFallback: boolean }> {
  const safeQ = (q || "").trim();
  if (!safeQ) return { uniqueResults: [], isFallback: false };

  // 1. INTENT ANALYSIS
  // Detects literal markers: Quotes, @ symbols, URLs, Alphanumeric codes (CN-9, Rs. 20995), specific formatting
  // Literal markers are things a human types when hunting an EXACT string:
  // quotes, an @handle, a domain (.co.in), an alphanumeric code (CN-9,
  // MERIT_AWD/131), or a decimal number (20995.30). Common English words
  // like "format" or "Rs" are NOT literal markers — they wrongly shoved
  // ordinary conversational queries down the literal path.
  const isLiteral =
    /[@"]|\.[a-z]{2,4}\b|[A-Za-z]+-\d+|[A-Za-z]+_[A-Za-z]+|\d+\.\d+|\d{6,}/i.test(
      safeQ,
    );

  // Detects conversational markers: Wh- questions, condition clauses, or sentences longer than 6 words
  // A pure exact-token query (single token containing a digit: a number or an
  // alphanumeric code). For these, the content engine's literal search is the
  // authority — if it finds nothing, we must NOT fall back to the policy
  // engine's vector search, which would surface a semantically-nearest but
  // unrelated circular. No literal hit => genuinely empty.
  const isExactTokenQuery =
    !/\s/.test(safeQ) && /\d/.test(safeQ) && safeQ.length >= 4;

  const isConversational =
    /^(how|what|where|when|why|can|if)\b/i.test(safeQ) ||
    safeQ.split(/\s+/).length > 6;

  // 2. ROUTING LOGIC

  // Rule A: Explicit Literal Hunt (e.g., "affdf@icici", "ECO Stream", "bams.saildsp.co.in")
  if (isLiteral && !isConversational) {
    console.log(
      "[Smart Semantic Router] Intent: Literal Deep Content. Firing Content Engine.",
    );
    const contentResults = await executeContentSearch(dataSource, safeQ);
    if (contentResults.uniqueResults.length > 0) {
      return {
        uniqueResults: contentResults.uniqueResults,
        isFallback: contentResults.isFallback,
      };
    }
    // For an exact-token query (number / code), a content miss is a real miss.
    // Do NOT fall through to the vector policy engine — that would return an
    // unrelated nearest-neighbour circular.
    if (isExactTokenQuery) {
      return { uniqueResults: [], isFallback: false };
    }
  }

  // Rule B: Explicit Conversational/Policy Hunt (e.g., "Can women over 45 run in the race?")
  if (isConversational && !isLiteral) {
    console.log(
      "[Smart Semantic Router] Intent: Conversational Policy. Firing Policy Engine.",
    );
    return await executePolicySearch(dataSource, safeQ);
  }

  // Rule C: The Parallel Safety Net (Ambiguous Queries)
  console.log(
    "[Smart Semantic Router] Intent: Ambiguous. Firing Parallel Safety Net.",
  );
  const [policyResults, contentResults] = await Promise.all([
    executePolicySearch(dataSource, safeQ),
    executeContentSearch(dataSource, safeQ),
  ]);

  // If the Content Engine found a confirmed 100% exact text match deep in the PDF chunk, it wins
  if (contentResults.hasExactMatch && contentResults.uniqueResults.length > 0) {
    console.log(
      "[Smart Semantic Router] Resolution: Hard exact text match found. Content Engine wins.",
    );
    return {
      uniqueResults: contentResults.uniqueResults,
      isFallback: contentResults.isFallback,
    };
  }

  // Otherwise, default to the mathematically perfect hierarchical sorting of the Policy Engine
  console.log(
    "[Smart Semantic Router] Resolution: No exact text match. Policy Engine wins.",
  );
  return policyResults;
}


/**
 * Public entry point. Runs the circular router and the announcement semantic
 * search in parallel, then merges both streams into one ranked list tagged by
 * `type`. Announcements are ADDITIVE — they never displace the circular
 * engine's carefully-tuned exact-match behaviour; they interleave by score.
 */
export async function executeSmartSemanticRouter(
  dataSource: DataSource,
  q: string,
): Promise<{ uniqueResults: SearchResultRow[]; isFallback: boolean }> {
  const safeQ = (q || "").trim();
  if (!safeQ) return { uniqueResults: [], isFallback: false };

  const [circular, announcements] = await Promise.all([
    executeCircularRouter(dataSource, safeQ),
    executeAnnouncementSemanticSearch(dataSource, safeQ),
  ]);

  // No announcement hits -> return the circular result untouched (preserves
  // the exact circular-only behaviour, including empty exact-token misses).
  if (announcements.length === 0) {
    return circular;
  }

  // Merge and rank by the similarity each engine reported. Both scales are the
  // same 0..1 vector similarity (+ literal boost folded into ordering already),
  // so a shared sort is fair. De-dup defensively by type+id.
  const seen = new Set<string>();
  const merged: SearchResultRow[] = [];
  for (const r of [...circular.uniqueResults, ...announcements]) {
    const key = `${r.type}-${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }

  merged.sort((a, b) => {
    const sa = typeof a.similarity === "number" ? a.similarity : 0;
    const sb = typeof b.similarity === "number" ? b.similarity : 0;
    return sb - sa;
  });

  return {
    uniqueResults: merged.slice(0, 8),
    isFallback: circular.isFallback,
  };
}

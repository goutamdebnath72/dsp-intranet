// src/lib/search/smartSemanticRouter.ts
import { DataSource } from "typeorm";
import { executePolicySearch } from "./semanticPolicySearch";
import { executeContentSearch } from "./semanticContentSearch";
import { SearchResultRow } from "./titleSearch";

export async function executeSmartSemanticRouter(
  dataSource: DataSource,
  q: string,
): Promise<{ uniqueResults: SearchResultRow[]; isFallback: boolean }> {
  const safeQ = (q || "").trim();
  if (!safeQ) return { uniqueResults: [], isFallback: false };

  // 1. INTENT ANALYSIS
  // Detects literal markers: Quotes, @ symbols, URLs, Alphanumeric codes (CN-9, Rs. 20995), specific formatting
  const isLiteral =
    /[@"]|\.[a-z]{2,4}\b|[A-Za-z]+-\d+|\d+\.\d+|\b(Rs\.?|Format)\b/i.test(
      safeQ,
    );

  // Detects conversational markers: Wh- questions, condition clauses, or sentences longer than 6 words
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

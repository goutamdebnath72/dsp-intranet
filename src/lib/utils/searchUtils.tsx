// src/lib/utils/searchUtils.tsx
import React from "react";

// Safely escape regex characters
const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Scrubs known OCR hallucinations, non-Latin extended symbols, and isolated bullet artifacts
const sanitizeOcrNoise = (text: string) => {
  if (!text) return "";
  return (
    text
      // Normalize to ASCII / Latin-1 Supplement + Basic Indic scripts (Devanagari/Bengali)
      // Strips out extended symbols, dingbats, surrogate bullets, and non-printable control glyphs
      .replace(/[^\u0020-\u007E\u00A0-\u00FF\u0900-\u097F\u0980-\u09FF]/g, " ")
      // Remove misread page counters ("1 of 2", "lof 2", "lof ड2")
      .replace(/\b[l1i]of\s+[\u0900-\u097F\w-]+\b/gi, "")
      // Remove chevron, arrow, and bullet-like noise
      .replace(/[»«<>•▪️|]/g, "")
      // Remove isolated bullet misreads like "7 e", "7 » e", or rogue floating characters
      .replace(/\s\d+\s+[a-zA-Z]\b/g, "")
      // Clean up multiple spaces or stray dashes left behind by the removal
      .replace(/\s+-\s+/g, " - ")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
};

// Extracts a window of text centered around the matched keyword
export const generateSmartSnippet = (text: string, query: string) => {
  if (!text) return "";
  const cleanText = sanitizeOcrNoise(text);

  if (!query) return cleanText.substring(0, 150) + "...";

  const cleanQuery = query.replace(/^"|"$/g, "").trim();
  if (cleanQuery.length < 2) return cleanText.substring(0, 150) + "...";

  try {
    const regex = new RegExp(`(${escapeRegExp(cleanQuery)})`, "gi");
    const match = regex.exec(cleanText);

    let snippet = cleanText;
    if (match) {
      // Retains the exact generous window lengths from your preferred layout
      const start = Math.max(0, match.index - 80);
      const end = Math.min(
        cleanText.length,
        match.index + cleanQuery.length + 120,
      );
      snippet = cleanText.substring(start, end).trim();

      // Clean dangling trailing fragments (e.g., hanging words cut mid-way at the very edge)
      snippet = snippet.replace(/\s+[^\s]+$/, "");

      if (start > 0) snippet = "..." + snippet;
      if (end < cleanText.length) snippet = snippet + "...";
    } else {
      snippet = cleanText.substring(0, 150) + "...";
    }

    const parts = snippet.split(regex);
    return parts.map((part, i) =>
      part.toLowerCase() === cleanQuery.toLowerCase() ? (
        <mark
          key={i}
          className="bg-yellow-300 text-yellow-900 font-extrabold px-1 rounded-sm shadow-sm"
        >
          {part}
        </mark>
      ) : (
        part
      ),
    );
  } catch (e) {
    return cleanText.substring(0, 150) + "...";
  }
};

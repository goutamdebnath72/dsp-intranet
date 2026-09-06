// src/components/AiOverview.tsx
"use client";

import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AiOverviewProps {
  content?: string | null;
  query?: string;
}

export function AiOverview({ content, query }: AiOverviewProps) {
  const [answer, setAnswer] = useState<string | null>(content || null);
  const [loading, setLoading] = useState<boolean>(
    !content && Boolean(query && query.length >= 3),
  );

  // If content is passed directly from OmnibarModal / useOmniSearch synthesis
  useEffect(() => {
    if (content) {
      setAnswer(content);
      setLoading(false);
    }
  }, [content]);

  // Fallback: If no direct content is passed, preserve original standalone /api/ai-chat behavior
  useEffect(() => {
    if (content || !query || query.length < 3) return;

    let isMounted = true;
    const fetchAiAnswer = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: query }),
        });
        const data = await res.json();

        if (isMounted) {
          if (data.answer) {
            setAnswer(data.answer);
          } else {
            setAnswer("No direct answer found in the uploaded circulars.");
          }
        }
      } catch (error) {
        console.error("Failed to fetch AI overview:", error);
        if (isMounted) {
          setAnswer("Unable to generate AI response at this time.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchAiAnswer();

    return () => {
      isMounted = false;
    };
  }, [query, content]);

  if (!loading && !answer) return null;

  return (
    <div className="p-5 mb-6 bg-indigo-50 border border-indigo-100 rounded-xl shadow-sm">
      <h3 className="flex items-center text-indigo-900 font-semibold mb-3">
        <span className="mr-2">✨</span> AI Overview
      </h3>
      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-4 bg-indigo-200/50 rounded w-3/4"></div>
          <div className="h-4 bg-indigo-200/50 rounded w-full"></div>
          <div className="h-4 bg-indigo-200/50 rounded w-5/6"></div>
        </div>
      ) : (
        <div className="text-gray-800 text-sm leading-relaxed space-y-3 prose prose-slate max-w-none prose-table:w-full prose-table:border-collapse prose-table:my-3 prose-th:border prose-th:border-slate-300 prose-th:bg-white/70 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-td:border prose-td:border-slate-200 prose-td:px-3 prose-td:py-2 prose-td:bg-white/40 prose-h3:text-base prose-h3:font-bold prose-h3:text-slate-900 prose-h4:text-sm prose-h4:font-semibold prose-h4:text-slate-800 prose-ul:list-disc prose-ul:pl-5 prose-li:my-1 prose-strong:font-semibold prose-strong:text-slate-900">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {answer || ""}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export default AiOverview;

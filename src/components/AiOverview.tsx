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

  useEffect(() => {
    if (content) {
      setAnswer(content);
      setLoading(false);
    }
  }, [content]);

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
    <div className="p-5 mb-6 bg-gradient-to-br from-indigo-50/60 via-white to-blue-50/40 border border-indigo-100/90 rounded-xl shadow-sm">
      <h3 className="flex items-center text-indigo-900 font-semibold mb-3 tracking-wide">
        <span className="mr-2">✨</span> AI Overview
      </h3>
      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-4 bg-indigo-200/50 rounded w-3/4"></div>
          <div className="h-4 bg-indigo-200/50 rounded w-full"></div>
          <div className="h-4 bg-indigo-200/50 rounded w-5/6"></div>
        </div>
      ) : (
        <div className="text-slate-800 text-sm leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => (
                <p className="mb-3.5 last:mb-0 leading-relaxed text-slate-800">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="my-3 space-y-2 list-disc pl-5 text-slate-800">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="my-3 space-y-2 list-decimal pl-5 text-slate-800">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="leading-relaxed pl-1">{children}</li>
              ),
              table: ({ children }) => (
                <div className="my-4 w-full overflow-x-auto rounded-lg border border-slate-200/90 shadow-sm bg-white">
                  <table className="w-full border-collapse text-left text-xs sm:text-sm">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-slate-100/80 text-slate-800 border-b border-slate-200">
                  {children}
                </thead>
              ),
              tbody: ({ children }) => (
                <tbody className="divide-y divide-slate-100 bg-white">
                  {children}
                </tbody>
              ),
              tr: ({ children }) => (
                <tr className="transition-colors hover:bg-slate-50/70">
                  {children}
                </tr>
              ),
              th: ({ children }) => (
                <th className="py-2.5 px-4 font-bold tracking-tight text-slate-800 bg-slate-100/60">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="py-2.5 px-4 text-slate-700 align-top">
                  {children}
                </td>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-slate-950">
                  {children}
                </strong>
              ),
            }}
          >
            {answer || ""}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export default AiOverview;

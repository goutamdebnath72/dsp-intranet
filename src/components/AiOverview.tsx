"use client";
import { useEffect, useState } from "react";

export default function AiOverview({ query }: { query: string }) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!query || query.length < 3) return;

    const fetchAiAnswer = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: query }),
        });
        const data = await res.json();

        if (data.answer) {
          setAnswer(data.answer);
        } else {
          setAnswer("No direct answer found in the uploaded circulars.");
        }
      } catch (error) {
        console.error("Failed to fetch AI overview:", error);
        setAnswer("Unable to generate AI response at this time.");
      } finally {
        setLoading(false);
      }
    };

    fetchAiAnswer();
  }, [query]);

  if (!query || query.length < 3) return null;

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
        <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">
          {answer}
        </p>
      )}
    </div>
  );
}

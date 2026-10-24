"use client";
// src/components/ClarifyChoices.tsx
//
// The options under a clarifying question about a department (step 49a), as CHECKBOXES: the person ticks the department or departments meant and presses Continue. The question that will
// be searched for is shown and follows the ticks, so nothing is a surprise. "Select all" is a shortcut (only when there are two or more options); "None of these" and "documents"
// are separate buttons, because they cannot be ticked together with a department. The question itself is the answer text above.

import React, { useState } from "react";
import { queryFor, type DepartmentAsk } from "@/lib/nl2sql/departmentAsk";

export function ClarifyChoices({ ask, onAsk }: { ask: DepartmentAsk; onAsk: (query: string) => void }) {
  const [ticked, setTicked] = useState<string[]>([]);
  const [reply, setReply] = useState<string | null>(null);
  if (!ask.options.length) return null;
  if (reply) return <p className="mt-3 text-sm text-neutral-700">{reply}</p>;
  const all = ticked.length === ask.options.length;
  const query = queryFor(ask, ticked);
  const toggle = (id: string) => setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  return (
    <fieldset className="mt-3">
      <legend className="sr-only">Tick the department or departments you mean</legend>
      {ask.options.length > 1 && (
        <button type="button" onClick={() => setTicked(all ? [] : ask.options.map((o) => o.id))} className="mb-2 text-xs font-medium text-blue-700 underline">
          {all ? "Clear all" : "Select all"}
        </button>
      )}
      <div className="space-y-2">
        {ask.options.map((o) => (
          <label key={o.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${ticked.includes(o.id) ? "border-blue-400 bg-white" : "border-blue-100 bg-white/60 hover:bg-white"}`}>
            <input type="checkbox" className="mt-1" checked={ticked.includes(o.id)} onChange={() => toggle(o.id)} />
            <span className="font-medium text-neutral-800">{o.label}</span>
          </label>
        ))}
      </div>
      {query && <p className="mt-2 text-xs text-neutral-500">I will search for: {query}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!query}
          onClick={() => onAsk(query)}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Continue
        </button>
        <button type="button" onClick={() => setReply(ask.none.reply)} className="text-sm text-neutral-600 underline">
          {ask.none.label}
        </button>
        {ask.documents && (
          <button type="button" onClick={() => onAsk(ask.documents!.query)} className="text-sm text-neutral-600 underline">
            {ask.documents.label}
          </button>
        )}
      </div>
    </fieldset>
  );
}

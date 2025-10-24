"use client";

import React, { useState, useTransition, useEffect } from "react";
import { mutate } from "swr";

export default function AnnouncementForm() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  // Effect to update the time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- 1. ADDED: Effect to clear the message after 5 seconds ---
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage("");
      }, 5000); // 5 seconds

      // Clear timer if component unmounts or message changes
      return () => clearTimeout(timer);
    }
  }, [message]); // Dependency array ensures this runs when 'message' changes

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage("");

    startTransition(async () => {
      const response = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          date: currentDateTime.toISOString(),
        }),
      });

      if (response.ok) {
        setMessage("Announcement created successfully!");
        setTitle("");
        setContent("");
        mutate("/api/announcements");
      } else {
        const error = await response.json();
        setMessage(`Error: ${error.error || "Failed to create announcement."}`);
      }
    });
  };

  // --- 2. ADDED: Logic to determine message color ---
  const isSuccessMessage = message.startsWith("Announcement");

  return (
    <form onSubmit={handleSubmit} className="space-y-6 w-full max-w-2xl">
      <div>
        <label
          htmlFor="title"
          className="block text-sm font-medium leading-6 text-gray-900"
        >
          Title / Headline
        </label>
        <div className="mt-2">
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="block w-full rounded-md py-2 px-3 text-slate-800 font-medium shadow-md ring-1 ring-inset ring-slate-500 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="content"
          className="block text-sm font-medium leading-6 text-gray-900"
        >
          Content (Optional)
        </label>
        <div className="mt-2">
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{ height: "25vh" }}
            className="block w-full rounded-md py-2 px-3 text-slate-800 font-medium shadow-md ring-1 ring-inset ring-slate-500 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="date"
          className="block text-sm font-medium leading-6 text-gray-900"
        >
          Date & Time (Read-only)
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="date"
            id="date"
            value={currentDateTime.toISOString().split("T")[0]}
            readOnly
            className="block w-full rounded-md py-2 px-3 text-slate-500 bg-slate-100 font-medium shadow-md ring-1 ring-inset ring-slate-500 cursor-not-allowed font-mono"
          />
          <span className="rounded-md py-2 px-3 text-slate-500 bg-slate-100 font-medium shadow-md ring-1 ring-inset ring-slate-500 whitespace-nowrap font-mono">
            {currentDateTime.toLocaleTimeString("en-IN", {
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-bold text-white tracking-wide shadow-lg transform transition-all duration-300 ease-in-out hover:scale-105 hover:-translate-y-px hover:shadow-xl hover:shadow-blue-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-95 disabled:scale-100 disabled:-translate-y-0 disabled:shadow-lg disabled:bg-gradient-to-r disabled:from-blue-400 disabled:to-blue-500 !hover:text-white flex-shrink-0"
        >
          {isPending ? "Publishing..." : "Publish Announcement"}
        </button>

        {/* --- 3. MODIFIED: Conditional styling for the message --- */}
        {message && (
          <p
            className={`ml-4 text-sm font-medium ${
              isSuccessMessage ? "text-green-600" : "text-red-600"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </form>
  );
}

"use client";

import React, { useState, useTransition, useEffect } from "react";
import { mutate } from "swr";
import toast, { Toaster } from "react-hot-toast";
import { EDIT_DELETE_WINDOW_HOURS } from "@/lib/constants";

interface AnnouncementFormProps {
  editId?: string | null;
}

export default function AnnouncementForm({ editId }: AnnouncementFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [initialTitle, setInitialTitle] = useState("");
  const [initialContent, setInitialContent] = useState("");
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [isPending, startTransition] = useTransition();

  const isEdit = !!editId;

  // Load existing data if editId is provided
  useEffect(() => {
    if (editId) {
      fetch(`/api/announcements/${editId}`)
        .then((res) => res.json())
        .then((data) => {
          setTitle(data.title);
          setInitialTitle(data.title);
          setContent(data.content || "");
          setInitialContent(data.content || "");
        })
        .catch(() => toast.error("Failed to load announcement for editing."));
    }
  }, [editId]);

  // Effect to update the time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isTitleValid = title.trim().length > 0;
  const hasChanges =
    title !== initialTitle || (content || "") !== (initialContent || "");
  const isButtonEnabled = isEdit ? isTitleValid && hasChanges : isTitleValid;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    startTransition(async () => {
      const url = isEdit
        ? `/api/announcements/${editId}`
        : "/api/announcements";
      const method = isEdit ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          date: currentDateTime.toISOString(),
        }),
      });

      if (response.ok) {
        if (!isEdit) {
          toast.success(
            `Announcement published! You can modify or delete this for the next ${EDIT_DELETE_WINDOW_HOURS} hours.`,
            { duration: 6000, position: "top-right" },
          );
        } else {
          toast.success("Announcement updated successfully!");
        }

        // Reset form fields
        setTitle("");
        setContent("");
        setInitialTitle("");
        setInitialContent("");

        mutate("/api/announcements?u=");
      } else {
        const error = await response.json();
        toast.error(`Error: ${error.error || "Failed to save announcement."}`);
      }
    });
  };

  return (
    <>
      <Toaster />
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
              style={{ height: "20vh" }}
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
            disabled={isPending || !isButtonEnabled}
            className="rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-bold text-white tracking-wide shadow-lg transform transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0 disabled:hover:shadow-lg hover:scale-105 hover:-translate-y-px hover:shadow-xl hover:shadow-blue-500/30 active:scale-95 flex-shrink-0"
          >
            {isPending
              ? isEdit
                ? "Updating..."
                : "Publishing..."
              : isEdit
                ? "Update Announcement"
                : "Publish Announcement"}
          </button>
        </div>
      </form>
    </>
  );
}

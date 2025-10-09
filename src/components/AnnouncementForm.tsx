'use client';

import React, { useState, useTransition } from 'react';
import { mutate } from 'swr';

export default function AnnouncementForm() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  // The date is still in state, but we won't provide a way to change it
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage('');
    startTransition(async () => {
      const response = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The current date from state is sent automatically
        body: JSON.stringify({ title, content, date }),
      });

      if (response.ok) {
        setMessage('Announcement created successfully!');
        setTitle('');
        setContent('');
        // We don't need to reset the date, it will always be today
        mutate('/api/announcements');
      } else {
        const error = await response.json();
        setMessage(`Error: ${error.error || 'Failed to create announcement.'}`);
      }
    });
  };

  return (
    // Set a max-width on the form itself to control its size
    <form onSubmit={handleSubmit} className="space-y-6 w-full max-w-2xl">
      <div>
        <label htmlFor="title" className="block text-sm font-medium leading-6 text-gray-900">
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
        <label htmlFor="content" className="block text-sm font-medium leading-6 text-gray-900">
          Content (Optional)
        </label>
        <div className="mt-2">
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="block w-full rounded-md py-2 px-3 text-slate-800 font-medium shadow-md ring-1 ring-inset ring-slate-500 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
          />
        </div>
      </div>

      {/* The date field is now read-only */}
      <div>
        <label htmlFor="date" className="block text-sm font-medium leading-6 text-gray-900">
          Date
        </label>
        <div className="mt-2">
          <input
            type="date"
            id="date"
            value={date}
            readOnly // This prevents the admin from changing the date
            className="block w-full rounded-md py-2 px-3 text-slate-500 bg-slate-100 font-medium shadow-md ring-1 ring-inset ring-slate-500 cursor-not-allowed"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-bold text-white tracking-wide shadow-lg transform transition-all duration-300 ease-in-out hover:scale-105 hover:-translate-y-px hover:shadow-xl hover:shadow-blue-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-95 disabled:scale-100 disabled:-translate-y-0 disabled:shadow-lg disabled:bg-gradient-to-r disabled:from-blue-400 disabled:to-blue-500"
        >
          {isPending ? "Publishing..." : "Publish Announcement"}
        </button>
        {message && <p className="text-sm text-gray-600">{message}</p>}
      </div>
    </form>
  );
}
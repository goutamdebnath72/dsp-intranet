// src/components/HelpManualModal.tsx
"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  Type,
  Sparkles,
  Lock,
  Globe,
  Quote,
  Languages,
  BellDot,
  UserRound,
  Megaphone,
  Clock,
  Keyboard,
  ShieldCheck,
} from "lucide-react";
import {
  ANNOUNCEMENT_NEW_THRESHOLD_DAYS,
  CIRCULAR_NEW_THRESHOLD_HOURS,
} from "@/lib/constants";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

// A small presentational helper for a titled section.
function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-slate-100 pb-6 last:border-b-0 last:pb-0">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
          {icon}
        </span>
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
      </div>
      <div className="space-y-2 pl-[42px] text-sm leading-relaxed text-slate-600">
        {children}
      </div>
    </section>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-700">
      {children}
    </span>
  );
}

export default function HelpManualModal({ isOpen, onClose }: Props) {
  // Background scroll-lock (the page scroller is <html>, per globals.css).
  useEffect(() => {
    if (!isOpen) return;
    const html = document.documentElement;
    const scrollBarWidth = window.innerWidth - html.clientWidth;
    const prevOverflow = html.style.overflow;
    const prevPad = html.style.paddingRight;
    html.style.overflow = "hidden";
    if (scrollBarWidth > 0) html.style.paddingRight = `${scrollBarWidth}px`;
    return () => {
      html.style.overflow = prevOverflow;
      html.style.paddingRight = prevPad;
    };
  }, [isOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-10 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-sky-600 to-cyan-600 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-white">
                  DSP Intranet — User Guide
                </h2>
                <p className="mt-0.5 text-sm text-sky-100">
                  How search works, and what the markers mean
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              >
                <X size={22} />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[70vh] space-y-6 overflow-y-auto overscroll-contain p-6">
              {/* Intro */}
              <p className="rounded-lg bg-sky-50 p-3 text-sm text-slate-700">
                Press <Pill>Ctrl</Pill> + <Pill>K</Pill> (or click the search
                bar) to open search from anywhere. One search looks across{" "}
                <strong>circulars</strong>, <strong>announcements</strong>,{" "}
                <strong>intranet sites</strong> and the{" "}
                <strong>employee directory</strong> — each result is labelled so
                you can tell them apart.
              </p>

              {/* Search modes */}
              <Section
                icon={<Search size={17} />}
                title="The three search modes"
              >
                <p>
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                    <Type size={14} /> Headline Match
                  </span>{" "}
                  — searches only the <strong>titles</strong> of circulars and
                  announcements. English, fast, literal. Best when you know
                  roughly what the document is called.
                </p>
                <p>
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                    <Sparkles size={14} /> Smart Semantic
                  </span>{" "}
                  — searches the <strong>full content</strong> by meaning, not
                  just exact words. Understands English, Hindi (हिंदी) and
                  Bengali (বাংলা). Best when you remember the topic but not the
                  title.
                </p>
                <p>
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                    <Lock size={14} /> Executive Deep Synthesis
                  </span>{" "}
                  — reads across many circulars and writes a combined, sourced
                  summary with figures and charts. Available only to executives
                  (tickets starting with <Pill>4</Pill>). Covers circulars only.
                </p>
              </Section>

              {/* Quoted match */}
              <Section
                icon={<Quote size={17} />}
                title="Exact-phrase search"
              >
                <p>
                  Wrap words in double quotes to force an exact match:{" "}
                  <Pill>&quot;retention of company accommodation&quot;</Pill>{" "}
                  finds that phrase verbatim. Without quotes, Smart Semantic
                  matches by meaning. Matched words are{" "}
                  <mark className="rounded-sm bg-yellow-200 px-1">
                    highlighted
                  </mark>{" "}
                  in the result excerpt, and inside an announcement when you open
                  it.
                </p>
              </Section>

              {/* Sites */}
              <Section
                icon={<Globe size={17} />}
                title="Finding intranet sites"
              >
                <p>
                  Type any site or department name — exact, short form, or part
                  of it (e.g. <Pill>ERP</Pill>, <Pill>e-Str</Pill>,{" "}
                  <Pill>attendance</Pill>). Matching sites appear at the top
                  under <strong>Intranet Sites</strong>, each with an{" "}
                  <strong>Open</strong> button that launches the site in a new
                  tab. Sites not yet linked still appear, marked{" "}
                  <em>“Link not available yet.”</em>
                </p>
              </Section>

              {/* People / employee directory */}
              <Section
                icon={<UserRound size={17} />}
                title="Finding people (employee directory)"
              >
                <p>
                  The whole DSP employee list is searchable. There are two ways:
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <strong>By number — instant, as you type:</strong> a 6-digit{" "}
                    <strong>ticket number</strong>, a 10-digit{" "}
                    <strong>CUG mobile number</strong>, or a{" "}
                    <strong>SAIL personal number</strong> (e.g.{" "}
                    <Pill>D111086</Pill>, any case) shows the person immediately —
                    no key to press.
                  </li>
                  <li>
                    <strong>By name — press{" "}
                    <Pill>Enter</Pill>:</strong> type a full name, first, middle
                    or last name and press Enter. The search is{" "}
                    <strong>similar-sounding</strong>: “Goutam” also finds
                    “Gautam”, “Anoop Sirkar” finds “Anup Sarkar”. Honorifics
                    (Mr, Mohd, Dr, Shri…) are ignored, and multi-word names match
                    in order (“Anil Kumar” finds “Anil Kumar Salian”).
                  </li>
                </ul>
                <p>
                  Results show name, ticket, personal number, designation and
                  department. Mobile and email are{" "}
                  <strong>masked</strong> (e.g. <Pill>943479xxxx</Pill>); click{" "}
                  <strong>reveal</strong> to see the full value. Each row also has
                  a <strong>Copy</strong> button that copies the person’s record
                  (including any contact you have revealed).
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <strong>Signed out:</strong> you can search and read the
                    directory, but the <strong>Copy button is disabled</strong>{" "}
                    and the on-screen details <strong>cannot be selected or
                    copied</strong>. Revealing a contact asks you to sign in
                    first.
                  </li>
                  <li>
                    <strong>Signed in:</strong> you can reveal contacts and copy
                    freely — but note that{" "}
                    <strong>every reveal and every copy is recorded</strong>{" "}
                    (who accessed whose contact, which field, whether it was a
                    view or a copy, and when).
                  </li>
                </ul>
              </Section>

              {/* Super-admin: contact access log */}
              <Section
                icon={<ShieldCheck size={17} />}
                title="Contact access log (HOD, C&IT)"
              >
                <p>
                  Because every reveal and copy is recorded, the{" "}
                  <strong>HOD of C&amp;IT</strong> has an exclusive{" "}
                  <strong>Contact Access Log</strong> (Admin → Contact Access
                  Log). No other admin can open it.
                </p>
                <p>
                  It lists every access <strong>newest first</strong>: date &amp;
                  time, the <strong>viewer</strong> (name + ticket), the{" "}
                  <strong>viewed person</strong> (name + ticket), the field, and
                  whether it was a <strong>reveal</strong> or a{" "}
                  <strong>copy</strong>. Excel-like tools help narrow it down:
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <strong>Per-column filters</strong> — a date range, free-text
                    search on the viewer or the viewed person (by name or
                    ticket), and dropdowns for field (mobile / email) and action
                    (reveal / copy).
                  </li>
                  <li>
                    <strong>Sortable columns</strong> — click any header to sort;
                    a running <strong>Total · Reveals · Copies</strong> tally
                    updates as filters change.
                  </li>
                  <li>
                    <strong>Clear filters</strong> resets the whole view in one
                    click.
                  </li>
                </ul>
              </Section>

              {/* Tri-lingual */}
              <Section
                icon={<Languages size={17} />}
                title="Searching in Hindi & Bengali"
              >
                <p>
                  In Smart Semantic mode you can type in English, हिंदी or বাংলা.
                  The search understands all three, so a Hindi query can still
                  find an English circular about the same subject, and vice
                  versa.
                </p>
              </Section>

              {/* Circular red dot */}
              <Section
                icon={<BellDot size={17} />}
                title="The red badge on “Circular (Personnel)”"
              >
                <p>
                  A red badge on the Circular button shows{" "}
                  <strong>how many new circulars</strong> have arrived (the
                  number inside it; “9+” beyond nine).
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <strong>When you are signed in:</strong> the count is
                    personal. It drops as you open each new circular and the
                    badge disappears once you have seen them all.
                  </li>
                  <li>
                    <strong>When you are signed out:</strong> the dot shows to
                    everyone for{" "}
                    <strong>{CIRCULAR_NEW_THRESHOLD_HOURS} hours</strong> after a
                    circular is uploaded, then disappears on its own — opening it
                    does not clear it (the machine may be shared).
                  </li>
                </ul>
              </Section>

              {/* Announcement new chip */}
              <Section
                icon={<Megaphone size={17} />}
                title="The “New” mark on announcements"
              >
                <p>
                  New announcements are flagged in the Announcements &amp;
                  Happenings panel.
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <strong>Signed in:</strong> an announcement is “new” until
                    you open it; opening it clears the mark for you.
                  </li>
                  <li>
                    <strong>Signed out:</strong> anything published within the
                    last{" "}
                    <strong>{ANNOUNCEMENT_NEW_THRESHOLD_DAYS} days</strong> shows
                    as “new” to everyone, then ages out automatically.
                  </li>
                </ul>
              </Section>

              {/* Timings summary */}
              <Section icon={<Clock size={17} />} title="At a glance">
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    Circular “new” window (signed out):{" "}
                    <strong>{CIRCULAR_NEW_THRESHOLD_HOURS} hours</strong>
                  </li>
                  <li>
                    Announcement “new” window (signed out):{" "}
                    <strong>{ANNOUNCEMENT_NEW_THRESHOLD_DAYS} days</strong>
                  </li>
                  <li>
                    Signed-in markers always clear the moment you open the item.
                  </li>
                </ul>
              </Section>

              {/* Shortcuts */}
              <Section icon={<Keyboard size={17} />} title="Keyboard shortcuts">
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <Pill>Ctrl</Pill> + <Pill>K</Pill> — open search
                  </li>
                  <li>
                    <Pill>Enter</Pill> — search people by name (sites, circulars
                    &amp; ID lookups need no key)
                  </li>
                  <li>
                    <Pill>Shift</Pill> + <Pill>Enter</Pill> — new line in the
                    search box
                  </li>
                  <li>
                    <Pill>Esc</Pill> — close search or this guide
                  </li>
                </ul>
              </Section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// src/components/HelpManualModal.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  Sparkles,
  Globe,
  Quote,
  Languages,
  BellDot,
  UserRound,
  Megaphone,
  Clock,
  Keyboard,
  ShieldCheck,
  Lightbulb,
  Users,
  BarChart3,
  Stethoscope,
  Phone,
  CalendarDays,
  FileText,
  FileSearch,
  Layers,
  ChevronDown,
  CornerDownLeft,
  Copy,
  Check,
  ArrowRight,
  Zap,
  Calculator,
} from "lucide-react";
import {
  SAMPLE_SECTIONS,
  RECIPE,
  WEAK_VS_GOOD,
  filterSections,
  splitBlanks,
  type SampleSection,
  type SectionIcon,
} from "@/lib/help/sampleQuestions";
import {
  ANNOUNCEMENT_NEW_THRESHOLD_DAYS,
  CIRCULAR_NEW_THRESHOLD_HOURS,
} from "@/lib/constants";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** which tab to show when the guide opens (default: the sample questions) */
  initialTab?: GuideTab;
  /** a signed-in executive: Deep Synthesis questions will be answered as a briefing */
  isExecutive?: boolean;
  /** puts a sample question in the search bar (the reader still presses Enter) */
  onTry?: (question: string) => void;
};

export type GuideTab = "samples" | "how";

const SECTION_ICONS: Record<SectionIcon, React.ReactNode> = {
  calculator: <Calculator size={17} />,
  lightbulb: <Lightbulb size={17} />,
  users: <Users size={17} />,
  chart: <BarChart3 size={17} />,
  stethoscope: <Stethoscope size={17} />,
  phone: <Phone size={17} />,
  calendar: <CalendarDays size={17} />,
  title: <FileText size={17} />,
  content: <FileSearch size={17} />,
  layers: <Layers size={17} />,
  sparkles: <Sparkles size={17} />,
  megaphone: <Megaphone size={17} />,
};

/** A question with its [blanks] highlighted. */
function QuestionText({ q }: { q: string }) {
  return (
    <>
      {splitBlanks(q).map((p, i) =>
        p.blank ? (
          <span key={i} className="rounded bg-amber-100 px-1 font-medium text-amber-800">
            {p.text}
          </span>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ),
      )}
    </>
  );
}

/** How a question is run: it appears as you type, or it waits for the Enter key. Said on every question, in the same two marks. */
function RunBadge({ instant }: { instant?: boolean }) {
  return instant ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800" title="The result appears as you type. No Enter needed.">
      <Zap size={11} /> Appears as you type · no Enter
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700" title="Type the whole question, then press the Enter key.">
      <CornerDownLeft size={11} /> Press Enter
    </span>
  );
}

/** One sample question: the text, an optional note, "Try it" (types it in the search bar) and "Copy". */
function QuestionRow({ q, note, instant, onTry }: { q: string; note?: string; instant?: boolean; onTry?: (q: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(q);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard not available: the Try button still works */
    }
  };
  return (
    <li className="group flex items-start gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 hover:border-sky-200 hover:bg-sky-50/40">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-snug text-slate-800">
          <QuestionText q={q} />
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-snug text-slate-500">
          <RunBadge instant={instant} />
          {note && <span>{note}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={copy}
          aria-label="Copy this question"
          title="Copy"
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
        </button>
        {onTry && (
          <button
            type="button"
            onClick={() => onTry(q)}
            className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-sky-700"
            title="Put this question in the search bar"
          >
            Try it <ArrowRight size={12} />
          </button>
        )}
      </div>
    </li>
  );
}

/** A section of the sample questions, closed or open. */
function SampleBlock({ s, open, onToggle, isExecutive, onTry }: { s: SampleSection; open: boolean; onToggle: () => void; isExecutive: boolean; onTry?: (q: string) => void }) {
  const count = s.questions.length + (s.ladders?.length ?? 0) * 3;
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-slate-50">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">{SECTION_ICONS[s.icon]}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-slate-800">{s.title}</span>
          <span className="block text-[12px] text-slate-500">{count} sample questions</span>
        </span>
        {s.executivesOnly && (
          <span className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline ${isExecutive ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
            {isExecutive ? "Executives: you can use this" : "Executives only"}
          </span>
        )}
        <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 px-4 py-4">
          <p className="text-[13px] leading-relaxed text-slate-600">{s.covers}</p>
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold leading-snug text-amber-900">
            <Zap size={15} className="mt-0.5 shrink-0" />
            <span>
              <span className="mr-1 uppercase tracking-wide text-amber-700">How to run it:</span>
              {s.howToRun}
            </span>
          </p>
          {s.executivesOnly && !isExecutive && (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-[12.5px] text-slate-600">
              These questions are answered as a combined briefing only for a signed-in executive (ticket starting with 4). Anyone else who tries them gets the normal search.
            </p>
          )}
          <div>
            <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-500">How to ask well</p>
            <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-slate-600">
              {s.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          {(s.patterns?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-500">Fill in the blanks</p>
              <ul className="space-y-1.5">
                {s.patterns!.map((p) => (
                  <QuestionRow key={p} q={p} onTry={onTry} />
                ))}
              </ul>
            </div>
          )}
          {s.questions.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-slate-500"><span className="rounded bg-sky-600 px-1.5 py-0.5 text-[10.5px] text-white">SAMPLES</span> Questions to try, in the shape our search handles</p>
              <ul className="space-y-1.5">
                {s.questions.map((x) => (
                  <QuestionRow key={x.q} q={x.q} note={x.note} instant={x.instant} onTry={onTry} />
                ))}
              </ul>
            </div>
          )}
          {(s.ladders?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-500">The same subject, asked three ways</p>
              <div className="space-y-3">
                {s.ladders!.map((l) => (
                  <div key={l.subject} className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-[13px] font-bold text-slate-700">{l.subject}</p>
                    <ol className="space-y-1.5">
                      {[
                        ["1 · By its title", l.title],
                        ["2 · By its content", l.content],
                        ["3 · Deep: across circulars", l.deep],
                      ].map(([label, q]) => (
                        <li key={label}>
                          <p className="mb-0.5 text-[11.5px] font-semibold text-sky-700">{label}</p>
                          <ul>
                            <QuestionRow q={q} onTry={onTry} />
                          </ul>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** The "Sample questions" tab: how to ask, then every area of the search with questions to try. */
function SamplesTab({ isExecutive, onTry }: { isExecutive: boolean; onTry?: (q: string) => void }) {
  const [text, setText] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(["people"]));
  const shown = useMemo(() => filterSections(text), [text]);
  const searching = text.trim().length >= 2;
  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-[2px] shadow-md">
        <div className="rounded-[10px] bg-white px-4 py-3.5">
          <p className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.14em] text-orange-600">
            <Sparkles size={15} /> Sample questions
          </p>
          <p className="mt-1 text-[15px] font-bold leading-snug text-slate-900">
            Everything on this page is a <span className="rounded bg-orange-100 px-1.5 text-orange-700">sample</span> — it shows the kind of question our search engine can handle.
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
            Read how each one is worded, press <strong>Try it</strong> to put it in the search bar, then ask your own question in the same shape.
          </p>
          <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-700">
            <span className="font-semibold">Every question is marked:</span>
            <RunBadge instant />
            <span className="text-slate-500">the result shows by itself</span>
            <RunBadge />
            <span className="text-slate-500">type the whole question, then press the Enter key</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-sky-50 p-4">
        <p className="mb-2 flex items-center gap-2 text-[14px] font-bold text-sky-900">
          <Lightbulb size={16} /> How to ask a good question
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-slate-700">
          {RECIPE.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
        <p className="mb-1 mt-3 text-[12px] font-bold uppercase tracking-wide text-sky-800">Thin and good</p>
        <ul className="space-y-1.5 text-[13px]">
          {WEAK_VS_GOOD.map((p) => (
            <li key={p.weak} className="rounded-lg bg-white/70 px-3 py-1.5">
              <span className="text-slate-400 line-through">{p.weak}</span>
              <span className="mx-1.5 text-slate-400">→</span>
              <span className="font-medium text-slate-800">{p.good}</span>
              <span className="block text-[12px] text-slate-500">{p.why}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-slate-600">
          <CornerDownLeft size={14} className="mt-0.5 shrink-0" />
          <span>
            <strong>Try it</strong> types the question in the search bar. Change any <span className="rounded bg-amber-100 px-1 text-amber-800">[blank]</span>. A question marked <strong>Press Enter</strong> waits for the <Pill>Enter</Pill> key; one marked <strong>Appears as you type</strong> shows its result by itself.
          </span>
        </p>
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Find a sample question: doctor, holiday, deadline, compare…"
          aria-label="Find a sample question"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
        />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
          No sample question holds all of those words. Try one word, such as <em>holiday</em> or <em>doctor</em>.
        </p>
      ) : (
        <div className="space-y-2.5">
          {shown.map((s) => (
            <SampleBlock key={s.id} s={s} open={searching || openIds.has(s.id)} onToggle={() => toggle(s.id)} isExecutive={isExecutive} onTry={onTry} />
          ))}
        </div>
      )}
      {!searching && (
        <p className="text-center text-[12px] text-slate-400">
          {SAMPLE_SECTIONS.length} areas · answers cite their sources; check the circular before acting on a figure.
        </p>
      )}
    </div>
  );
}

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

export default function HelpManualModal({ isOpen, onClose, initialTab = "samples", isExecutive = false, onTry }: Props) {
  const [tab, setTab] = useState<GuideTab>(initialTab);
  // each time the guide opens it shows the tab it was asked for
  useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [isOpen, initialTab]);

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
            className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-sky-600 to-cyan-600 px-6 pb-0 pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    DSP Intranet — User Guide
                  </h2>
                  <p className="mt-0.5 text-sm text-sky-100">
                    Sample questions that show what our search can handle, and what the markers mean
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
              <div role="tablist" className="mt-4 flex gap-1">
                {([
                  ["samples", "Sample questions"],
                  ["how", "How it works"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      tab === id ? "bg-white text-sky-800" : "text-sky-100 hover:bg-white/15 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="max-h-[70vh] space-y-6 overflow-y-auto overscroll-contain p-6">
              {tab === "samples" ? (
                <SamplesTab isExecutive={isExecutive} onTry={onTry} />
              ) : (
              <>
              {/* Intro */}
              <p className="rounded-lg bg-sky-50 p-3 text-sm text-slate-700">
                Press <Pill>Ctrl</Pill> + <Pill>K</Pill> (or click the search
                bar) to open search from anywhere. Just type and press{" "}
                <Pill>Enter</Pill> — one search box answers about{" "}
                <strong>people</strong>, <strong>doctors and OPD</strong>,{" "}
                <strong>holidays</strong>, <strong>telephone extensions</strong>,{" "}
                <strong>circulars</strong>, <strong>announcements</strong>,{" "}
                <strong>intranet sites</strong>, and a <strong>calculator</strong>{" "}
                with unit and currency converters, date calculations and loan, PF,
                gratuity forms. Not sure how to word a question?
                Open the <strong>Sample questions</strong> tab and press{" "}
                <strong>Try it</strong>.
              </p>

              {/* How search works */}
              <Section
                icon={<Search size={17} />}
                title="How search works — just press Enter"
              >
                <p>
                  There are no search-mode buttons to choose. Numbers and site
                  names resolve <strong>instantly as you type</strong>; for
                  anything else, type your query and press <Pill>Enter</Pill>.
                </p>
                <p>
                  A single <Pill>Enter</Pill> works out what you are asking and
                  uses the right source:
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    a <strong>person</strong> (by name — similar-sounding), or a
                    person in a <strong>named department</strong>;
                  </li>
                  <li>
                    a count or a comparison of <strong>employees</strong> (how
                    many, who heads a department, who is senior);
                  </li>
                  <li>
                    a <strong>doctor</strong>, a department&rsquo;s{" "}
                    <strong>OPD</strong> or the token timings;
                  </li>
                  <li>
                    a <strong>holiday</strong> (a festival, a month, a year, or two
                    years compared);
                  </li>
                  <li>
                    an internal <strong>telephone extension</strong>;
                  </li>
                  <li>
                    a <strong>sum</strong> (<Pill>12*45+7</Pill>), a{" "}
                    <strong>conversion</strong> (<Pill>5 km in miles</Pill>,{" "}
                    <Pill>100 usd to inr</Pill>) or a <strong>date question</strong>{" "}
                    — these answer <strong>as you type</strong>, in your browser,
                    and nothing you type is saved; for <strong>EMI, PF
                    maturity, gratuity</strong> and leave encashment type{" "}
                    <Pill>calculators</Pill> and press Enter;
                  </li>
                  <li>
                    a circular or announcement by its <strong>title</strong>, or
                    by what it <strong>says</strong> (found by meaning).
                  </li>
                </ul>
                <p>
                  The best answer leads. If a name is also{" "}
                  <em>mentioned in circulars</em>, you get the person first and
                  those circulars below.
                </p>
                <p>
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                    <Sparkles size={14} /> Executive Deep Synthesis
                  </span>{" "}
                  has no button: press Enter as usual. When an <strong>executive</strong>{" "}
                  is signed in (tickets starting with <Pill>4</Pill>) and the question
                  needs several circulars built into one answer (compare, what
                  changed, trace, list every, what is hidden), the search reads across
                  the circulars and writes a combined, sourced summary with figures,
                  tables and charts. It takes longer than a normal search. Ask in
                  English. Everyone else gets the normal search. At present it reads
                  the circulars.
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
                  finds that phrase verbatim. Without quotes, search
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
                <p>
                  Typing just a <strong>department name</strong> brings up its
                  site link automatically — no key needed.
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
                    no key to press. You can also type just the{" "}
                    <strong>last 4 digits</strong> of an executive’s CUG mobile
                    (e.g. <Pill>2584</Pill>): the <Pill>943479</Pill> prefix is
                    added for you and the executive appears at once.
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
                  <li>
                    <strong>
                      By part of a name + department — press <Pill>Enter</Pill>:
                    </strong>{" "}
                    when you recall only part of a name, add the department in{" "}
                    <strong>any order</strong> — <Pill>soumit c&amp;it</Pill> or{" "}
                    <Pill>c&amp;it soumit</Pill> both list the matching people in
                    that department (masked, as above). The department’s site
                    link still shows too.
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
                  You can type in English, हिंदी or বাংলা. The search
                  understands all three, so a Hindi query can still
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
                    <Pill>Enter</Pill> — search everything: people, departments,
                    circulars &amp; announcements (numbers &amp; sites need no
                    key)
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
              </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

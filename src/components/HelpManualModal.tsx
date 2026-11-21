// src/components/HelpManualModal.tsx
"use client";

import { lockPageScroll } from "@/lib/ui/scrollLock";
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  Sparkles,
  Languages,
  BellDot,
  UserRound,
  Megaphone,
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
  TOOLS_SECTION,
  RECIPE,
  WEAK_VS_GOOD,
  filterSections,
  splitBlanks,
  type SampleSection,
  type SectionIcon,
} from "@/lib/help/sampleQuestions";
import { QuickReferenceTab } from "@/components/help/QuickReferenceTab";
import { UtilityServicesTab } from "@/components/help/UtilityServicesTab";
import { EdsTab } from "@/components/help/EdsTab";
import { SearchBarIntro } from "@/components/help/SearchBarIntro";
import {
  ANNOUNCEMENT_NEW_THRESHOLD_DAYS,
  CIRCULAR_NEW_THRESHOLD_HOURS,
} from "@/lib/constants";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** which tab to show when the guide opens (default: the sample questions) */
  initialTab?: GuideTab;
  /** a signed-in executive: the Deep search (EDS) tab says so */
  isExecutive?: boolean;
  /** puts a sample question in the search bar (the reader still presses Enter) */
  onTry?: (question: string) => void;
};

/** the four tabs, in order: the main features and their sample questions; how it works (with the list of what to type); the Utility Services; the deep search (EDS) */
export type GuideTab = "samples" | "utility" | "how" | "eds";

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
function SampleBlock({ s, open, onToggle, onTry }: { s: SampleSection; open: boolean; onToggle: () => void; onTry?: (q: string) => void }) {
  const count = s.questions.length;
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-slate-50">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">{SECTION_ICONS[s.icon]}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-slate-800">{s.title}</span>
          <span className="block text-[12px] text-slate-500">{count} sample questions</span>
        </span>
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
        </div>
      )}
    </section>
  );
}

/** The sample questions of the Utility Services, one block (open), at the end of the Utility Services tab. */
function UtilitySamples({ onTry }: { onTry?: (q: string) => void }) {
  const [open, setOpen] = useState(true);
  return <SampleBlock s={TOOLS_SECTION} open={open} onToggle={() => setOpen((v) => !v)} onTry={onTry} />;
}

/** The "Sample questions" tab: how to ask, then every area of the search with questions to try. */
function SamplesTab({ onTry, onOpenUtility }: { onTry?: (q: string) => void; onOpenUtility?: () => void }) {
  const [text, setText] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(["titles"]));
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
      <SearchBarIntro onOpenUtility={onOpenUtility} />
      <div className="overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-[2px] shadow-md">
        <div className="rounded-[10px] bg-white px-4 py-3.5">
          <p className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.14em] text-orange-600">
            <Sparkles size={15} /> Sample questions
          </p>
          <p className="mt-1 text-[15px] font-bold leading-snug text-slate-900">
            Everything on this page is a <span className="rounded bg-orange-100 px-1.5 text-orange-700">sample</span> — it shows the kind of question our search engine can handle.
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
            Read how each one is worded, press <strong>Try it</strong> to put it in the search bar (change any <span className="rounded bg-amber-100 px-1 text-amber-800">[blank]</span>), then ask your own question in the same shape.
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
            <SampleBlock key={s.id} s={s} open={searching || openIds.has(s.id)} onToggle={() => toggle(s.id)} onTry={onTry} />
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
    const lock = lockPageScroll(); // one shared lock (src/lib/ui/scrollLock.ts)
    return () => lock.release();
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
                    What the search bar can do, questions to try, the Utility Services, the short and long commands that open each feature, and what the markers mean
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:!text-white"
                >
                  <X size={22} />
                </button>
              </div>
              {/* hover:!text-… : globals.css sets button:hover to the primary blue with !important, which is invisible on this blue header; the ! keeps the tab text white (the chosen tab stays dark blue on its white) */}
              <div role="tablist" className="mt-4 flex gap-1">
                {([
                  ["samples", "Sample questions"],
                  ["how", "How it works"],
                  ["utility", "Utility Services"],
                  ["eds", "Deep search (EDS)"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      tab === id ? "bg-white text-sky-800 hover:!text-sky-800" : "text-sky-100 hover:bg-white/15 hover:!text-white"
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
                <SamplesTab onTry={onTry} onOpenUtility={() => setTab("utility")} />
              ) : tab === "utility" ? (
                <UtilityServicesTab onTry={onTry}><UtilitySamples onTry={onTry} /></UtilityServicesTab>
              ) : tab === "eds" ? (
                <EdsTab isExecutive={isExecutive} onTry={onTry} />
              ) : (
              <>
              {/* How search works: what the Samples tab does not say. The areas are in the introduction and the sample questions; the two ways to run a question are explained once, above the samples. */}
              <Section
                icon={<Search size={17} />}
                title="How search works — just press Enter"
              >
                <p>
                  There are no search-mode buttons to choose. One{" "}
                  <Pill>Enter</Pill> works out what you are asking (a person, a
                  doctor, a holiday, a circular, a calculation&hellip;) and uses
                  the right source. The areas it covers, and a question to try
                  for each, are on the <strong>Sample questions</strong> tab; the
                  services that open from a few words, such as the news, prices and calculators, are on the <strong>Utility Services</strong> tab; the commands that open every feature, short and long, are in the <strong>What to type</strong> list at the end of this tab.
                </p>
                <p>
                  The best answer leads. If a name is also{" "}
                  <em>mentioned in circulars</em>, you get the person first and
                  those circulars below.
                </p>
              </Section>

              {/* Short and long commands: how to avail a feature */}
              <Section icon={<Zap size={17} />} title="Short and long commands: how to open a feature">
                <p data-own-words>
                  <strong>You need not remember any of these words.</strong>{" "}
                  Write what you want in your own words, in capitals or small
                  letters, and press Enter: <Pill>PLEASE TELL ME THE CURRENT GOLD PRICE IN KOLKATA SIR</Pill>,{" "}
                  <Pill>what will come to my account when i leave service</Pill>.
                  When the box is sure which feature you mean it says{" "}
                  <em>Looks like &hellip; Press Enter to open it</em> while you type. If
                  it is not sure, it first tries on its own, and then asks
                  Gemini, the AI, which feature you mean: only the line you
                  typed goes to Gemini (never a figure you enter in a feature,
                  an ID, a person&rsquo;s number or a name), and the answer is
                  only the name of a feature. If it is none, your line is
                  searched as usual.
                </p>
                <p>
                  When what you type reads as a <strong>person&rsquo;s name</strong>{" "}
                  (one to four words, a whole name or a part of one) the box
                  says <em>Looks like a name. Press Enter to search people</em>{" "}
                  while you type. It is only a hint, worked out in your browser
                  with no AI, and it never stops the search.
                </p>
                <p>
                  Every feature of the <strong>What to type</strong> list (at the
                  end of this tab) can be opened in two ways, and both reach the
                  same card.
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <strong>Short command:</strong> the fewest words, one or
                    two, for someone in a hurry: <Pill>gold price</Pill>,{" "}
                    <Pill>weather</Pill>, <Pill>hindi news</Pill>,{" "}
                    <Pill>dsp history</Pill>, <Pill>sail units</Pill>. It opens
                    the card on its first tab.
                  </li>
                  <li>
                    <strong>Long command:</strong> the same thing asked in
                    full, as a phrase or a question: <Pill>gold rate today</Pill>,{" "}
                    <Pill>durgapur weather report with forecast</Pill>,{" "}
                    <Pill>history of durgapur steel plant</Pill>. A long command
                    can be more exact: it may name the tab (
                    <Pill>sail steel production</Pill> opens the steel card on
                    the SAIL tab, <Pill>heads of dsp</Pill> opens the story card
                    on the Heads tab), a ward (<Pill>ward 22 police station</Pill>), a
                    PIN (<Pill>pin code 713203</Pill>) or a paper (
                    <Pill>dainik bhaskar</Pill>).
                  </li>
                  <li>
                    <strong>Your own figures:</strong> a sum, a conversion, a
                    date, a tyre size, a VIN or a number plate is typed as it is,
                    with your numbers (<Pill>5 km in miles</Pill>,{" "}
                    <Pill>205/55 R16 91V</Pill>); there is no fixed short
                    command, and the tab says so.
                  </li>
                  <li>
                    <strong>Questions:</strong> a person, the hospital, holidays
                    and circulars are asked as a name, a number or a question: a
                    few words (<Pill>gift card circular</Pill>) or a full
                    sentence (<Pill>What is the gift card amount for employees?</Pill>).
                    The more exactly you name the subject, the better the answer.
                  </li>
                </ul>
                <p>
                  Each command is marked <strong>as you type</strong> (the
                  result shows under the search line) or <strong>press Enter</strong>{" "}
                  (a page opens, or a question is answered). In the{" "}
                  <strong>What to type</strong> list, click a command to put it in
                  the search bar.
                </p>
              </Section>

              {/* The management pages: who may open them, what each does, and how the HOD delegates */}
              <Section icon={<ShieldCheck size={17} />} title="Management pages: who may open them, and delegation">
                <p data-management-access className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                  <strong>
                    Currently only the HOD of C&amp;IT can open the management
                    pages, after signing in with his own login credentials.
                  </strong>{" "}
                  He can <strong>delegate</strong> any of these facilities to
                  other executives and non-executives. Nobody else can open
                  them: anyone else who asks for one is told{" "}
                  <em>&ldquo;Not allowed&rdquo;</em>, and nothing is changed.
                </p>
                <p>
                  The management pages change the plant&rsquo;s data, so they
                  are not in the list of what everyone can ask. There are six.
                  Type the words on the right of a page, in the search bar, and
                  press <Pill>Enter</Pill>; the page opens below the box.
                </p>
                <ul data-management-pages className="space-y-2">
                  <li className="rounded-lg border border-slate-200 px-3 py-2">
                    <strong>Employee manager</strong> &mdash; add a new
                    employee, edit an employee&rsquo;s record, delete an
                    employee, and see the history of changes. Type{" "}
                    <Pill>add new employee</Pill> <Pill>edit employee record</Pill>{" "}
                    <Pill>manage employees</Pill>. <em>Only the HOD</em> can
                    delete an employee, and only the HOD sees and changes the
                    dates of birth and joining; a delegate sees those as locked.
                  </li>
                  <li className="rounded-lg border border-slate-200 px-3 py-2">
                    <strong>PAX directory editor</strong> &mdash; add, edit or
                    delete a PAX (telephone extension) number with its
                    department and location. If a line clashes with a saved
                    one, it asks whether to edit the saved line or whether you
                    made a mistake. Type <Pill>add new pax number</Pill>{" "}
                    <Pill>edit pax number</Pill> <Pill>manage pax directory</Pill>.
                  </li>
                  <li className="rounded-lg border border-slate-200 px-3 py-2">
                    <strong>Circular manager</strong> &mdash; post (upload) a
                    circular with its issue date, so that the search can find
                    it, browse the recent circulars, and see the history. Type{" "}
                    <Pill>post circular</Pill> <Pill>upload circular</Pill>{" "}
                    <Pill>manage circulars</Pill>.
                  </li>
                  <li className="rounded-lg border border-slate-200 px-3 py-2">
                    <strong>Announcement manager</strong> &mdash; publish, edit
                    or delete a plant announcement (a title with text, a title
                    with a PDF, or both; one PDF of up to 10 MB; with both,
                    selected words can be made a link that opens the PDF; the
                    PDF is read on publishing so the search bar finds words
                    inside it, and a PDF that could not be read can be read
                    again from its card), see the latest ones, and see the history. Type <Pill>manage announcements</Pill>{" "}
                    <Pill>publish announcement</Pill>.
                  </li>
                  <li className="rounded-lg border border-slate-200 px-3 py-2">
                    <strong>Holiday manager</strong> &mdash; put the holidays of
                    a year in from a checked file (or pasted text), or clear a
                    year (it asks you to type a confirmation first), and see the
                    history. Type <Pill>manage holidays</Pill>{" "}
                    <Pill>seed holidays 2027</Pill> <Pill>clear holidays 2026</Pill>.
                  </li>
                  <li className="rounded-lg border border-slate-200 px-3 py-2">
                    <strong>Contact access log</strong> &mdash; who revealed or
                    copied a person&rsquo;s mobile number or e-mail, with
                    filters, totals and date ranges (today, 7 days, 30 days, all
                    time). Type <Pill>contact access log</Pill>{" "}
                    <Pill>who viewed contacts</Pill>. <em>This one can be
                    delegated to executives only</em>, not to non-executives.
                  </li>
                </ul>
                <p className="font-semibold text-slate-900">How the HOD delegates</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    Open the page and use its <strong>Authorise</strong> tab
                    (called <strong>Authorised people</strong> in the Employee
                    manager and the PAX editor; only the HOD sees it), or type,
                    for example,{" "}
                    <Pill>delegate pax to [name]</Pill>,{" "}
                    <Pill>delegate employee editing to [name]</Pill>,{" "}
                    <Pill>delegate circulars to [name]</Pill>,{" "}
                    <Pill>who can edit pax</Pill>.
                  </li>
                  <li>
                    <strong>Each page is delegated on its own.</strong> Someone
                    authorised for the PAX editor gets nothing else.
                  </li>
                  <li>
                    An <strong>executive</strong> is authorised at once. A{" "}
                    <strong>non-executive</strong> is authorised only after the
                    HOD answers the question &ldquo;Are you sure you want to
                    authorise a non-executive?&rdquo; with a confirmation.
                  </li>
                  <li>
                    <strong>Only the HOD</strong> can authorise or withdraw. A
                    delegate cannot pass the facility on.
                  </li>
                  <li>
                    A withdrawal takes effect <strong>at once</strong> (the
                    authority is checked on every request), and an employee who
                    is deleted from the employee roster loses every
                    authorisation in every page.
                  </li>
                  <li>
                    Every change, by the HOD or by a delegate, and every
                    authorisation and withdrawal, is kept in the page&rsquo;s{" "}
                    <strong>History</strong> tab (called <strong>Recent
                    changes</strong> in the Employee manager and the PAX editor)
                    with who did it and when.
                  </li>
                </ul>
              </Section>

              {/* Live cards: what the samples and the words page do not say */}
              <Section icon={<BarChart3 size={17} />} title="Live cards: source, time and tabs">
                <p>
                  Prices, markets, news, weather, flights, trains, fares, the
                  dearness allowance, inflation, the PIN codes, wards and police
                  stations of Durgapur, and steel (prices, the makers compared)
                  and the story of the Durgapur Steel Plant and its heads appear as <strong>cards</strong>.
                  Every card names its <strong>source</strong> (with a link) and
                  the <strong>time it was fetched</strong> (for saved data, the
                  date it was received or prepared); a source can be late or
                  briefly unavailable, and the card says so instead of guessing.
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <strong>Tabs inside a card</strong> (News: Business, English,
                    Hindi, Bengali; Durgapur areas: PIN codes, DMC Wards,
                    Assembly seats, Police stations; Steel: Prices, DSP products, Companies, SAIL & CPSEs, India & world; DSP story: The story, Who made it, First products, Heads of DSP, SAIL & units; AICPI: Dearness allowance and CPI and
                    inflation; CPI: Combined, Urban, Rural, and the State; Inflation: 1, 3, 5 and 10 years) change the view without a new search.
                  </li>
                  <li>
                    <strong>Charts:</strong> hover (or touch) a column for its
                    exact value. A one-year chart starts on today&rsquo;s
                    date a year back.
                  </li>
                  <li>
                    <strong>Saved figures:</strong> train fares and the
                    consumer price index are kept in the intranet&rsquo;s own
                    database and show the date they were received; the PIN
                    codes, wards, areas and police stations of Durgapur, and
                    the steel figures (the Ministry of Steel&rsquo;s monthly
                    reports, the makers&rsquo; own results and the plant&rsquo;s
                    annual-report production), and the history of the Durgapur
                    Steel Plant with SAIL&rsquo;s photographs, are saved data
                    too. The fares are never fetched live.
                  </li>
                  <li>
                    <strong>When there is no figure for today:</strong> some
                    sources publish nothing on Saturdays, Sundays and holidays
                    (gold rates, the dollar rate, the share market). The card
                    then shows the <strong>last published figure with its date</strong>,
                    and a one-year graph ends on that day. If a source does not
                    answer for a few minutes, the Sensex card shows the last
                    figures it saved, marked <strong>Not live</strong> with the time
                    they were received.
                  </li>
                  <li>
                    <strong>Jumping inside a card:</strong> on the Durgapur
                    areas card, press a PIN on a ward (or a gram panchayat) and
                    the long list opens at the areas with that PIN.
                  </li>
                </ul>
              </Section>

              {/* Contact details: what the people section of the samples does not say */}
              <Section
                icon={<UserRound size={17} />}
                title="Contact details: reveal and copy"
              >
                <p>
                  A person&rsquo;s row shows name, ticket, personal number,
                  designation and department. The{" "}
                  <strong>ticket number, personal number, mobile and email</strong>{" "}
                  are all <strong>masked</strong> (e.g. <Pill>4••••0</Pill>,{" "}
                  <Pill>D•••••2</Pill>, <Pill>943479xxxx</Pill>); click one to see
                  the full value. Each row also has a <strong>Copy</strong> button
                  that copies the person’s record (including anything you have
                  revealed).
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <strong>Signed out:</strong> you can search and read the
                    directory, but the <strong>Copy button is disabled</strong>{" "}
                    and the on-screen details <strong>cannot be selected or
                    copied</strong>. Revealing anything asks you to sign in
                    first, and shows it as soon as you are in.
                  </li>
                  <li>
                    <strong>Signed in:</strong> you can reveal contacts and copy
                    freely — but note that{" "}
                    <strong>every reveal and every copy is recorded</strong>{" "}
                    (who accessed whose detail, which field: mobile, email,
                    personal number or ticket, whether it was a view or a copy,
                    and when). The personal number is also the first password, so
                    only a few of them can be revealed in an hour.
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

              {/* Shortcuts */}
              <Section icon={<Keyboard size={17} />} title="Keyboard shortcuts">
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <Pill>Ctrl</Pill> + <Pill>K</Pill> — open search
                  </li>
                  <li>
                    <Pill>Enter</Pill> — run what you typed
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

              {/* What to type: the list of every feature and the words that open it (it was a tab of its own; merged here so that the guide keeps four tabs) */}
              <div id="what-to-type" data-what-to-type>
                <QuickReferenceTab onTry={onTry} />
              </div>
              </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

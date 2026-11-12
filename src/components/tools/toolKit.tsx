// src/components/tools/toolKit.tsx
//
// THE LOOK OF THE CALCULATORS AND CONVERTERS, in the family of the management windows (employee, PAX): glass cards on a soft gradient with two blurred lights, gradient icon tiles, rounded-3xl frames,
// inputs with an inner shadow and a coloured focus ring. Here are the pieces that have a life of their own:
//   - ToolShell: the frame of a card, with its tone, its Instant pill and an entrance;
//   - Elastic: a box whose height follows its content with a spring (so a long unit name inflates the box and a short one lets it deflate, smoothly);
//   - ToolSelect: the dropdown, with a proper chevron, the WHOLE of a long option visible (it wraps), search when the list is long, the keyboard, and an animated list;
//   - fitSize: the size of a big number, shrinking as it gets longer so that it is always seen whole.
// Nothing here knows any sum. Nothing is stored or sent. Only Tailwind sizes the modal's scale sheet (omniScale.css) knows are used, so all of it follows the modal's text scale.
"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Search, X, Zap } from "lucide-react";
import { ToolNotice } from "./toolAtoms";

export type Tone = "sky" | "amber" | "emerald" | "violet" | "rose";

export interface ToneStyle {
  /** the gradient of icon tiles, chips and chevrons */
  grad: string;
  /** the card frame: border, background, shadow */
  frame: string;
  light1: string;
  light2: string;
  /** a coloured text, a soft background, a focus ring */
  text: string;
  soft: string;
  ring: string;
  /** the dark result panel */
  dark: string;
  border: string;
}

export const TONES: Record<Tone, ToneStyle> = {
  sky: {
    grad: "bg-gradient-to-br from-sky-500 via-cyan-500 to-indigo-500",
    frame: "border-sky-100/80 bg-gradient-to-br from-white via-slate-50 to-sky-50/80 shadow-[0_24px_70px_-28px_rgba(2,132,199,0.45)]",
    light1: "bg-gradient-to-br from-sky-300/40 to-indigo-300/30",
    light2: "bg-gradient-to-tr from-cyan-200/40 to-sky-200/30",
    text: "text-sky-700",
    soft: "bg-sky-50",
    ring: "focus:border-sky-400 focus:ring-sky-100",
    dark: "bg-gradient-to-br from-slate-900 via-indigo-950 to-sky-900",
    border: "border-sky-200",
  },
  amber: {
    grad: "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500",
    frame: "border-amber-100/80 bg-gradient-to-br from-white via-slate-50 to-amber-50/80 shadow-[0_24px_70px_-28px_rgba(234,88,12,0.45)]",
    light1: "bg-gradient-to-br from-amber-300/40 to-rose-300/30",
    light2: "bg-gradient-to-tr from-orange-200/40 to-amber-200/30",
    text: "text-orange-700",
    soft: "bg-amber-50",
    ring: "focus:border-orange-400 focus:ring-orange-100",
    dark: "bg-gradient-to-br from-slate-900 via-rose-950 to-orange-900",
    border: "border-amber-200",
  },
  emerald: {
    grad: "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500",
    frame: "border-emerald-100/80 bg-gradient-to-br from-white via-slate-50 to-emerald-50/80 shadow-[0_24px_70px_-28px_rgba(13,148,136,0.45)]",
    light1: "bg-gradient-to-br from-emerald-300/40 to-cyan-300/30",
    light2: "bg-gradient-to-tr from-teal-200/40 to-emerald-200/30",
    text: "text-emerald-700",
    soft: "bg-emerald-50",
    ring: "focus:border-emerald-400 focus:ring-emerald-100",
    dark: "bg-gradient-to-br from-slate-900 via-teal-950 to-emerald-900",
    border: "border-emerald-200",
  },
  violet: {
    grad: "bg-gradient-to-br from-violet-500 via-indigo-500 to-sky-500",
    frame: "border-violet-100/80 bg-gradient-to-br from-white via-slate-50 to-violet-50/80 shadow-[0_24px_70px_-28px_rgba(109,40,217,0.45)]",
    light1: "bg-gradient-to-br from-violet-300/40 to-sky-300/30",
    light2: "bg-gradient-to-tr from-indigo-200/40 to-violet-200/30",
    text: "text-violet-700",
    soft: "bg-violet-50",
    ring: "focus:border-violet-400 focus:ring-violet-100",
    dark: "bg-gradient-to-br from-slate-900 via-violet-950 to-indigo-900",
    border: "border-violet-200",
  },
  rose: {
    grad: "bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-500",
    frame: "border-rose-100/80 bg-gradient-to-br from-white via-slate-50 to-rose-50/80 shadow-[0_24px_70px_-28px_rgba(225,29,72,0.45)]",
    light1: "bg-gradient-to-br from-rose-300/40 to-fuchsia-300/30",
    light2: "bg-gradient-to-tr from-pink-200/40 to-rose-200/30",
    text: "text-rose-700",
    soft: "bg-rose-50",
    ring: "focus:border-rose-400 focus:ring-rose-100",
    dark: "bg-gradient-to-br from-slate-900 via-rose-950 to-fuchsia-900",
    border: "border-rose-200",
  },
};

/** useLayoutEffect on the browser, useEffect where there is no browser (the tests, a server render): no warning either way */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const SPRING = { type: "spring" as const, stiffness: 260, damping: 28, mass: 0.9 };

/* ---------------------------------- shell ---------------------------------- */

export interface ToolShellProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  tone?: Tone;
  instant?: boolean;
  onClose?: () => void;
  /** the card downloads the public rate table (said in the notice) */
  rates?: boolean | string;
  children: React.ReactNode;
}

/** The frame of a calculator card. */
export function ToolShell({ title, subtitle, icon, tone = "sky", instant, onClose, rates, children }: ToolShellProps) {
  const t = TONES[tone];
  const calm = useReducedMotion();
  return (
    <motion.section
      aria-label={title}
      initial={calm ? false : { opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING}
      className={`relative isolate mb-3 rounded-3xl border p-4 sm:p-5 ${t.frame}`}
    >
      {/* the lights are clipped in a box of their own, so that a dropdown list may reach beyond the card */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <span className={`absolute -right-24 -top-28 h-72 w-72 rounded-full blur-3xl ${t.light1}`} />
        <span className={`absolute -bottom-32 -left-24 h-72 w-72 rounded-full blur-3xl ${t.light2}`} />
      </span>
      <div className="mb-4 flex items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ring-4 ring-white/70 ${t.grad}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold leading-tight text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs leading-snug text-slate-500">{subtitle}</p>}
        </div>
        {instant && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 shadow-sm">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" /></span>
            <Zap size={11} aria-hidden="true" /> Instant
          </span>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close this calculator" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 shadow-sm transition hover:rotate-90 hover:border-slate-300 hover:text-slate-800">
            <X size={16} />
          </button>
        )}
      </div>
      {children}
      <ToolNotice rates={rates} />
    </motion.section>
  );
}

/* --------------------------------- elastic --------------------------------- */

/** A box whose height follows what is in it: when the content grows (a long unit name wraps onto a second line) the box inflates with a spring, and when it shrinks it deflates. */
export function Elastic({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);
  const calm = useReducedMotion();
  useIsoLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    setH(el.getBoundingClientRect().height);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setH(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div initial={false} animate={h === null ? undefined : { height: h }} transition={calm ? { duration: 0 } : SPRING} style={h === null ? undefined : { overflow: "hidden" }} className={className}>
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}

/** The size class of a big number: the longer it is, the smaller, so that it is always seen whole. */
export function fitSize(text: string, scale: "hero" | "big" = "hero"): string {
  const n = text.length;
  if (scale === "big") return n <= 10 ? "text-2xl" : n <= 16 ? "text-xl" : n <= 22 ? "text-lg" : "text-base";
  return n <= 8 ? "text-4xl" : n <= 12 ? "text-3xl" : n <= 17 ? "text-2xl" : n <= 24 ? "text-xl" : "text-lg";
}

/* --------------------------------- select --------------------------------- */

export interface SelectOption {
  id: string;
  label: string;
  hint?: string;
}

/** the index to move to on an arrow key: stays inside the list, never beyond either end */
export function nextIndex(current: number, key: "ArrowDown" | "ArrowUp" | "Home" | "End", length: number): number {
  if (length <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (current < 0) return key === "ArrowDown" ? 0 : length - 1;
  return key === "ArrowDown" ? Math.min(length - 1, current + 1) : Math.max(0, current - 1);
}

/** the options that match what was typed in the search box (every typed word must be in the label) */
export function filterOptions(options: SelectOption[], query: string): SelectOption[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  return options.filter((o) => { const l = `${o.label} ${o.hint ?? ""}`.toLowerCase(); return words.every((w) => l.includes(w)); });
}

/**
 * Where a dropdown list goes. Measured BEFORE it opens: the room below the button against the height the list normally has; below is the first choice; if it does not fit there but fits
 * above, above; if it fits on neither side it takes the larger side and its list scrolls inside the room there is. It is drawn over everything (a portal on the page, position fixed),
 * so no window, bar or scrolling area it sits in can hide any part of it.
 */
export function placeList(buttonTop: number, buttonBottom: number, viewportHeight: number, natural: number, margin = 12, gap = 8): { up: boolean; room: number } {
  const below = viewportHeight - buttonBottom - gap - margin;
  const above = buttonTop - gap - margin;
  if (below >= natural) return { up: false, room: below };
  if (above >= natural) return { up: true, room: above };
  return below >= above ? { up: false, room: Math.max(96, below) } : { up: true, room: Math.max(96, above) };
}

/** the height a list normally has: its rows (about 2.5 rem each) and its search box, never more than 20 rem */
export function naturalListHeight(rows: number, searchable: boolean): number {
  return Math.min(320, 16 + (searchable ? 56 : 0) + rows * 40);
}

interface ListPos {
  up: boolean;
  room: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  minWidth: number;
  maxWidth: number;
  k: string;
}

type SelectVariant = "kind" | "unit" | "field";

const VARIANT: Record<SelectVariant, { button: string; label: string }> = {
  kind: { button: "rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm hover:border-slate-300", label: "text-base font-bold text-slate-900" },
  unit: { button: "rounded-b-3xl px-4 py-3", label: "text-sm font-semibold" },
  field: { button: "min-h-[3rem] rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 shadow-inner hover:border-slate-300", label: "text-sm text-slate-900" },
};

export interface ToolSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (id: string) => void;
  ariaLabel: string;
  id?: string;
  tone?: Tone;
  variant?: SelectVariant;
  /** on a dark panel: light text */
  dark?: boolean;
  className?: string;
  /** the list opens towards the right edge instead of the left */
  alignRight?: boolean;
  placeholder?: string;
}

/**
 * The dropdown of the tools. The button shows the WHOLE of the chosen option (a long name wraps onto more lines and the box inflates and deflates with a spring); the chevron turns over when
 * the list opens; the list animates in, scrolls when long, can be searched (more than eight options), and is driven from the keyboard (arrows, Home, End, Enter, Escape, type to search).
 * Escape closes only the list, never the search window around it.
 */
export function ToolSelect({ value, options, onChange, ariaLabel, id, tone = "sky", variant = "field", dark, className = "", alignRight, placeholder }: ToolSelectProps) {
  const t = TONES[tone];
  const calm = useReducedMotion();
  const uid = useId();
  const listId = `${id ?? uid}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<ListPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const searchable = options.length > 8;
  const shown = useMemo(() => filterOptions(options, query), [options, query]);
  const current = options.find((o) => o.id === value);

  const close = useCallback((refocus = true) => { setOpen(false); setQuery(""); if (refocus) btn.current?.focus(); }, []);
  /** measure the button and the window now, and decide where the list goes */
  const place = useCallback((): ListPos | null => {
    const el = btn.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const { up, room } = placeList(r.top, r.bottom, vh, naturalListHeight(options.length, options.length > 8));
    const k = getComputedStyle(el).getPropertyValue("--omni-k").trim() || "1"; // the text scale of the search window, so that the list's text is the same size
    const p: ListPos = { up, room, minWidth: r.width, maxWidth: 416, k };
    if (alignRight) { p.right = Math.max(8, vw - r.right); p.maxWidth = Math.min(416, r.right - 8); } else { p.left = Math.max(8, Math.min(r.left, vw - 8 - Math.min(r.width, 200))); p.maxWidth = Math.min(416, vw - p.left - 8); }
    if (up) p.bottom = vh - r.top + 8; else p.top = r.bottom + 8;
    return p;
  }, [options.length, alignRight]);

  const openList = useCallback(() => {
    btn.current?.focus(); // a click does not focus a button in every browser; the keys (and Escape, which must close only the list) go to the focused element
    setPos(place());
    setActive(Math.max(0, options.findIndex((o) => o.id === value)));
    setOpen(true);
  }, [options, value, place]);

  // while open: follow the button when the page or the scrolling area moves or the window changes size; close when the button leaves the window
  useEffect(() => {
    if (!open) return;
    const follow = (e?: Event) => {
      if (e && e.target instanceof Node && pop.current?.contains(e.target)) return; // the list's own scrolling
      const r = btn.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) { close(false); return; }
      setPos(place());
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => { window.removeEventListener("scroll", follow, true); window.removeEventListener("resize", follow); };
  }, [open, place, close]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { const n = e.target as Node; if (wrap.current && !wrap.current.contains(n) && !pop.current?.contains(n)) close(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open, close]);
  useEffect(() => { if (open && searchable) search.current?.focus(); }, [open, searchable]);
  useEffect(() => { setActive(shown.length ? 0 : -1); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const choose = (o: SelectOption) => { onChange(o.id); close(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { if (open) { e.preventDefault(); e.stopPropagation(); close(); } return; }
    if (e.key === "Tab") { if (open) close(false); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
      e.preventDefault(); e.stopPropagation();
      if (!open) { openList(); return; }
      setActive((a) => nextIndex(a, e.key as "ArrowDown", shown.length));
      return;
    }
    if (e.key === "Enter" || (e.key === " " && e.target === btn.current)) {
      e.preventDefault(); e.stopPropagation();
      if (!open) { openList(); return; }
      if (shown[active]) choose(shown[active]);
    }
  };

  const v = VARIANT[variant];
  const chevron = (
    <motion.span animate={{ rotate: open ? 180 : 0 }} transition={calm ? { duration: 0 } : SPRING} className={`ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white shadow-sm ${t.grad}`} aria-hidden="true">
      <ChevronDown size={14} strokeWidth={3} />
    </motion.span>
  );

  return (
    <div ref={wrap} data-select-open={open} className={`relative ${className}`}>
      <button
        ref={btn}
        type="button"
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        data-value={value}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
        className={`group flex w-full items-start gap-2 text-left outline-none transition focus-visible:ring-4 ${dark ? "text-white hover:bg-white/10 focus-visible:ring-white/20" : `${t.ring.replace("focus:", "focus-visible:")}`} ${v.button}`}
      >
        <Elastic className="min-w-0 flex-1">
          <motion.span key={value} initial={calm ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={`block break-words leading-snug ${v.label} ${dark ? "text-white" : ""}`}>
            {current?.label ?? placeholder ?? "Choose…"}
          </motion.span>
        </Elastic>
        <span className="mt-0.5 flex shrink-0">{chevron}</span>
      </button>

      {mounted && createPortal(
        <AnimatePresence>
          {open && pos && (
            <div
              ref={pop}
              data-select-open="true"
              className="omni-scale fixed z-[300]"
              style={{ top: pos.top, bottom: pos.bottom, left: pos.left, right: pos.right, minWidth: pos.minWidth, maxWidth: pos.maxWidth, width: "max-content", "--omni-k": pos.k } as React.CSSProperties}
            >
              <motion.div
                initial={calm ? false : { opacity: 0, scale: 0.96, y: pos.up ? 6 : -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
                transition={SPRING}
                style={{ transformOrigin: `${alignRight ? "right" : "left"} ${pos.up ? "bottom" : "top"}` }}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl shadow-slate-900/20 ring-1 ring-black/5 backdrop-blur"
              >
            {searchable && (
                <div className="relative border-b border-slate-100 p-2">
                  <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} aria-label={`Search ${ariaLabel}`} placeholder="Type to search…" autoComplete="off" spellCheck={false} className={`h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-900 outline-none focus:ring-4 ${t.ring}`} />
                </div>
              )}
              <ul ref={list} id={listId} role="listbox" aria-label={ariaLabel} style={{ maxHeight: Math.max(96, Math.min(320, pos?.room ?? 256) - (searchable ? 56 : 0) - 8) }} className="overflow-auto p-1.5">
                {shown.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Nothing matches.</li>}
                {shown.map((o, i) => {
                  const selected = o.id === value;
                  return (
                    <li
                      key={o.id}
                      role="option"
                      aria-selected={selected}
                      data-active={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(o)}
                      className={`flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2 text-sm leading-snug transition-colors ${i === active ? `${t.soft} text-slate-900` : "text-slate-700"} ${selected ? "font-semibold" : ""}`}
                    >
                      <span className="min-w-0 flex-1 break-words">{o.label}{o.hint && <span className="block text-xs font-normal text-slate-500">{o.hint}</span>}</span>
                      {selected && <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${t.grad}`}><Check size={12} strokeWidth={3} /></span>}
                    </li>
                  );
                })}
              </ul>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

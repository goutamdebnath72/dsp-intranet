// src/components/tools/live/LiveStories.tsx
//
// A LIVE WALL OF HEADLINE CARDS, each one a ROLLER, in the manner of a departure board: it keeps itself current, and the screen never jumps.
//   - ONE STORY, ONE CARD. A card is a story (src/lib/live/rss.ts, mergeFeeds): the same event from several papers is one card, shown under the identity of the FIRST report and by the LATEST headline,
//     with the other papers named. Cards are ordered by when their story began, newest first, and a card never changes its place when its story develops.
//   - A card turns like a drum about an axis behind it. When its story develops (another paper adds a later headline) THAT card alone rolls: the old headline turns up and away, the new one turns in from
//     below, and the card says "Updated" and where the story began. A new story rolls in at the top, the others gliding down a card's height; a story that leaves rolls away. On first showing, the cards
//     roll in one after another. Several rolling at once are staggered 140 ms apart, never together, and only transforms and opacity move (smooth, no layout shifts).
//   - Every card has the same height (two lines of headline, three on a phone; the whole headline is in its tooltip), so a roll never changes the size of anything around it.
//   - While you are READING (the pointer is over the list, a link has the keyboard focus, or you have scrolled down) arrivals and developments are HELD, so that nothing turns under your hand: a small
//     pill, "2 new · 1 updated", floats at the top (taking no room in the list); click it, or take the pointer away at the top, and the cards roll.
//   - Times ("12 min ago") tick on their own every 15 seconds. Reduced-motion users get the same cards with a plain fade and no turning.
// The data and their refresh are the card's (NewsCard.tsx, useLive); this component only shows them. Nothing typed is sent anywhere.
"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, RotateCw } from "lucide-react";
import { DateTime } from "luxon";
import { diffStories, storyKey, type FeedItem } from "@/lib/live/rss";
import { ago } from "./StoryList";

/** how long a story keeps its NEW chip after it comes in */
export const NEW_CHIP_MS = 90_000;
/** a story newer than this has its time in green */
export const RECENT_MIN = 30;
/** the pause between one rolling card and the next, in seconds */
export const ROLL_STAGGER = 0.14;
/** the pause between one card and the next when the wall is first shown, in seconds */
export const FIRST_STAGGER = 0.07;
/** the radius of the drum in pixels: the card turns about an axis this far behind it (about half its height) */
const DRUM = 46;
/** seconds of a roll in, and out */
const ROLL_IN = 0.7, ROLL_OUT = 0.55;
const EASE = [0.4, 0, 0.2, 1] as const;

const CHIP = ["bg-sky-100 text-sky-800", "bg-rose-100 text-rose-800", "bg-emerald-100 text-emerald-800", "bg-violet-100 text-violet-800", "bg-amber-100 text-amber-800", "bg-cyan-100 text-cyan-800"];
export const chipOf = (source: string) => CHIP[[...source].reduce((a, c) => a + c.charCodeAt(0), 0) % CHIP.length];

/** is this story under half an hour old at `now`? (no time, no claim) */
export function isRecent(iso: string, now: DateTime): boolean {
  if (!iso) return false;
  const d = DateTime.fromISO(iso);
  return d.isValid && now.diff(d, "minutes").minutes < RECENT_MIN;
}

/** the headline on the card is a LATER headline than the story's first report (the story has developed) */
export const isUpdated = (it: FeedItem): boolean => !!it.id && it.id !== it.link;

export type Plan<T> = { kind: "idle" } | { kind: "hold"; added: number; changed: number } | { kind: "apply"; added: T[]; changed: T[] };

/**
 * What to do when a refresh arrives, as a plain decision: nothing (the same cards), hold it (someone is reading and there are new stories or developments: say how many), or take it in (nobody is
 * reading). A refresh that only removes stories, or only changes which papers are named, waits for a moment of no reading too, so that nothing changes under the hand.
 */
export function planRefresh<T extends FeedItem>(shown: T[], items: T[], reading: boolean): Plan<T> {
  const { added, removed, changed } = diffStories(shown, items);
  const richer = items.some((i) => { const o = shown.find((s) => storyKey(s) === storyKey(i)); return !!o && o.link === i.link && (o.also ?? []).join("|") !== (i.also ?? []).join("|"); });
  if (!added.length && !removed.length && !changed.length && !richer) return { kind: "idle" };
  if (reading) return added.length || changed.length ? { kind: "hold", added: added.length, changed: changed.length } : { kind: "idle" };
  return { kind: "apply", added, changed };
}

/** "↑ 2 new stories", "↻ 1 updated story", "↑ 2 new · 1 updated" */
export function pillText(added: number, changed: number): string {
  const parts = [added ? `${added} new${changed ? "" : added === 1 ? " story" : " stories"}` : "", changed ? `${changed} updated${added ? "" : changed === 1 ? " story" : " stories"}` : ""].filter(Boolean);
  return `${added ? "↑ " : "↻ "}${parts.join(" · ")}`;
}

/** the seconds each rolling card waits, by the link of the headline it shows: the cards that roll together are staggered, in the order of the wall */
export type Delays = Record<string, number>;

/** the roll of a card: it turns about an axis behind it, in from below and out upward; with reduced motion a plain fade */
export function rollVariants(link: string, calm: boolean) {
  const wait = (d: Delays) => d?.[link] ?? 0;
  return calm
    ? {
        enter: { opacity: 0 },
        center: (d: Delays) => ({ opacity: 1, transition: { delay: wait(d), duration: 0.2 } }),
        exit: (d: Delays) => ({ opacity: 0, transition: { delay: wait(d), duration: 0.2 } }),
      }
    : {
        enter: { rotateX: 90, opacity: 0 },
        center: (d: Delays) => ({ rotateX: 0, opacity: 1, transition: { delay: wait(d), duration: ROLL_IN, ease: EASE } }),
        exit: (d: Delays) => ({ rotateX: -90, opacity: 0, pointerEvents: "none" as const, transition: { delay: wait(d), duration: ROLL_OUT, ease: EASE } }),
      };
}

export function LiveStories({ items, lang, empty }: { items: FeedItem[]; lang?: string; empty: string }) {
  const calm = !!useReducedMotion();
  const [shown, setShown] = useState<FeedItem[]>(items);
  const [pending, setPending] = useState({ added: 0, changed: 0 });
  const [freshAt, setFreshAt] = useState<Record<string, number>>({});
  // the first showing: the cards roll in one after another
  const [delays, setDelays] = useState<Delays>(() => Object.fromEntries(items.map((it, i) => [it.link, FIRST_STAGGER * i])));
  const [now, setNow] = useState(() => DateTime.now());
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [said, setSaid] = useState("");
  const top = useRef<HTMLDivElement>(null);
  const settled = useRef(false);

  // the clock of the page: times and chips are re-read every 15 seconds
  useEffect(() => {
    settled.current = true;
    const t = setInterval(() => setNow(DateTime.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // is the top of the list in view? (scrolled away = reading further down)
  useEffect(() => {
    const el = top.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setAtTop(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const reading = hover || focus || !atTop;

  const apply = (next: FeedItem[], added: FeedItem[], changed: FeedItem[]) => {
    // the cards that roll, in the order of the wall, each a beat after the one before (a changed card's OLD headline leaves on the same beat its new one comes in)
    const addedKeys = new Set(added.map(storyKey)), changedKeys = new Set(changed.map(storyKey));
    const d: Delays = {};
    let k = 0;
    for (const it of next) {
      const key = storyKey(it);
      if (!addedKeys.has(key) && !changedKeys.has(key)) continue;
      d[it.link] = k * ROLL_STAGGER;
      const before = shown.find((s) => storyKey(s) === key);
      if (before) d[before.link] = k * ROLL_STAGGER;
      k++;
    }
    setDelays(d);
    setShown(next);
    setPending({ added: 0, changed: 0 });
    if (added.length) {
      const at = Date.now();
      setFreshAt((f) => ({ ...f, ...Object.fromEntries(added.map((a) => [storyKey(a), at])) }));
    }
    if (added.length || changed.length) setSaid(`${added.length ? `${added.length} new ${added.length === 1 ? "story" : "stories"}` : ""}${added.length && changed.length ? ", " : ""}${changed.length ? `${changed.length} updated` : ""}`);
  };

  // a refresh arrived: take it in at once when nobody is reading, otherwise hold it and say how many are waiting
  useEffect(() => {
    const plan = planRefresh(shown, items, reading);
    if (plan.kind === "idle") { if (pending.added || pending.changed) setPending({ added: 0, changed: 0 }); return; }
    if (plan.kind === "hold") { if (plan.added !== pending.added || plan.changed !== pending.changed) setPending({ added: plan.added, changed: plan.changed }); return; }
    apply(items, plan.added, plan.changed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, reading]);

  const showNow = () => {
    const d = diffStories(shown, items);
    apply(items, d.added, d.changed);
    top.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "nearest" });
  };

  if (!shown.length) return <p className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-600">{empty}</p>;
  const spring = calm ? { duration: 0 } : { type: "spring" as const, stiffness: 340, damping: 32, mass: 0.9 };
  const first = !settled.current;
  const havePending = pending.added > 0 || pending.changed > 0;
  return (
    <div lang={lang}>
      <div ref={top} aria-hidden="true" className="h-px" />
      {/* the pill takes no room in the list: a zero-height, sticky holder */}
      <div className="sticky top-2 z-20 h-0 overflow-visible">
        <AnimatePresence>
          {havePending && (
            <motion.button
              key="pill"
              type="button"
              onClick={showNow}
              initial={calm ? false : { opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={calm ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.95 }}
              transition={spring}
              className="absolute left-1/2 -top-4 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900 px-4 py-1.5 text-xs font-extrabold text-white shadow-xl shadow-slate-900/30 ring-2 ring-white transition hover:bg-slate-800"
            >
              {pillText(pending.added, pending.changed)}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{said}</p>
      <ol
        className="relative grid gap-2"
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false); }}
      >
        <AnimatePresence initial={first} mode="popLayout" custom={delays}>
          {shown.map((it) => {
            const id = storyKey(it);
            const at = freshAt[id];
            const isNew = at !== undefined && Date.now() - at < NEW_CHIP_MS;
            const recent = isRecent(it.publishedAt, now);
            const updated = isUpdated(it);
            // under the headline: where a developed story began, or the other papers that carried it
            const began = updated ? `first reported by ${it.firstSource ?? "another paper"}${it.firstAt ? ` ${ago(it.firstAt, now)}` : ""}${it.also?.filter((n) => n !== it.firstSource).length ? ` · also ${it.also.filter((n) => n !== it.firstSource).join(", ")}` : ""}` : it.also?.length ? `also in ${it.also.join(", ")}` : "";
            return (
              // the slot: a fixed height, so that a roll never changes the size of anything around it; it only glides when cards above it come or go
              <motion.li key={it.link} layout={calm ? false : "position"} transition={spring} className="relative h-[108px] [perspective:900px] sm:h-[88px]">
                {/* the card: a drum that turns about an axis behind it (the slot gives the perspective, so that a card at rest is exactly its own size) */}
                <motion.div
                  custom={delays}
                  variants={rollVariants(it.link, calm)}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  style={calm ? undefined : { originX: 0.5, originY: 0.5, originZ: -DRUM, backfaceVisibility: "hidden" }}
                  className="absolute inset-0"
                >
                  <a href={it.link} target="_blank" rel="noopener noreferrer" title={it.title} className={`group relative flex h-full items-start gap-3 overflow-hidden rounded-2xl border bg-white/90 border-slate-200 px-3.5 py-2.5 shadow-sm transition-[border-color,box-shadow] hover:border-slate-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500`}>
                    {at !== undefined && !calm && <motion.span aria-hidden="true" initial={{ opacity: 0.7 }} animate={{ opacity: 0 }} transition={{ duration: 2.6, ease: "easeOut" }} className="pointer-events-none absolute inset-0 bg-emerald-300/40" />}
                    <span className="relative flex h-full min-w-0 flex-1 flex-col justify-center gap-1.5">
                      <span className="line-clamp-3 text-sm font-semibold leading-snug text-slate-900 group-hover:underline sm:line-clamp-2">{it.title}</span>
                      <span className="flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap text-xs">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${chipOf(it.source)}`}>{it.source}</span>
                        {it.publishedAt && (
                          <span className={`shrink-0 tabular-nums ${recent ? "font-bold text-emerald-700" : "text-slate-500"}`}>
                            {recent && <span aria-hidden="true" className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />}
                            {ago(it.publishedAt, now)}
                          </span>
                        )}
                        {updated && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-800"><RotateCw size={10} aria-hidden="true" />Updated</span>}
                        {isNew && <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">New</span>}
                        {began && <span className="min-w-0 truncate text-slate-500">{began}</span>}
                      </span>
                    </span>
                    <ArrowUpRight size={16} className="relative mt-1 shrink-0 text-slate-300 transition group-hover:text-slate-600" />
                  </a>
                </motion.div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </div>
  );
}

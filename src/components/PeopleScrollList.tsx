// src/components/PeopleScrollList.tsx
"use client";

// THE SCROLLING LIST OF THE "PEOPLE & EVENTS" WIDGET (step 65a): one component for the three lists (birthdays today, retirements this month, silver jubilees this month), replacing the two
// mock-data lists. The cards and the scrolling are the ones the widget already had: a card with the photo and three lines, the list loops without a seam, pauses while the mouse is over it,
// and scrolls UP (birthdays) or DOWN (retirements, silver jubilees).
// What is new: real people; the initials when a person has no photo (or the photo does not load); a sentence when the list is empty; and the list is repeated for the seamless loop ONLY
// when it really is taller than its box (with one or two people the repeat would show as a second, identical card).

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { DIRECTION, SCROLL_CONFIG, type Direction } from "@/lib/SCROLL_CONFIG";
import { ZONE } from "@/lib/peopleEvents/rules";
import type { PersonEvent } from "@/lib/peopleEvents/query";

export type CardKind = "birthday" | "retirement" | "jubilee";

/** "2026-10-31" -> "Oct 31, 2026" (the form the retirement card already used). */
export const dayText = (iso: string | null | undefined): string => (iso ? DateTime.fromISO(iso, { zone: ZONE }).toFormat("LLL dd, yyyy") : "");

/** The first letter of the first and of the last word of the name: "MOHD ANWAR ULLAH" -> "MU". */
export const initialsOf = (name: string): string => {
  const w = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
};

const PHOTO_STYLE: React.CSSProperties = { width: "64px", height: "80px", objectFit: "cover", borderRadius: "0.125rem" };

export function Avatar({ person }: { person: Pick<PersonEvent, "name" | "imageUrl"> }) {
  const [broken, setBroken] = useState(false);
  if (person.imageUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={person.imageUrl} alt={person.name} style={PHOTO_STYLE} className="flex-shrink-0" loading="lazy" onError={() => setBroken(true)} />;
  }
  return (
    <div style={PHOTO_STYLE} className="flex flex-shrink-0 items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-lg font-bold text-slate-600" role="img" aria-label={person.name} data-avatar="initials">
      {initialsOf(person.name)}
    </div>
  );
}

export function PersonCard({ person, kind }: { person: PersonEvent; kind: CardKind }) {
  return (
    <div className="flex items-center gap-3 p-2 bg-white rounded-md border border-neutral-200/80 shadow-sm" data-person-card={kind}>
      <Avatar person={person} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-800 truncate">{person.name}</p>
        <p className="text-xs text-neutral-600 truncate">{person.designation}</p>
        <p className="text-xs text-neutral-500 truncate">{person.department}</p>
        {kind === "retirement" && person.on && <p className="text-xs text-red-500 font-medium">Retiring: {dayText(person.on)}</p>}
        {kind === "jubilee" && person.on && <p className="text-xs text-amber-600 font-medium">25 years: {dayText(person.on)}</p>}
      </div>
    </div>
  );
}

export function PeopleScrollList({ people, direction, kind, emptyText }: { people: PersonEvent[]; direction: Direction; kind: CardKind; emptyText: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isHoveringRef = useRef(false);
  const listHeightRef = useRef(0);
  const [loop, setLoop] = useState(false);
  const { speedPxPerSec, gapHeight } = SCROLL_CONFIG;

  // is the list taller than its box? only then it is repeated and scrolled
  const measure = useCallback(() => {
    const box = boxRef.current, list = listRef.current;
    if (!box || !list) return;
    const oneSet = loop ? list.scrollHeight / 2 : list.scrollHeight;
    listHeightRef.current = loop ? oneSet : 0;
    const needs = oneSet > box.clientHeight + 1;
    if (needs !== loop) setLoop(needs);
  }, [loop]);

  useEffect(() => {
    const t = setTimeout(measure, 50);
    let r: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(r); r = setTimeout(measure, 100); };
    window.addEventListener("resize", onResize);
    return () => { clearTimeout(t); clearTimeout(r); window.removeEventListener("resize", onResize); };
  }, [measure, people]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || !loop) return;
    box.scrollTop = 0;
    let rafId: number | null = null;
    let lastTs = performance.now();
    let accumulated = 0;
    const tick = (ts: number) => {
      const el = boxRef.current;
      if (!el || !listRef.current) return;
      const dt = Math.min(40, ts - lastTs);
      lastTs = ts;
      if (!isHoveringRef.current) {
        const h = listHeightRef.current;
        if (h > 0 && el.scrollHeight > el.clientHeight) {
          accumulated += (speedPxPerSec * dt * direction) / 1000;
          if (accumulated >= h && direction === DIRECTION.UP) accumulated -= h;
          if (accumulated <= 0 && direction === DIRECTION.DOWN) accumulated += h;
          el.scrollTop = accumulated;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    const startup = setTimeout(() => { lastTs = performance.now(); rafId = requestAnimationFrame(tick); }, 700);
    return () => { clearTimeout(startup); if (rafId !== null) cancelAnimationFrame(rafId); };
  }, [direction, speedPxPerSec, loop, people]);

  if (people.length === 0) {
    return (
      <div className="flex h-full min-h-[160px] items-center justify-center px-4 text-center text-sm text-neutral-500" data-empty={kind}>
        {emptyText}
      </div>
    );
  }
  const shown = loop ? [...people, ...people] : people;
  return (
    <div
      ref={boxRef}
      onMouseEnter={() => (isHoveringRef.current = true)}
      onMouseLeave={() => (isHoveringRef.current = false)}
      className="h-full overflow-y-auto px-2 pt-3 scrollbar-thin scrollbar-thumb-neutral-300 hover:scrollbar-thumb-neutral-400"
      style={{ overflowAnchor: "none" }}
      data-people-list={kind}
    >
      <div ref={listRef} className="flex flex-col">
        {shown.map((person, index) => (
          <React.Fragment key={`${person.id}-${index}`}>
            <PersonCard person={person} kind={kind} />
            <div style={{ height: `${gapHeight}px` }} aria-hidden="true" />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

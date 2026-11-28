// src/components/useResultRoom.ts
//
// DOES THE RESULT HAVE ROOM WITH THE BUTTON PANEL ON TOP OF IT? (my rule, 27 Nov 2026, from the owner's own idea)
// The two rows of choices under the search box (Search in, More tools) take two or three lines of the window. Taking them away for EVERY result was too much: a small answer (a calculator's, a one-line reply) fits
// with the panel and no scroll bar, and there the choices are useful. So the panel leaves only when the result would NEED A SCROLL BAR with it there.
//   room  =  the most the window may be tall (its max-height) - everything in it except the scroll area (the box, the panel, any notice)
//   the panel keeps its place when the result's own height (scrollHeight of the scroll area) is no more than `room`.
// (The box above it also shrinks to the lines of the question when the panel has gone: inputRows.ts. The room is measured as if the box had its default height, so that the two do not chase each other.)
// The result's height does not depend on whether the panel is shown, so the decision cannot chase itself (panel goes -> result looks shorter -> panel returns -> ...). To keep the panel from flickering as a result
// changes a little (a card that grows as you type, a list that loads), it takes a margin of HYSTERESIS to change its mind: it leaves when the result is taller than the room, and returns only when the result is
// shorter than the room by HYSTERESIS pixels. It is measured before the screen is painted, so the panel never shows for a frame and then goes.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** The margin, in pixels, a result must be below the room before a panel that left may return. */
export const HYSTERESIS = 32;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The decision, as a plain function (so it can be tested): given the result's height, the room it has WITH the panel, and whether the panel is shown now, does the panel keep (or get back) its place?
 * `roomWithPanel` is what the scroll area could be if the panel were there.
 */
export function panelKeepsPlace(contentHeight: number, roomWithPanel: number, shownNow: boolean, hysteresis = HYSTERESIS): boolean {
  return shownNow ? contentHeight <= roomWithPanel : contentHeight <= roomWithPanel - hysteresis;
}

/**
 * Returns true while the panel may stay, false when the result needs the room. `active` says that a result is on the screen at all (when it is not, the panel stays). The three refs are the window (with the
 * max-height), its scroll area, and the panel (which is not drawn while it is away: I remember its last height).
 */
export function useResultRoom({ active, modalRef, scrollRef, panelRef, inputRef, defaultRows }: { active: boolean; modalRef: RefObject<HTMLElement | null>; scrollRef: RefObject<HTMLElement | null>; panelRef: RefObject<HTMLElement | null>; inputRef?: RefObject<HTMLTextAreaElement | null>; defaultRows?: number }): boolean {
  const [room, setRoom] = useState(true);
  const roomNow = useRef(true);
  const panelHeight = useRef(0);

  const measure = () => {
    const apply = (v: boolean) => { if (roomNow.current !== v) { roomNow.current = v; setRoom(v); } };
    if (!active) { apply(true); return; }
    const modal = modalRef.current, scroll = scrollRef.current;
    if (!modal || !scroll) return;
    const shown = !!panelRef.current;
    if (panelRef.current) panelHeight.current = panelRef.current.offsetHeight;
    const cap = parseFloat(getComputedStyle(modal).maxHeight);
    const maxHeight = Number.isFinite(cap) ? cap : window.innerHeight - 88;
    // everything in the window that is not the scroll area: the box, the panel (when shown), the notices
    const others = modal.offsetHeight - scroll.offsetHeight;
    // The box gives back its empty lines when the result needs the room (inputRows.ts), which makes the window's chrome smaller; the decision about the panel must not feed on that (the panel goes, the box shrinks, there is room again,
    // the panel returns, the box grows ...), so I measure the room as if the box had its DEFAULT rows: I add back the lines it has given.
    const ta = inputRef?.current;
    const lineHeight = ta ? parseFloat(getComputedStyle(ta).lineHeight) : NaN;
    const given = ta && defaultRows && Number.isFinite(lineHeight) ? Math.max(0, defaultRows - ta.rows) * lineHeight : 0;
    const roomWithPanel = maxHeight - (others + given + (shown ? 0 : panelHeight.current));
    apply(panelKeepsPlace(scroll.scrollHeight, roomWithPanel, shown));
  };

  // after every render (cheap: it reads a few sizes), before the paint
  useIsoLayoutEffect(measure);
  // and when something changes size by itself (an image, a list that loads, the window)
  useEffect(() => {
    const scroll = scrollRef.current, modal = modalRef.current;
    if (!active || !scroll || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(scroll);
    if (modal) ro.observe(modal);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return room;
}

// src/lib/constants.ts

// ✅ Site content width (home + admin page wrappers) is tuned via a CSS
// variable, NOT a constant in this file — Tailwind classes are scanned
// statically at build time, so a JS constant can't feed into a `w-[...]`
// class the way it can into an inline `style={{...}}` value below. The
// one place to change it is `--content-width` in src/app/globals.css.

// Configuration for announcement "New" chip duration in days
export const ANNOUNCEMENT_NEW_THRESHOLD_DAYS = 7;

// Configuration for the circular "new" red-dot time window (logged-out users), in hours
export const CIRCULAR_NEW_THRESHOLD_HOURS = 24;

// ✅ ADDED: Configuration for the Edit/Delete window
export const EDIT_DELETE_WINDOW_HOURS = 24;

// ✅ Admin dashboard height knob: content height of the announcement rich-text
// editor. This is the single value to tune so the Admin page fits without
// scrolling. Accepts any CSS length — "14vh", "12vh", "160px", etc.
export const ADMIN_EDITOR_MIN_HEIGHT = "23vh";

// ✅ Admin dashboard: the whole page now fills the viewport exactly (100vh,
// no page scrollbar) — that's a structural flex layout, not a tunable
// number, so there's no "page height" knob anymore. What IS tunable is how
// that fixed vertical space is split between the title row and the cards
// grid below it. These two must always sum to "100%" (percentages of the
// dashboard box's own height, not the viewport) — raise one, lower the
// other by the same amount. Each card still scrolls internally
// (overflow-y-auto) if its own content is taller than the space it's given.
export const ADMIN_TITLE_AREA_HEIGHT = "10%";
export const ADMIN_CARDS_AREA_HEIGHT = "90%";

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

// ⚠️ TEMPORARY — widened from 24 to 60 days (1440 hours) only to allow
// deleting and cleanly re-uploading the 2023/2024 holiday-list circulars
// for the holiday-DB-population experiment. This also loosens announcement
// edit/delete to 60 days for as long as this stays in place — REVERT to 24
// once the experiment is done.
export const EDIT_DELETE_WINDOW_HOURS = 24 * 60; // 1440 hours = 60 days

// ✅ Admin dashboard height knob: content height of the announcement rich-text
// editor. This is the single value to tune so the Admin page fits without
// scrolling. Accepts any CSS length — "14vh", "12vh", "160px", etc.
export const ADMIN_EDITOR_MIN_HEIGHT = "23vh";

// ✅ Admin dashboard: the whole page fills the viewport at 100% zoom with no
// scrollbar — that's a structural flex layout, not a tunable number. What IS
// tunable is how that vertical space is split between the title row and the
// cards grid below it. These two act as MINIMUMS (a floor), not rigid sizes
// — they must always sum to "100%" (percentages of the dashboard box's own
// height, not the viewport), but a card's real content is always allowed to
// grow past its floor rather than being compressed. If the combined content
// ends up taller than the viewport (e.g. at higher browser zoom), the whole
// PAGE scrolls — there is no per-card internal scrolling.
export const ADMIN_TITLE_AREA_HEIGHT = "10%";
export const ADMIN_CARDS_AREA_HEIGHT = "90%";

// ✅ Circular upload modal: rough estimate (in seconds) of how long the
// server-side OCR/chunk/embed pipeline typically takes once the file's
// bytes have fully reached the server (observed: ~113s for a 6-page dual-
// pass-OCR'd circular). Used ONLY to drive a smooth, honest-looking
// progress animation for the part of the wait axios's own upload-progress
// event can't see (that only tracks bytes leaving the browser, not the
// server-side work that happens after). The bar approaches but never
// reaches 100% based on this estimate -- it always jumps to 100% only when
// the real HTTP response actually arrives, so a slower-than-usual upload
// never gets a false "done" signal. Tune this if real uploads consistently
// finish much faster or slower than it estimates.
export const CIRCULAR_UPLOAD_ESTIMATED_SECONDS = 100;

// ✅ Holiday Management card: the range of years selectable in the "Review
// Year" dropdown for the manual .txt seed upload. Widen/narrow these two
// values to change the dropdown's range.
export const HOLIDAY_REVIEW_YEAR_MIN = 2020;
export const HOLIDAY_REVIEW_YEAR_MAX = 2027;

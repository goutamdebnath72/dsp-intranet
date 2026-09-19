// src/lib/constants.ts

// Configuration for announcement "New" chip duration in days
export const ANNOUNCEMENT_NEW_THRESHOLD_DAYS = 7;

// Configuration for the circular "new" red-dot time window (logged-out users), in hours
export const CIRCULAR_NEW_THRESHOLD_HOURS = 24;

// ✅ ADDED: Configuration for the Edit/Delete window
export const EDIT_DELETE_WINDOW_HOURS = 24;

// ✅ Admin dashboard height knob: content height of the announcement rich-text
// editor. This is the single value to tune so the Admin page fits without
// scrolling. Accepts any CSS length — "14vh", "12vh", "160px", etc.
export const ADMIN_EDITOR_MIN_HEIGHT = "16.5vh";

// ✅ Admin dashboard: target height of each dashboard column/card. Applied as a
// min-height (raises only, never clips), so all three columns match it. For the
// super-admin middle stack, the two cards split this total automatically, with
// the gap between them left untouched. Accepts any CSS length.
export const ADMIN_CARD_HEIGHT = "50vh";

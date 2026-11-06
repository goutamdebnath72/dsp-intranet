// src/lib/constants.ts

/**
 * ============================================================================
 * HOD OF C&IT (HEAD OF DEPARTMENT, COMPUTER & INFORMATION TECHNOLOGY)
 * ============================================================================
 * The HOD of C&IT holds the highest and sole initial administrative privilege
 * across all management facilities (Employee Manager, PAX Directory Editor,
 * Holiday Manager, Circular Manager, Announcement Manager, and Contact Access Log).
 *
 * Currently held by:
 *   Name: Mohd Anwar Ullah
 *   Ticket No: 498301
 *   SAIL P.No: D000896
 *
 * When the HOD of C&IT changes in the future, updating this single definition here
 * seamlessly transfers highest authority across the entire DSP Intranet.
 */
export const HOD_CIT = {
  post: "HOD of C&IT",
  name: "Mohd Anwar Ullah",
  ticketNo: "498301",
  sailPNo: "D000896",
  designation: "GM",
  designationTitle: "General Manager",
  departmentCode: "98500",
  department: "C&IT",
} as const;

/**
 * Convenient direct access to the HOD of C&IT ticket number.
 * Single source of truth across privilege checks.
 */
export const HOD_CIT_TICKET = HOD_CIT.ticketNo;
export const HOD_CIT_NAME = HOD_CIT.name;
export const HOD_CIT_PNO = HOD_CIT.sailPNo;
export const HOD_CIT_DESIGNATION = HOD_CIT.designation;
export const HOD_CIT_DEPARTMENT_CODE = HOD_CIT.departmentCode;

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

// src/lib/constants.ts

/**
 * ============================================================================
 * HOD OF C&IT (HEAD OF DEPARTMENT, COMPUTER & INFORMATION TECHNOLOGY)
 * ============================================================================
 * The HOD of C&IT holds the highest administrative privilege, and at the start the only one,
 * across all management facilities (Employee Manager, PAX Directory Editor, Holiday Manager, Circular Manager, Announcement Manager and Contact Access Log).
 *
 * Currently held by:
 *   Name: Mohd Anwar Ullah
 *   Ticket No: 498301
 *
 * When the HOD of C&IT changes, I only update this single definition here and the highest authority moves across the entire DSP Intranet at once.
 */
export const HOD_CIT = {
  post: "HOD of C&IT",
  name: "Mohd Anwar Ullah",
  ticketNo: "498301",
  designation: "GM",
  designationTitle: "General Manager",
  departmentCode: "98500",
  department: "C&IT",
} as const;

/**
 * A direct shortcut to the ticket number of the HOD of C&IT.
 * I keep it as the single source of truth for every privilege check.
 */
export const HOD_CIT_TICKET = HOD_CIT.ticketNo;
export const HOD_CIT_NAME = HOD_CIT.name;
export const HOD_CIT_DESIGNATION = HOD_CIT.designation;
export const HOD_CIT_DEPARTMENT_CODE = HOD_CIT.departmentCode;

// I tune the site content width (home and admin page wrappers) through a CSS variable, not a constant in this file.
// Tailwind classes are scanned statically at build time, so a JS constant cannot feed a `w-[...]` class the way it can feed an inline `style={{...}}` value below.
// The one place to change it is `--content-width` in src/app/globals.css.

// How long, in days, I show the announcement "New" chip.
export const ANNOUNCEMENT_NEW_THRESHOLD_DAYS = 7;

// How long, in hours, the red "new" dot on a circular stays for logged-out users.
export const CIRCULAR_NEW_THRESHOLD_HOURS = 24;

// Temporary: I widened this from 24 to 60 days (1440 hours) only so that I can delete and cleanly re-upload the 2023/2024 holiday-list circulars
// for the holiday-DB-population experiment. It also loosens announcement edit/delete to 60 days for as long as this stays in place.
// Revert it to 24 once the experiment is done.
export const EDIT_DELETE_WINDOW_HOURS = 24 * 60; // 1440 hours = 60 days

// Circular upload modal: a rough estimate, in seconds, of how long the server-side OCR/chunk/embed pipeline typically takes once the file's
// bytes have fully reached the server (observed: ~113s for a 6-page dual-pass-OCR'd circular). I use it ONLY to drive a smooth, honest-looking
// progress animation for the part of the wait that axios's own upload-progress event cannot see (that event only tracks bytes leaving the browser,
// not the server-side work that happens after). The bar approaches 100% on this estimate but never reaches it: it jumps to 100% only when
// the real HTTP response arrives, so a slower-than-usual upload never gets a false "done" signal.
// Tune this if real uploads consistently finish much faster or slower than it estimates.
export const CIRCULAR_UPLOAD_ESTIMATED_SECONDS = 100;

// Holiday Management card: the range of years selectable in the "Review Year" dropdown for the manual .txt seed upload.
// Widen or narrow these two values to change the range of that dropdown.
export const HOLIDAY_REVIEW_YEAR_MIN = 2020;
export const HOLIDAY_REVIEW_YEAR_MAX = 2027;

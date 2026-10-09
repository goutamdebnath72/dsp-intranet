// src/lib/debugLog.ts
//
// Writes a debugging note to the browser console at DEBUG level. Chrome and Edge hide that level
// unless "Verbose" is ticked in the console's level filter, so ordinary users never see it, while
// a developer can switch it on to inspect how the omni search read a question and the SQL it used.
// Never throws.

export function omnibarDebug(label: string, data?: unknown): void {
  try {
    if (typeof console !== "undefined" && typeof console.debug === "function") {
      console.debug(`[omnibar] ${label}`, data);
    }
  } catch {
    /* logging must never break the page */
  }
}

// src/components/managementPanels.ts
//
// THE MANAGEMENT PAGES AND THE WRITTEN-SUMMARY VIEW, LOADED ON FIRST NEED. They are drawn only for a signed-in manager (or an executive's deep answer) and carry the heavy parts of the app (the rich-text editor, the chart
// library, the upload form), so the search window does not carry them: each is fetched the first time it is shown. The list lives here ONCE: the search window draws these components, and calls preloadManagementPanels()
// the moment a manager is about to need them (the pointer on the Admin button, the hub on screen), so the page they open is there without a wait. Add a management page: one line in PANELS.
import { lazyComponent, whenIdle } from "@/lib/ui/lazyLoad";
import { PERF } from "@/lib/perf/switches"; // when the pages are fetched ahead is chosen there

const loadPax = () => import("@/components/PaxAdminPanel");
const loadEmployee = () => import("@/components/EmployeeAdminPanel");
const loadHoliday = () => import("@/components/HolidayAdminPanel");
const loadCircular = () => import("@/components/CircularAdminPanel");
const loadAnnouncement = () => import("@/components/AnnouncementAdminPanel");
const loadAccessLog = () => import("@/components/AccessLogAdminPanel");
const loadBriefing = () => import("@/components/ExecutiveBriefing");

export const PaxAdminPanel = lazyComponent(loadPax, "PaxAdminPanel");
export const EmployeeAdminPanel = lazyComponent(loadEmployee, "EmployeeAdminPanel");
export const HolidayAdminPanel = lazyComponent(loadHoliday, "HolidayAdminPanel");
export const CircularAdminPanel = lazyComponent(loadCircular, "CircularAdminPanel");
export const AnnouncementAdminPanel = lazyComponent(loadAnnouncement, "AnnouncementAdminPanel");
export const AccessLogAdminPanel = lazyComponent(loadAccessLog, "AccessLogAdminPanel");
export const ExecutiveBriefing = lazyComponent(loadBriefing, "ExecutiveBriefing");

/** every management page's loader (the briefing is not one: it is for an answer, not for a manager) */
const PANELS = [loadPax, loadEmployee, loadHoliday, loadCircular, loadAnnouncement, loadAccessLog];

/** fetch the management pages now, quietly (a second call costs nothing: the browser already has them) */
export function preloadManagementPanels(): void {
  for (const load of PANELS) void load().catch(() => undefined);
}

// the moment chosen in src/lib/perf/switches.js: "pointer" waits for preloadManagementPanels() (the pointer on the Admin button); "idle" and "now" fetch them as this file is loaded
if (typeof window !== "undefined") {
  if (PERF.managementPanelsLoad === "now") preloadManagementPanels();
  else if (PERF.managementPanelsLoad === "idle") whenIdle(preloadManagementPanels);
}

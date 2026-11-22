// Types of src/lib/perf/switches.js (read that file: each switch is explained there).
export type LoadWhen = "pointer" | "idle" | "now";
export interface PerfSwitches {
  minifyBrowserCode: boolean;
  searchWindowLoad: "idle" | "now";
  guideLoad: "pointer" | "now";
  managementPanelsLoad: LoadWhen;
  homeWidgetsLoad: "idle" | "now";
  skipUnusedHomeLinks: boolean;
  localNewsThumbs: boolean;
  deferHomeVideo: boolean;
  optimisedHeroPicture: boolean;
  rightSizedLogos: boolean;
  cssVideoHover: boolean;
  holidaysOnCalendarTab: boolean;
  pauseOffscreenScrollers: boolean;
  feedFocusThrottleSeconds: number;
  parallelReads: boolean;
  parallelAnnouncementSearch: boolean;
  installPgExtensionsAtStart: boolean;
  prefetchQueryEmbedding: boolean;
  slimCircularReads: boolean;
  routerCacheSeconds: number;
  nl2sqlExamplesCacheSeconds: number;
  peopleEventsCacheSeconds: number;
  browserCacheFontsAndVideo: boolean;
}
export const PERF: PerfSwitches;

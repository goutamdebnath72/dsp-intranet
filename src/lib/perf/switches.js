// src/lib/perf/switches.js
//
// THE SPEED SWITCHES: one place that says, for each change made in the performance audit, whether the NEW way or the PREVIOUS way runs. Change a value, save, and the app behaves as it did before that change (the dev server
// reloads at once; a deployed site needs a new deploy; `minifyBrowserCode` is read by next.config.js, so it needs the dev server restarted). Every other file reads these constants and writes no switch of its own.
// Plain CommonJS on purpose: next.config.js (which cannot read TypeScript) and the app both require this one file; src/lib/perf/switches.d.ts gives the app the types.
// Each line: the NEW value is the one written here. After it: what it does, and what the previous way was (the value to put back).
/* eslint-disable @typescript-eslint/no-require-imports */

const PERF = {
  // ---------------------------------------------------------------- the code the browser downloads
  /** true: the browser's JavaScript is minified (3x smaller). Previous: false (the server and the browser were both left unminified). Restart `npm run dev` / redeploy after changing. */
  minifyBrowserCode: true,
  /** when the search window's code is fetched: "idle" = once the page is interactive and the browser has nothing better to do (new); "now" = at once when the page starts (closest to the previous way, where it came with the page) */
  searchWindowLoad: "idle",
  /** when the guide's code is fetched: "pointer" = when the pointer reaches the Help button, or on its click (new); "now" = at once when the page starts */
  guideLoad: "pointer",
  /** when the six management pages are fetched: "pointer" = when the pointer reaches the Admin button, or when one is first shown (new); "idle" = as soon as the search window is here and the browser is idle; "now" = with the search window */
  managementPanelsLoad: "pointer",
  /** when the calendar and the confetti of the People & Events card are fetched: "idle" (new) or "now" */
  homeWidgetsLoad: "idle",

  // ---------------------------------------------------------------- the home page
  /** true: the three link lists that the new home page never draws are not read from the database (new). false: they are read on every visit (previous). */
  skipUnusedHomeLinks: true,
  /** true: the three news thumbnails are drawn on the page itself (new). false: they are fetched from placehold.co, an outside site (previous). */
  localNewsThumbs: true,
  /** true: the plant video starts once the page has loaded, with the hero picture showing meanwhile (new). false: it starts loading with the page (previous). */
  deferHomeVideo: true,
  /** true: the hero picture is the lighter copy public/steel-plant1.opt.jpg, and is fetched early (new). false: the 697 KB original (previous). */
  optimisedHeroPicture: true,
  /** true: the two logos ask for a picture the size they are drawn at, not 1024 px (new). false: as declared before (previous). */
  rightSizedLogos: true,
  /** true: the pause symbol over the video shows on hover by CSS alone, so the page is not drawn again at each mouse move over it (new). false: held in React state (previous). */
  cssVideoHover: true,
  /** true: the holidays are fetched when the Calendar tab is first opened (new). false: on every page load, though Birthdays is the tab that shows (previous). */
  holidaysOnCalendarTab: true,
  /** true: the three auto-scrolling lists stand still while they are off the screen (new). false: they scroll all the time (previous). */
  pauseOffscreenScrollers: true,
  /** seconds: the announcements list is asked again when the window is focused again, at most once in this time (new: 60). Previous: 5 (the library's own value). */
  feedFocusThrottleSeconds: 60,

  // ---------------------------------------------------------------- the server
  /** true: independent database reads of one request run together (new). false: one after the other (previous). */
  parallelReads: true,
  /** true: the four queries of the announcement search run together (new). false: one after the other (previous). */
  parallelAnnouncementSearch: true,
  /** true: TypeORM asks the database to install the vector extension at every cold start (previous). false: not asked: it is installed (new). */
  installPgExtensionsAtStart: false,
  /** true: the question's embedding is requested while the language model is still deciding where it belongs, so it is ready when the circular search needs it (new). false: asked only then (previous). */
  prefetchQueryEmbedding: true,
  /** true: reading a circular for its title or its viewer takes only the columns that are used, not the 768-number embedding and the whole text (new). false: the whole row (previous). */
  slimCircularReads: true,
  /** seconds a router decision (which tool a question belongs to) is remembered for the same question (new: 600). 0 = never (previous). */
  routerCacheSeconds: 600,
  /** seconds the list of confirmed and rejected example queries is remembered (new: 90; a new vote shows up in the model's prompt within this time). 0 = read on every question (previous). */
  nl2sqlExamplesCacheSeconds: 90,
  /** seconds the CDN may keep the home page's People & Events lists (new: 120). 0 = never cached (previous). */
  peopleEventsCacheSeconds: 120,
  /** true: fonts and the plant video are kept a week in the browser (new). false: asked of the server on every visit (previous). Read by next.config.js. */
  browserCacheFontsAndVideo: true,
};

module.exports = { PERF };

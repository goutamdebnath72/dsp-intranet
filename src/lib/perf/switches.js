// src/lib/perf/switches.js
//
// THE SPEED SWITCHES: the one place that says, for each change I made in the performance audit, whether the NEW way or the PREVIOUS way runs. Change a value, save, and the app behaves as it did before that change (the dev server
// reloads at once; a deployed site needs a new deploy; `minifyBrowserCode` is read by next.config.js, so it needs the dev server restarted). Every other file reads these constants and writes no switch of its own.
// I kept it plain CommonJS on purpose: next.config.js (which cannot read TypeScript) and the app both require this one file; src/lib/perf/switches.d.ts gives the app the types.
// On each line the NEW value is the one written here; the comment after it says what it does and what the previous way was (the value to put back).
/* eslint-disable @typescript-eslint/no-require-imports */

const PERF = {
  // ---------------------------------------------------------------- the code the browser downloads
  /** true: the browser's JavaScript is minified (3x smaller). Previous: false (the server and the browser were both left unminified). Restart `npm run dev` or redeploy after changing it. */
  minifyBrowserCode: true,
  /** Decides when the search window's code is fetched: "idle" = once the page is interactive and the browser has nothing better to do (new); "now" = at once when the page starts (closest to the previous way, where it came with the page). */
  searchWindowLoad: "idle",
  /** Decides when the guide's code is fetched: "pointer" = when the pointer reaches the Help button, or on its click (new); "now" = at once when the page starts. */
  guideLoad: "pointer",
  /** Decides when the six management pages are fetched: "pointer" = when the pointer reaches the Admin button, or when one is first shown (new); "idle" = as soon as the search window is here and the browser is idle; "now" = with the search window. */
  managementPanelsLoad: "pointer",
  /** Decides when the calendar and the confetti of the People & Events card are fetched: "idle" (new) or "now". */
  homeWidgetsLoad: "idle",

  // ---------------------------------------------------------------- the home page
  /** true: the three link lists that the new home page never draws are not read from the database (new). false: I read them on every visit (previous). */
  skipUnusedHomeLinks: true,
  /** true: I draw the three news thumbnails on the page itself (new). false: they are fetched from placehold.co, an outside site (previous). */
  localNewsThumbs: true,
  /** true: the plant video starts once the page has loaded, and the hero picture shows meanwhile (new). false: it starts loading with the page (previous). */
  deferHomeVideo: true,
  /** true: the hero picture is the lighter copy public/steel-plant1.opt.jpg, fetched early (new). false: the 697 KB original (previous). */
  optimisedHeroPicture: true,
  /** true: the two logos ask for a picture of the size they are drawn at, not 1024 px (new). false: sizes as declared before (previous). */
  rightSizedLogos: true,
  /** true: the pause symbol over the video shows on hover by CSS alone, so the page is not drawn again at each mouse move over it (new). false: the hover is held in React state (previous). */
  cssVideoHover: true,
  /** true: I fetch the holidays when the Calendar tab is first opened (new). false: they are fetched on every page load, though Birthdays is the tab that shows (previous). */
  holidaysOnCalendarTab: true,
  /** true: the three auto-scrolling lists stand still while they are off the screen (new). false: they scroll all the time (previous). */
  pauseOffscreenScrollers: true,
  /** Seconds: the announcements list is asked for again when the window is focused again, at most once in this time (new: 60). Previous: 5 (the library's own value). */
  feedFocusThrottleSeconds: 60,

  // ---------------------------------------------------------------- the server
  /** true: independent database reads of one request run together (new). false: they run one after the other (previous). */
  parallelReads: true,
  /** true: the four queries of the announcement search run together (new). false: they run one after the other (previous). */
  parallelAnnouncementSearch: true,
  /** true: TypeORM asks the database to install the vector extension at every cold start (previous). false: it is not asked, because the extension is already installed (new). */
  installPgExtensionsAtStart: false,
  /** true: I request the question's embedding while the language model is still deciding where the question belongs, so it is ready when the circular search needs it (new). false: it is asked for only then (previous). */
  prefetchQueryEmbedding: true,
  /** true: reading a circular for its title or its viewer takes only the columns that are used, not the 768-number embedding and the whole text (new). false: the whole row is read (previous). */
  slimCircularReads: true,
  /** Seconds a router decision (which tool a question belongs to) is remembered for the same question (new: 600). 0 = never remembered (previous). */
  routerCacheSeconds: 600,
  /** Seconds the list of confirmed and rejected example queries is remembered (new: 90; a new vote shows up in the model's prompt within this time). 0 = read on every question (previous). */
  nl2sqlExamplesCacheSeconds: 90,
  /** Seconds the CDN may keep the home page's People & Events lists (new: 120). 0 = never cached (previous). */
  peopleEventsCacheSeconds: 120,
  /** true: fonts and the plant video are kept for a week in the browser (new). false: they are asked of the server on every visit (previous). Read by next.config.js. */
  browserCacheFontsAndVideo: true,

  // ---------------------------------------------------------------- Executive Deep Search (src/lib/search/executiveSynthesis.ts)
  /** "hedged": ONE draft is written, and a second only when the first is late (see edsHedgeSeconds) (new). "both": two drafts side by side, the better one kept (previous: it waited for the slower of the two and paid for both). */
  edsDrafts: "hedged",
  /** Seconds: a model call (a draft, the repair, the second reading) that has not answered after this long is sent a second time and the first answer to arrive is used, so a call that hangs costs this, not its 45 s timeout (new: 20). 0 = never (previous). */
  edsHedgeSeconds: 20,
  /** true: the second reading of the best draft starts at once, side by side with the repair attempt, and the repaired answer is read again only if the repair is kept (new). false: the reading waits for the repair (previous). */
  edsVerifyDuringRepair: true,
  /** false: a Pro model (gemini-3.1-pro-preview, gemini-pro-latest ...) is REFUSED everywhere, whatever asks for it: a code default, an environment variable, a script (new: my order of 23 Nov 2026, src/lib/ai/noPro.ts). true: Pro models may be used (previous). */
  allowProModels: false,
  /** The model that WRITES a briefing: "gemini-3.8-flash" (new: 7 to 17 s a draft, against 11 to 17 s for pro on the same circulars, and as many key facts found in the gold test: scripts/eds-gold.ts). "" = gemini-3.1-pro-preview (previous). The environment (GEMINI_SYNTHESIS_MODEL) overrides it. */
  edsDraftModel: "gemini-3.8-flash",
  /** The model that CHECKS a briefing against the circulars (the second reading): "gemini-3.8-flash" (new: 2 to 7 s, against 8 to 22 s for pro; it caught every error planted in four briefings, as pro did). "" = the writer's model (previous: pro). The environment (GEMINI_VERIFY_MODEL) overrides it. */
  edsVerifyModel: "gemini-3.8-flash",
};

module.exports = { PERF };

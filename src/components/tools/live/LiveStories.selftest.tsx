// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/tools/live/LiveStories.selftest.tsx
// The live news list and its status line: what a refresh does (nothing, hold, or take in), how a story is shown (newest, recent, new), and that the screen's rules are in the code
// (rows keyed by link, arrivals held while reading, the pill taking no room, quiet refresh with no loading box, checking only while the page is visible).
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DateTime } from "luxon";
import { LiveStories, planRefresh, pillText, isUpdated, rollVariants, isRecent, chipOf, NEW_CHIP_MS, RECENT_MIN, ROLL_STAGGER, FIRST_STAGGER } from "./LiveStories";
import { LiveStrip, clock, modeOf } from "./LiveStrip";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const src = (f: string) => readFileSync(f, "utf8");
const text = (x: string) => x.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const st = (t: string, at = "2026-11-13T06:00:00Z", source = "Mint") => ({ title: t, link: `https://x.com/${t}`, publishedAt: at, source, summary: "" });

// what a refresh does
const A = [st("a"), st("b"), st("c")];
const A2 = [st("n1"), st("n2"), st("a"), st("b")];
ok("the same stories: nothing happens, reading or not", planRefresh(A, [...A], false).kind === "idle" && planRefresh(A, [...A], true).kind === "idle");
ok("arrivals while nobody reads: taken in, naming the new ones (n1, n2)", (() => { const p = planRefresh(A, A2, false); return p.kind === "apply" && p.added.map((i) => i.title).join() === "n1,n2"; })());
ok("arrivals while someone reads: HELD, with the count (2 new, 0 updated)", (() => { const p = planRefresh(A, A2, true); return p.kind === "hold" && p.added === 2 && p.changed === 0; })());
ok("a refresh that only removes stories waits while someone reads, and is taken in when nobody does", planRefresh(A, A.slice(0, 2), true).kind === "idle" && (() => { const p = planRefresh(A, A.slice(0, 2), false); return p.kind === "apply" && p.added.length === 0; })());
ok("a first fill of an empty list is all arrivals", (() => { const p = planRefresh([], A, false); return p.kind === "apply" && p.added.length === 3; })());

// a DEVELOPMENT: the same story (same id), a later headline
const dev = (id: string, link: string, t = "dev") => ({ ...st(t), id, link: `https://x.com/${link}` });
const S1 = [dev("a", "a1", "story A"), dev("b", "b1", "story B")];
const S2 = [dev("a", "a2", "story A, later"), dev("b", "b1", "story B")];
ok("a story whose headline changed (same story, a later paper's headline) is CHANGED, not new: applied at once when nobody reads", (() => { const p = planRefresh(S1, S2, false); return p.kind === "apply" && p.added.length === 0 && p.changed.length === 1 && p.changed[0].link === "https://x.com/a2"; })());
ok("a development while someone reads is HELD, counted as updated (0 new, 1 updated)", (() => { const p = planRefresh(S1, S2, true); return p.kind === "hold" && p.added === 0 && p.changed === 1; })());
ok("the same story with only another paper named is taken in quietly when nobody reads, and ignored while someone does", (() => { const n = [{ ...S1[0], also: ["Mint"] }, S1[1]]; const a = planRefresh(S1, n, false), b = planRefresh(S1, n, true); return a.kind === "apply" && a.added.length === 0 && a.changed.length === 0 && b.kind === "idle"; })());
ok("the pill says what is waiting: '↑ 2 new stories', '↻ 1 updated story', '↑ 2 new · 1 updated'", pillText(2, 0) === "↑ 2 new stories" && pillText(1, 0) === "↑ 1 new story" && pillText(0, 1) === "↻ 1 updated story" && pillText(0, 3) === "↻ 3 updated stories" && pillText(2, 1) === "↑ 2 new · 1 updated");
ok("a card is 'updated' when the headline shown is not the story's first report", isUpdated({ ...st("x"), id: "https://x.com/first", link: "https://x.com/later" }) && !isUpdated({ ...st("x"), id: "https://x.com/x", link: "https://x.com/x" }) && !isUpdated(st("x")));

// the roll
const wait = (v: unknown, d: Record<string, number>) => ((v as (d: Record<string, number>) => { transition: { delay: number } })(d)).transition.delay;
const rv = rollVariants("L", false), rc = rollVariants("L", true);
ok("a card turns like a drum: in from below (rotateX 90 to 0) and out upward (0 to -90), each waiting the stagger it was given, by its own link", (rv.enter as { rotateX: number }).rotateX === 90 && (rv.center as unknown as (d: Record<string, number>) => { rotateX: number })({}).rotateX === 0 && (rv.exit as unknown as (d: Record<string, number>) => { rotateX: number })({}).rotateX === -90 && wait(rv.center, { L: 0.28 }) === 0.28 && wait(rv.exit, { L: 0.14, M: 1 }) === 0.14 && wait(rv.center, {}) === 0);
ok("with reduced motion the card only fades: no rotation in any of its states", !("rotateX" in (rc.enter as object)) && !("rotateX" in (rc.center as unknown as (d: Record<string, number>) => object)({})) && !("rotateX" in (rc.exit as unknown as (d: Record<string, number>) => object)({})));
ok("cards that roll together are one beat apart (0.14 s), the first showing one after another (0.07 s)", ROLL_STAGGER === 0.14 && FIRST_STAGGER === 0.07);

// how a story is shown
const NOW = DateTime.fromISO("2026-11-13T06:40:00Z");
ok("recent means under 30 minutes at the moment of looking; no time, no claim", RECENT_MIN === 30 && isRecent("2026-11-13T06:20:00Z", NOW) && !isRecent("2026-11-13T06:09:00Z", NOW) && !isRecent("", NOW) && !isRecent("garbage", NOW));
ok("a paper's chip colour is always the same for the same name", chipOf("Mint") === chipOf("Mint") && NEW_CHIP_MS === 90_000);
const html = renderToStaticMarkup(<LiveStories items={[st("Alpha story", "2026-11-13T06:30:00Z", "Mint"), st("Beta story", "2026-11-13T02:00:00Z", "The Economic Times")]} lang="en" empty="none" />);
const t = text(html);
ok("rows: each headline, its paper and its time; no row numbers", /Alpha story/.test(t) && /Beta story/.test(t) && /Mint/.test(t) && /The Economic Times/.test(t) && !/>\s*[12]\s*</.test(html.replace(/<svg[\s\S]*?<\/svg>/g, "")));
ok("every link opens in a NEW TAB with noopener noreferrer, and nothing but http(s) links", (html.match(/target="_blank"/g) ?? []).length === 2 && (html.match(/rel="noopener noreferrer"/g) ?? []).length === 2 && !/javascript:/i.test(html));
ok("the page language is set on the list, and an empty list says so", /lang="en"/.test(html) && /none/.test(renderToStaticMarkup(<LiveStories items={[]} empty="none" />)));
const alsoHtml = renderToStaticMarkup(<LiveStories items={[{ ...st("Gamma story", "2026-11-13T06:30:00Z", "The Hindu"), also: ["Times of India", "Hindustan Times"] }, st("Delta story")]} empty="none" />);
ok("a story several papers carried is ONE row from the first, naming the others: 'also in Times of India, Hindustan Times'; a story of one paper names none", /also in Times of India, Hindustan Times/.test(text(alsoHtml)) && (text(alsoHtml).match(/also in/g) ?? []).length === 1 && (alsoHtml.match(/<li/g) ?? []).length === 2);
const devHtml = renderToStaticMarkup(<LiveStories items={[{ ...st("Later headline of the story", "2026-11-13T06:35:00Z", "The Hindu"), id: "https://x.com/first", firstAt: "2026-11-13T05:55:00Z", firstSource: "Hindustan Times", also: ["Hindustan Times", "Times of India"] }]} empty="none" />);
ok("a developed card says Updated and where the story began ('first reported by Hindustan Times ...') and also names the third paper; the 'also in' line is only for cards that have not developed", /Updated/.test(text(devHtml)) && /first reported by Hindustan Times 45 min ago|first reported by Hindustan Times \d+ (min|h) ago/.test(text(devHtml)) && /also Times of India/.test(text(devHtml)) && !/also in/.test(text(devHtml)));
ok("every card has the same fixed height (a slot of 108 px on a phone, 88 px otherwise) and clamps its headline to three lines on a phone, two otherwise, with the whole headline in its tooltip, so a roll never resizes anything", /h-\[108px\]/.test(html) && /sm:h-\[88px\]/.test(html) && /line-clamp-3 /.test(html) && /sm:line-clamp-2/.test(html) && /title="Alpha story"/.test(html));
ok("on first showing the cards start turned away (rotateX 90) and roll in, each card in its own perspective, hinged on an axis behind it", /rotateX\(90deg\)/.test(html) && /\[perspective:900px\]/.test(html) && !/transform:perspective/.test(html) && /backface-visibility:hidden/.test(html));
const deskHtml = renderToStaticMarkup(<LiveStories items={[{ ...st("প্রথম খবর", "2026-11-13T06:30:00Z", "Anandabazar Patrika"), desk: "attack", tier: 1 }, { ...st("দ্বিতীয় খবর", "2026-11-13T06:20:00Z", "Anandabazar Patrika"), desk: "sports", tier: 2 }, { ...st("তৃতীয় খবর", "2026-11-13T06:10:00Z", "Anandabazar Patrika"), desk: "other", tier: 3 }]} empty="none" />);
ok("a curated card shows NO chip of what kind of news it is, no red edge and no desk name: only the headline, the paper and the time (the desk only chooses and orders the stories)", !/rose-600|border-l-rose-500|sky-100 text-sky-800|text-\[10px\] font-extrabold bg-/.test(deskHtml) && /প্রথম খবর/.test(deskHtml) && (deskHtml.match(/<li/g) ?? []).length === 3);
ok("the Bengali tab explains its curation on the card (a front page of several Bengali dailies, Anandabazar first, what comes first)", /This tab is chosen like a front page, from several Bengali dailies/.test(readFileSync("src/components/tools/live/NewsCard.tsx", "utf8")) && /lang === "bn"/.test(readFileSync("src/components/tools/live/NewsCard.tsx", "utf8")));
ok("a screen-reader line says how many came in, politely, and the list itself is not a live region (a whole list read out at every refresh would be noise)", /role="status" aria-live="polite"/.test(html) && !/<ol[^>]*aria-live/.test(html));
ok("nothing is held at the start, so no pill is drawn", !/(new|updated) (story|stories)/.test(t));

// the status line
ok("the clock is to the second, in Indian time: 06:40:10 UTC is 12:10:10 pm", clock("2026-11-13T06:40:10Z") === "12:10:10 pm" && clock("garbage") === "");
ok("the modes: live, paused (by hand, wins over a failure), not updating (a failed check)", modeOf(false, false) === "live" && modeOf(true, false) === "paused" && modeOf(true, true) === "paused" && modeOf(false, true) === "lagging");
const strip = (mode: "live" | "paused" | "lagging") => text(renderToStaticMarkup(<LiveStrip fetchedAt="2026-11-13T06:40:10Z" arrivedAt={Date.now()} everyMs={60000} mode={mode} refreshing={false} onTogglePause={() => {}} onRefresh={() => {}} />));
ok("live: LIVE, the time of the figures, a countdown, Pause and Check now", /Live/.test(strip("live")) && /Updated 12:10:10 pm IST/.test(strip("live")) && /next check in \d+ s/.test(strip("live")) && /Pause/.test(strip("live")) && /Check now/.test(strip("live")));
ok("paused: PAUSED, Resume, and no countdown", /Paused/.test(strip("paused")) && /Resume/.test(strip("paused")) && !/next check in/.test(strip("paused")));
ok("failed check: NOT UPDATING, 'Last update', and the plain sentence that it will try again by itself", /Not updating/.test(strip("lagging")) && /Last update 12:10:10 pm/.test(strip("lagging")) && /will try again by itself/.test(strip("lagging")));

// the rules are in the code
const ls = src("src/components/tools/live/LiveStories.tsx"), hook = src("src/hooks/useLive.ts"), card = src("src/components/tools/live/NewsCard.tsx"), route = src("src/app/api/live/news/route.ts");
ok("a card is keyed by its headline (a development is a new face in the same place) and animates only its own arrival, development and departure (popLayout, position layout), with reduced motion honoured", /key=\{it\.link\}/.test(ls) && /mode="popLayout"/.test(ls) && /layout=\{calm \? false : "position"\}/.test(ls) && /useReducedMotion/.test(ls) && /originZ: -DRUM/.test(ls));
ok("reading is hover (of a mouse), focus in the list, or scrolled away from the top; arrivals are held then", /e\.pointerType === "mouse"/.test(ls) && /onFocus=/.test(ls) && /IntersectionObserver/.test(ls) && /const reading = hover \|\| focus \|\| !atTop/.test(ls));
ok("the pill takes no room (a zero-height sticky holder), so it can never move a row", /sticky top-2 z-20 h-0/.test(ls));
ok("times and chips are re-read by a clock of 15 seconds, and that clock is cleaned up", /setInterval\(\(\) => setNow\(DateTime\.now\(\)\), 15_000\)/.test(ls) && /clearInterval\(t\)/.test(ls));
ok("the refresh is QUIET: a timer, only while the page is visible, no loading state, a failure sets lagging and keeps what is shown; there is still ONE fetch in the hook", /refreshMs/.test(hook) && /document\.hidden/.test(hook) && /visibilitychange/.test(hook) && /setLagging\(true\)/.test(hook) && (hook.match(/fetch\(/g) ?? []).length === 1 && !/setState\("loading"\)[\s\S]{0,40}quiet/.test(hook));
ok("the quiet refresh is cleaned up when the card closes or the tab changes", /clearInterval\(timer\)/.test(hook) && /removeEventListener\("visibilitychange"/.test(hook));
ok("the news card asks every minute (the route keeps one answer for a minute), pauses by hand, shows only the open tab's answer, and never swaps the list for a loading box on refresh", /NEWS_REFRESH_MS = 60_000/.test(card) && /refreshMs: paused \? 0 : NEWS_REFRESH_MS/.test(card) && /env\.data\.lang === lang/.test(card) && /state=\{mine \? "ok" : state\}/.test(card) && /<LiveStories/.test(card));
ok("the route keeps one answer for a minute (two for the Bengali tab, with its eleven feeds), and each feed on its own, so that one that fails for a moment gives its last good answer", /60 \* 1000/.test(route) && /bn: 2 \* 60 \* 1000/.test(route) && /memo\(`news-src:\$\{s\.url\}`, ttlMs/.test(route));

console.log(`LiveStories: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

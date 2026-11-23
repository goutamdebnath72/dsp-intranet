// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/ElapsedTimer.selftest.tsx </dev/null
// The digital timer of an Executive Deep Search answer: the clock face, its two states (ticking, stopped), and where the search window starts and stops it.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ElapsedTimer, formatElapsed, spokenElapsed } from "./ElapsedTimer";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

ok("the clock face is minutes:seconds.tenths", formatElapsed(0) === "00:00.0" && formatElapsed(47_300) === "00:47.3" && formatElapsed(59_999) === "00:59.9" && formatElapsed(61_000) === "01:01.0" && formatElapsed(125_400) === "02:05.4");
ok("a clock never runs backwards (a negative span shows zero) and an hour is still readable", formatElapsed(-500) === "00:00.0" && formatElapsed(3_600_000) === "60:00.0");
ok("spoken for a screen reader: seconds, and minutes with their plural", spokenElapsed(47_300) === "47.3 seconds" && spokenElapsed(65_200) === "1 minute 5.2 seconds" && spokenElapsed(125_000) === "2 minutes 5.0 seconds");

const running = renderToStaticMarkup(<ElapsedTimer startedAt={1000} stoppedAt={null} now={13_400} />);
ok("ticking: shows the time since the start, marked running, with a pulsing dot, as a timer for a screen reader", /data-elapsed-timer="running"/.test(running) && running.includes("00:12.4") && /role="timer"/.test(running) && /animate-ping/.test(running) && /Looking for the answer: 12\.4 seconds so far/.test(running));
const stopped = renderToStaticMarkup(<ElapsedTimer startedAt={1000} stoppedAt={48_300} now={999_999} />);
ok("stopped: shows exactly the time it took (the clock of now is ignored), marked stopped, with a check mark, and no pulsing dot", /data-elapsed-timer="stopped"/.test(stopped) && stopped.includes("00:47.3") && !/animate-ping/.test(stopped) && /The answer took 47\.3 seconds/.test(stopped) && /text-emerald-300/.test(stopped));
ok("the chip is in the normal flow (no absolute or zero-height strip), has a height of its own, and does not shrink: the window gives it a row, so it can never lie over a button of the reply (the overlap of 23 Nov)", !/\bh-0\b/.test(running) && !/\babsolute\b[^"]*data-elapsed/.test(running) && !/class="[^"]*\bsticky\b/.test(running) && /min-h-\[2rem\]/.test(running) && /shrink-0/.test(running));
ok("it says in words what it is: Searching while it ticks, Answered in when it has stopped", /Searching/.test(running) && !/Answered in/.test(running) && /Answered in/.test(stopped) && !/Searching/.test(stopped));
ok("digits do not jiggle as they change (tabular figures, a fixed-width face)", /tabular-nums/.test(running) && /font-mono/.test(running));

const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("the window runs the clock for EVERY search that loads (typed and sent with Enter, or pressed among the samples; the engine, the model or the deep synthesis): it starts when the search starts loading and stops in the render that ends the loading; a run again for the same words within 1.5 s goes on from its first start", /const \[searchClock, setSearchClock\]/.test(modal) && /if \(mode === null \|\| !submittedQuery\) \{ setSearchClock\(null\); return; \}/.test(modal) && /if \(isLoading\) \{/.test(modal) && /c\.q === submittedQuery && c\.end !== null && Date\.now\(\) - c\.end < 1500/.test(modal) && /return c && c\.end === null \? \{ \.\.\.c, end: Date\.now\(\) \} : c;/.test(modal) && !/mode === "intellectual"\) \{ setSearchClock/.test(modal));
ok("the timer is drawn in a ROW at the top of the results panel for any search (not only the deep one), while it runs and frozen beside the reply, and not beside an old answer once the box text has changed (isStale)", /\{searchClock && !isStale && <ElapsedTimer startedAt=\{searchClock\.start\} stoppedAt=\{searchClock\.end\} \/>\}/.test(modal) && modal.indexOf("<ElapsedTimer startedAt") < modal.indexOf('{isLoading && mode === "intellectual" ? ('));
const row = modal.slice(modal.indexOf("data-eds-toolbar"), modal.indexOf("data-eds-toolbar") + 1400);
ok("the row is in the flow, NOT sticky (it scrolls away with the reply), compact (min-h 2.5rem, py-1), with 'All sample questions' at the left and the timer at the right, both centred on one line (items-center), and it is there for a typed question too (no back link needed)", /data-eds-toolbar className="[^"]*flex min-h-\[2\.5rem\] items-center justify-between/.test(modal) && !/data-eds-toolbar className="[^"]*\bsticky\b/.test(modal) && /\(edsBackLink \|\| deepBack \|\| \(searchClock && !isStale\)\)/.test(modal) && row.indexOf("data-eds-back") > 0 && row.indexOf("data-eds-back") < row.indexOf("<ElapsedTimer"));
ok("each back button is drawn once, in that row, and nowhere else (to the shelf, and the plain Back)", (modal.match(/data-eds-back(?![-\w])/g) ?? []).length === 1 && (modal.match(/data-eds-back-default/g) ?? []).length === 1);
ok("a ticking timer is a single interval of a tenth of a second, cleared when it stops or the panel goes", /setInterval\(\(\) => setNow\(Date\.now\(\)\), 100\)/.test(readFileSync("src/components/ElapsedTimer.tsx", "utf8")) && /clearInterval/.test(readFileSync("src/components/ElapsedTimer.tsx", "utf8")));

ok("the dark face is a real colour (a bg-[#...] class), not an opacity variant of the project's neutral palette, which draws nothing here", /bg-\[#171717\]/.test(running) && !/bg-neutral-900\/\d+/.test(running));

console.log(`ElapsedTimer selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

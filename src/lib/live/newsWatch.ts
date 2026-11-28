// src/lib/live/newsWatch.ts
//
// THE BREAKING-NEWS WATCH. A tab is kept fresh for 30 minutes (5 while it holds a priority story), which is right for the ordinary run of news and would be too slow for the news that matters: a death, a big accident, a diplomatic visit. So every
// three minutes, when somebody is looking, the route reads a few of the quickest feeds of each language and tests their headlines with the priority rules (priority.ts). The first reading only notes what is there; after that, a priority headline that was
// not there before makes the three language tabs OLD at once, so that the next asking is answered from what is kept while a new tab is made in the background, and the story is on the screen within the next minute's check. The 30 minutes are broken for that
// news only. (A headline that the tab will then leave out, for having no picture or being paid, costs one extra rebuild, nothing more.)
import { priorityOf } from "./priority";
import { titleKey } from "./rss";

/** The feeds that are watched, by paper: the quick national ones of each language (the same feeds the tabs read, so that the reading costs nothing the tab would not). */
export const WATCHED = ["Times of India", "The Hindu", "NDTV", "BBC News India", "दैनिक जागरण", "दैनिक भास्कर", "Sangbad Pratidin", "BBC বাংলা"];
/** How often the watch looks, in milliseconds. */
export const WATCH_EVERY_MS = 3 * 60 * 1000;

export class BreakingWatch {
  private seen = new Set<string>();
  private primed = false;
  private last = 0;

  /** Is it time to look? (and, if so, the time is taken: only one look at a time). */
  due(now: number): boolean {
    if (now - this.last < WATCH_EVERY_MS) return false;
    this.last = now;
    return true;
  }

  /** Takes the headlines of a look; returns the priority headlines that were not seen before (none at the first look, which only sets what is known). */
  look(titles: string[]): string[] {
    const flagged = titles.filter((t) => priorityOf(t));
    const fresh = this.primed ? flagged.filter((t) => !this.seen.has(titleKey(t))) : [];
    for (const t of flagged) this.seen.add(titleKey(t));
    this.primed = true;
    if (this.seen.size > 500) this.seen = new Set([...this.seen].slice(-300));
    return fresh;
  }
}

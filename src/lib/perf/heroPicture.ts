// src/lib/perf/heroPicture.ts
//
// THE HOME PAGE'S HERO PICTURE: the lighter copy (210 KB, same picture) or the original (697 KB), as src/lib/perf/switches.js says (optimisedHeroPicture). One place, read by the page (which asks the browser to fetch it
// early) and by the hero itself (background and video poster), so they can never name two different files.
import { PERF } from "@/lib/perf/switches";

export const HERO_SRC = PERF.optimisedHeroPicture ? "/steel-plant1.opt.jpg" : "/steel-plant1.jpg";

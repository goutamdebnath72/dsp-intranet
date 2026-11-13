// src/tools/railway/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words of the Durgapur Railway Station card ("durgapur railway station trains"). The data, its source and its checks are in
// src/lib/live/railway.ts; how it looks is in RailwayCard.tsx and ui.tsx. It is listed once, in src/tools/registry.ts.
// A line is this card's when it has a key word and every word is a key word, an extra word or a filler: "trains" alone opens it, "train ticket booking" does not (it has words that are not the card's).
import { defineTopic } from "@/tools/types";

export const railwayTopic = defineTopic({
  id: "railway",
  live: {
    keys: ["train", "trains", "railway", "railways", "dgr", "memu", "irctc"],
    extra: ["durgapur", "station", "stn", "timetable", "timetables", "time", "times", "timing", "timings", "schedule", "schedules", "express", "mail", "local", "passenger", "arrival", "arrivals", "departure", "departures", "up", "down", "today", "list", "all", "info", "information", "and", "to", "from", "at", "of", "rail", "indian", "eastern", "stopping", "stops", "running", "days", "daily", "weekly", "durgapur's", "available", "details"],
  },
  samples: [
    { q: "durgapur railway station trains", note: "every mail and express train that stops at Durgapur (DGR), in two directions (towards Howrah and away from it), each with its arrival, its departure and the days it runs (Daily, or the weekdays), the specials marked; below them the local MEMU trains in both directions. From RailRadar's timetable, kept for twelve hours. It is the timetable, not live running status", instant: true },
    { q: "trains", note: "the same card: 'dgr trains', 'durgapur railway station', 'train timetable' and 'memu' open it too", instant: true },
  ],
});

// src/tools/flights/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words of the Andal Airport flights card ("andal airport flights to and from"). The data, its source and its checks are in
// src/lib/live/flights.ts; how it looks is in FlightsCard.tsx and ui.tsx. It is listed once, in src/tools/registry.ts.
// A line is this card's when it has a key word and every word is a key word, an extra word or a filler: "flights" alone opens it, "ltc flight booking rules" does not.
import { defineTopic } from "@/tools/types";

export const flightsTopic = defineTopic({
  id: "flights",
  live: {
    keys: ["flight", "flights", "airport", "andal", "rdp", "vedg", "airlines", "airline"],
    extra: ["durgapur", "kazi", "kaji", "qazi", "nazrul", "najrul", "nazrulislam", "islam", "kni", "to", "from", "and", "arrival", "arrivals", "departure", "departures", "schedule", "timetable", "timings", "timing", "time", "times", "status", "today", "live", "info", "information", "next", "details", "air", "indigo", "bengaluru", "bangalore", "delhi", "mumbai", "chennai", "hyderabad", "durgapur's", "bengal"],
  },
  samples: [
    { q: "andal airport flights to and from", note: "the flights between Andal Airport (Kazi Nazrul Islam Airport, Durgapur, RDP) and Bengaluru, Hyderabad, Chennai, Delhi and Mumbai, departures and arrivals with the times and flight numbers, read from the airport's own flight page; the next flight is marked. It is the airport's timetable, not live status: links to the airport's live boards are on the card", instant: true },
    { q: "durgapur flights", note: "the same card: 'flights', 'andal airport', 'durgapur airport', 'kazi nazrul airport' (also spelt 'kaji') and 'rdp flights' open it too", instant: true },
  ],
});

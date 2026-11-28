// src/tools/railway/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words of the railway card ("durgapur railway station trains"; its third tab, the Kolkata stations, opens with a station's code or name). The data, its source and its checks are in
// src/lib/live/railway.ts; how it looks is in RailwayCard.tsx and ui.tsx. It is listed once, in src/tools/registry.ts.
// My rule: a line is this card's when it has a key word and every word is a key word, an extra word or a filler. "trains" alone opens it, "train ticket booking" does not (it has words that are not the card's).
import { defineTopic } from "@/tools/types";

export const railwayTopic = defineTopic({
  id: "railway",
  intent: { title: "Trains at Durgapur, Asansol and Kolkata", about: "The trains that stop at Durgapur and Asansol, and those that start at Howrah, Sealdah, Santragachi and Kolkata: timings, the days they run, and their fares.", words: ["train", "trains", "railway", "rail", "station", "timetable", "express", "memu", "fare", "fares", "ticket", "irctc", "asansol", "dgr", "asn", "howrah", "sealdah", "santragachi", "kolkata", "hwh", "sdah", "koaa", "platform", "departure", "arrival", "stop", "stops", "stopping"] },
  live: {
    keys: ["train", "trains", "railway", "railways", "dgr", "asn", "hwh", "sdah", "src", "koaa", "memu", "irctc"],
    extra: ["fare", "fares", "price", "prices", "cost", "durgapur", "station", "stn", "timetable", "timetables", "time", "times", "timing", "timings", "schedule", "schedules", "express", "mail", "local", "passenger", "arrival", "arrivals", "departure", "departures", "up", "down", "today", "list", "all", "info", "information", "and", "to", "from", "at", "of", "rail", "indian", "eastern", "stopping", "stops", "running", "days", "daily", "weekly", "durgapur's", "available", "details", "howrah", "sealdah", "santragachi", "kolkata", "chitpur"],
    // The card opens on the Durgapur tab. I let "asn" (Asansol Junction's code, as "dgr" is Durgapur's) open it on the Asansol tab ("asn trains", "ASN"), and a Kolkata station's code or name (hwh, sdah, src, koaa; howrah, sealdah,
    // santragachi, kolkata) open it on the Kolkata tab at that station ("hwh", "sealdah trains"): unless the line also says dgr (which keeps it on the Durgapur tab as it always did), asn (which wins over the Kolkata names), or durgapur (which keeps the Kolkata names on the Durgapur tab).
    lang: (w) => {
      if (w.includes("dgr")) return undefined;
      if (w.includes("asn")) return "asn";
      if (w.includes("durgapur")) return undefined;
      const at = ([["hwh", "hwh"], ["howrah", "hwh"], ["sdah", "sdah"], ["sealdah", "sdah"], ["src", "src"], ["santragachi", "src"], ["koaa", "koaa"], ["kolkata", "koaa"], ["chitpur", "koaa"]] as const).find(([word]) => w.includes(word));
      return at?.[1];
    },
  },
  samples: [
    { q: "durgapur railway station trains", note: "every mail and express train that stops at Durgapur (DGR), in two directions (towards Howrah and away from it), each with its arrival, its departure and the days it runs (Daily, or the weekdays), the specials marked; below them the local MEMU trains in both directions. From RailRadar's timetable, kept for twelve hours. It is the timetable, not live running status. A second tab, Asansol Railway Junction (ASN), lists the trains a person at Durgapur can only have from Asansol: those that pass Durgapur without stopping and those that do not go over it", instant: true },
    { q: "dgr", note: "the station's code, in any case (dgr, DGR), opens the card on the Durgapur tab as you type, without Enter", instant: true },
    { q: "asn", note: "the code of Asansol Junction, in any case (asn, ASN), opens the same card on its Asansol tab as you type, without Enter ('asn trains' too)", instant: true },
    { q: "hwh", note: "the code of a Kolkata station (hwh Howrah, sdah Sealdah, src Santragachi, koaa Kolkata), in any case, opens the card on its Kolkata tab at that station as you type, without Enter ('sealdah trains' and 'howrah trains' too). The tab lists the trains that START at the four stations, go over neither Durgapur nor Asansol and touch none of the other three, with their times at the station, their days and their saved fares", instant: true },
    { q: "trains", note: "the same card: 'dgr trains', 'durgapur railway station', 'train timetable' and 'memu' open it too", instant: true },
    { q: "train fare", note: "the same card, with the fare finder: press ₹ Find a fare to a station, choose where you are going from Durgapur, and see every train that goes there with its fare for each class ('trains fares', 'dgr train price' open it too)", instant: true },
  ],
});

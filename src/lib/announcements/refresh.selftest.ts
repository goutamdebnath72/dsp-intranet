// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/announcements/refresh.selftest.ts
// What I check here: a change made in the Announcement Manager reaches the home page's lists without a browser refresh: the helper that matches their SWR keys, and the places the manager calls it.
import { readFileSync } from "node:fs";
import { isAnnouncementListKey, refreshAnnouncements } from "./refresh";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

ok("the two lists' keys match: /api/announcements (the side list) and /api/announcements?u=<user> (the feed), for any user", isAnnouncementListKey("/api/announcements") && isAnnouncementListKey("/api/announcements?u=498301") && isAnnouncementListKey("/api/announcements?u=guest"));
ok("nothing that is not a list matches: the file, read and single-announcement routes, other APIs, and keys that are not text", ["/api/announcements/9/file", "/api/announcements/9/read", "/api/announcements/9", "/api/announcementsX", "/api/circulars?year=2026", "", undefined, null, 7, ["/api/announcements"]].every((k) => !isAnnouncementListKey(k)));
const src = readFileSync("src/components/AnnouncementAdminPanel.tsx", "utf8");
const feed = readFileSync("src/components/AnnouncementsFeed.tsx", "utf8");
const side = readFileSync("src/components/Announcements.tsx", "utf8");
ok("the manager refreshes the lists after a publish, an edit and a delete that succeeded (three calls, each inside its success branch), and imports the helper", (src.match(/void refreshAnnouncements\(\)/g) ?? []).length === 3 && /import \{ refreshAnnouncements \} from "@\/lib\/announcements\/refresh"/.test(src) && /if \(res\.ok\) \{\s*void refreshAnnouncements\(\); \/\/ and I make the home page/.test(src) && /if \(res\.ok\) \{\s*void refreshAnnouncements\(\); \/\/ this makes the home page's lists show the edit/.test(src) && /if \(res\.ok\) \{\s*void refreshAnnouncements\(\); \/\/ this makes the home page's lists show the new announcement/.test(src));
ok("the helper's keys are the ones the two lists really use", /useSWR<[^>]*>\(\s*`\/api\/announcements\?u=\$\{userId\}`/.test(feed) && /useSWR<[^>]*>\("\/api\/announcements", fetcher\)/.test(side));
refreshAnnouncements().then((r) => {
  ok("asking for a refresh when no list is on the page does no harm (it answers, with nothing to refresh)", Array.isArray(r) && r.length === 0, JSON.stringify(r));
  console.log(`refresh selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});

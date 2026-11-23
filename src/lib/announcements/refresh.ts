// src/lib/announcements/refresh.ts
//
// TELLING THE HOME PAGE THAT THE ANNOUNCEMENTS CHANGED. The lists of announcements on the home page (src/components/AnnouncementsFeed.tsx and src/components/Announcements.tsx) keep what they fetched in the SWR cache and ask
// again only when the window gets focus again, so an announcement published, edited or deleted in the Announcement Manager (which is inside the search window, on the same page) did not show until the browser was
// refreshed. I make the manager call refreshAnnouncements() after every change that succeeded; every list that holds the announcements then fetches again at once.
import { mutate } from "swr";

/** The SWR keys of the announcement lists: "/api/announcements" and "/api/announcements?u=<user>". I leave out the file, read and single-announcement routes, because those are not lists. */
export const isAnnouncementListKey = (key: unknown): boolean => typeof key === "string" && (key === "/api/announcements" || key.startsWith("/api/announcements?"));

/** I make every announcement list on the page fetch its data again. */
export function refreshAnnouncements(): Promise<unknown> {
  return mutate(isAnnouncementListKey);
}

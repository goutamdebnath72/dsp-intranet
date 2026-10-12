// src/app/page.tsx
export const dynamic = "force-dynamic";

// NOTE: this page deliberately does NOT read the server-side login session. The server can only see the
// persistent login cookie, not whether this browser tab is still a live session (see SessionGuard), so any
// user name rendered from here could belong to someone who is no longer logged in.

import React from "react";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { withDbRetry } from "@/lib/db/resilience";
import { Link } from "@/lib/db/models";
import { getRecentCircularIds } from "@/lib/circulars/newStatus";
import { ACTIVE_UI_DESIGN } from "@/lib/config";
import HomePageClient from "@/components/HomePageClient";
import { HomepageNew } from "@/components/HomepageNew";

const cleanAndSortData = (links: any[]) => {
  return links
    .map((link) => ({
      ...link,
      // ✅ Fixes the plain-object warning by flattening the Luxon instance to an ISO string sequence
      createdAt:
        link.createdAt && typeof link.createdAt.toISO === "function"
          ? link.createdAt.toISO()
          : String(link.createdAt),
      subtitle: link.subtitle || null,
      icon: link.icon || null,
    }))
    .sort((a: any, b: any) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
};

// Each attempt asks getDb() again, so a retry after a dropped connection uses a fresh, healthy pool.
const fetchLinks = (category: string) =>
  withDbRetry(async () => {
    const dataSource = await getDb();
    // ✅ String-based entity lookup to survive Next.js HMR reloads
    return dataSource.getRepository<Link>("Link").find({ where: { category } });
  });

export default async function Home() {
  // Which circulars are NEW (uploaded in the last 24 hours) does not depend on who is looking, so no login session is needed to know it. It is asked
  // for at the same time as the links below, and handed to the page so that a logged-out visitor sees the red badge at once instead of waiting for a
  // separate request. If it fails, the page simply falls back to asking for it afterwards, as before.
  // The server can be SURE about exactly one kind of visitor: one with no login cookie at all is logged out. (It only looks whether such a cookie
  // exists, never at whose it is: that is why this stays consistent with the rule at the top of this file.) For that visitor the red badge is put
  // into the very first HTML, together with the rest of the page. Anyone else is told by the page itself once it has checked this tab.
  const visitorHasNoLoginCookie = !cookies()
    .getAll()
    .some((c) => c.name.includes("next-auth.session-token"));
  const recentCircularIdsPromise = withDbRetry(async () => getRecentCircularIds(await getDb())).catch(() => null);

  const quickLinksFromDb = await fetchLinks("quicklink");
  const departmentDataFromDb = await fetchLinks("department");
  const sailSitesDataFromDb = await fetchLinks("sail");

  const quickLinksData = cleanAndSortData(quickLinksFromDb);
  const departmentData = cleanAndSortData(departmentDataFromDb);
  const sailSitesData = cleanAndSortData(sailSitesDataFromDb);
  const recentCircularIds = await recentCircularIdsPromise;

  if (ACTIVE_UI_DESIGN === "new") {
    return (
      <HomepageNew
        quickLinksData={quickLinksData}
        departmentData={departmentData}
        sailSitesData={sailSitesData}
        recentCircularIds={recentCircularIds}
        visitorHasNoLoginCookie={visitorHasNoLoginCookie}
      />
    );
  }

  return (
    <HomePageClient
      quickLinksData={quickLinksData}
      departmentData={departmentData}
      sailSitesData={sailSitesData}
      recentCircularIds={recentCircularIds}
      visitorHasNoLoginCookie={visitorHasNoLoginCookie}
    />
  );
}

// src/app/page.tsx
export const dynamic = "force-dynamic";

// NOTE: this page deliberately does NOT read the server-side login session. The server can only see the
// persistent login cookie, not whether this browser tab is still a live session (see SessionGuard), so any
// user name rendered from here could belong to someone who is no longer logged in.

import React from "react";
import { getDb } from "@/lib/db";
import { withDbRetry } from "@/lib/db/resilience";
import { Link } from "@/lib/db/models";
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
  const quickLinksFromDb = await fetchLinks("quicklink");
  const departmentDataFromDb = await fetchLinks("department");
  const sailSitesDataFromDb = await fetchLinks("sail");

  const quickLinksData = cleanAndSortData(quickLinksFromDb);
  const departmentData = cleanAndSortData(departmentDataFromDb);
  const sailSitesData = cleanAndSortData(sailSitesDataFromDb);

  if (ACTIVE_UI_DESIGN === "new") {
    return (
      <HomepageNew
        quickLinksData={quickLinksData}
        departmentData={departmentData}
        sailSitesData={sailSitesData}
      />
    );
  }

  return (
    <HomePageClient
      quickLinksData={quickLinksData}
      departmentData={departmentData}
      sailSitesData={sailSitesData}
    />
  );
}

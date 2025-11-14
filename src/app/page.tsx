// src/app/page.tsx
export const dynamic = "force-dynamic";

import React from "react";
// ⛔️ REMOVED: import db from "@/lib/db";
// ✅ ADDED: Import the single connection function
import { getDb } from "@/lib/db";
import { ACTIVE_UI_DESIGN } from "@/lib/config";
import HomePageClient from "@/components/HomePageClient";
import { HomepageNew } from "@/components/HomepageNew";
import { getServerSession } from "next-auth/next";
// ⛔️ REMOVED: import { authOptions } from "@/lib/auth";
// ✅ ADDED: Import the new async auth function
import { getAuthOptions } from "@/lib/auth";

// (Your helper function, unchanged)
const cleanAndSortData = (links: any[]) => {
  return links
    .map((link) => ({
      ...link,
      subtitle: link.subtitle || null,
      icon: link.icon || null,
    }))
    .sort((a: any, b: any) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
};

export default async function Home() {
  // ✅ ADDED: Get the shared DB connection
  const db = await getDb();
  // ✅ ADDED: Get the async auth options
  const authOptions = await getAuthOptions();

  // (Your data fetching logic, unchanged, now uses the correct 'db')
  const quickLinksFromDb = await db.Link.findAll({
    where: { category: "quicklink" },
    raw: true,
  });
  const departmentDataFromDb = await db.Link.findAll({
    where: { category: "department" },
    raw: true,
  });
  const sailSitesDataFromDb = await db.Link.findAll({
    where: { category: "sail" },
    raw: true,
  });

  // (Your data cleaning logic, unchanged)
  const quickLinksData = cleanAndSortData(quickLinksFromDb);
  const departmentData = cleanAndSortData(departmentDataFromDb);
  const sailSitesData = cleanAndSortData(sailSitesDataFromDb);

  // ✅ CHANGED: Pass the new authOptions to getServerSession
  const session = await getServerSession(authOptions);

  // (Your UI switch logic, unchanged)
  if (ACTIVE_UI_DESIGN === "new") {
    return (
      <HomepageNew
        quickLinksData={quickLinksData}
        departmentData={departmentData}
        sailSitesData={sailSitesData}
        userName={session?.user?.name ?? "Guest"}
      />
    );
  }

  // By default, show the current design.
  return (
    <HomePageClient
      quickLinksData={quickLinksData}
      departmentData={departmentData}
      sailSitesData={sailSitesData}
    />
  );
}

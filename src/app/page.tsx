// src/app/page.tsx
export const dynamic = 'force-dynamic';

import React from "react";
import db from "@/lib/db"; // <-- IMPORT OUR NEW DB SWITCHBOARD
import { ACTIVE_UI_DESIGN } from "@/lib/config";
import HomePageClient from "@/components/HomePageClient";
import { HomepageNew } from "@/components/HomepageNew";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// Helper function to clean and sort data for components
const cleanAndSortData = (links: any[]) => {
  return links
    .map((link) => ({
      ...link,
      // Convert undefined fields to null to match component props
      subtitle: link.subtitle || null,
      icon: link.icon || null,
    }))
    .sort((a: any, b: any) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
};

export default async function Home() {
  const quickLinksFromDb = await db.Link.findAll({
    where: { category: "quicklink" },
    raw: true, // <-- Get plain JSON objects
  });
  const departmentDataFromDb = await db.Link.findAll({
    where: { category: "department" },
    raw: true, // <-- Get plain JSON objects
  });
  // --- 1. Fetch SAIL sites ---
  const sailSitesDataFromDb = await db.Link.findAll({
    where: { category: "sail" },
    raw: true, // <-- Get plain JSON objects
  });

  // --- 2. Clean and sort all data ---
  const quickLinksData = cleanAndSortData(quickLinksFromDb);
  const departmentData = cleanAndSortData(departmentDataFromDb);
  const sailSitesData = cleanAndSortData(sailSitesDataFromDb);

  const session = await getServerSession(authOptions);

  // The Switch Logic
  if (ACTIVE_UI_DESIGN === "new") {
    return (
      <HomepageNew
        quickLinksData={quickLinksData}
        departmentData={departmentData}
        sailSitesData={sailSitesData} // <-- 3. PASSED PROP
        userName={session?.user?.name ?? "Guest"}
      />
    );
  }

  // By default, show the current design.
  return (
    <HomePageClient
      quickLinksData={quickLinksData}
      departmentData={departmentData}
      sailSitesData={sailSitesData} // <-- 4. PASSED PROP
    />
  );
}

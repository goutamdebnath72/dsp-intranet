// src/app/page.tsx
export const dynamic = "force-dynamic";

import React from "react";
import { getDb } from "@/lib/db";
import { Link } from "@/lib/db/models";
import { ACTIVE_UI_DESIGN } from "@/lib/config";
import HomePageClient from "@/components/HomePageClient";
import { HomepageNew } from "@/components/HomepageNew";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/lib/auth";

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

export default async function Home() {
  const dataSource = await getDb();
  const authOptions = await getAuthOptions();

  // ✅ Switched to string-based entity lookup to survive Next.js HMR reloads
  const linkRepository = dataSource.getRepository<Link>("Link");

  const quickLinksFromDb = await linkRepository.find({
    where: { category: "quicklink" },
  });

  const departmentDataFromDb = await linkRepository.find({
    where: { category: "department" },
  });

  const sailSitesDataFromDb = await linkRepository.find({
    where: { category: "sail" },
  });

  const quickLinksData = cleanAndSortData(quickLinksFromDb);
  const departmentData = cleanAndSortData(departmentDataFromDb);
  const sailSitesData = cleanAndSortData(sailSitesDataFromDb);

  const session = await getServerSession(authOptions);

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

  return (
    <HomePageClient
      quickLinksData={quickLinksData}
      departmentData={departmentData}
      sailSitesData={sailSitesData}
    />
  );
}

// src/app/page.tsx

import React from "react";
import { prisma } from "@/lib/prisma";
import { Link } from "@prisma/client";
import { ACTIVE_UI_DESIGN } from "@/lib/config";
import HomePageClient from "@/components/HomePageClient";
import { HomepageNew } from "@/components/HomepageNew";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const quickLinksFromDb = await prisma.link.findMany({
    where: { category: "quicklink" },
  });
  const departmentDataFromDb = await prisma.link.findMany({
    where: { category: "department" },
  });

  // --- 1. ADDED: Fetch SAIL sites ---
  const sailSitesDataFromDb = await prisma.link.findMany({
    where: { category: "sail" },
  });

  const quickLinksData = quickLinksFromDb.sort((a: Link, b: Link) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  );
  const departmentData = departmentDataFromDb.sort((a: Link, b: Link) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  );

  // --- 2. ADDED: Sort SAIL sites ---
  const sailSitesData = sailSitesDataFromDb.sort((a: Link, b: Link) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  );

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
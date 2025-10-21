// src/app/page.tsx

import React from "react";
import { prisma } from "@/lib/prisma";
import { Link } from "@prisma/client";
import { ACTIVE_UI_DESIGN } from "@/lib/config";
import HomePageClient from "@/components/HomePageClient";
import { HomepageNew } from "@/components/HomepageNew";

// --- 👇 NEW: Import NextAuth functions to get the session ---
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const quickLinksFromDb = await prisma.link.findMany({
    where: { category: "quicklink" },
  });
  const departmentDataFromDb = await prisma.link.findMany({
    where: { category: "department" },
  });

  const quickLinksData = quickLinksFromDb.sort((a: Link, b: Link) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  const departmentData = departmentDataFromDb.sort((a: Link, b: Link) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  // --- 👇 NEW: Get the user's session on the server ---
  const session = await getServerSession(authOptions);

  // The Switch Logic
  if (ACTIVE_UI_DESIGN === "new") {
    return (
      <HomepageNew
        quickLinksData={quickLinksData}
        departmentData={departmentData}
        // --- 👇 MODIFIED: Pass the user's name (or "Guest") to the new homepage ---
        userName={session?.user?.name ?? "Guest"}
      />
    );
  }

  // By default, show the current design. This part is UNCHANGED.
  return (
    <HomePageClient
      quickLinksData={quickLinksData}
      departmentData={departmentData}
    />
  );
}


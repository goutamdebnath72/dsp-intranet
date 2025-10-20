// src/app/page.tsx

import React from 'react';
import { prisma } from '@/lib/prisma';
import { Link } from '@prisma/client'; // <-- 1. ADD THIS IMPORT

// Import your switchboard config
import { ACTIVE_UI_DESIGN } from '@/lib/config';

// Import BOTH of your homepage designs
import HomePageClient from '@/components/HomePageClient'; // Your CURRENT design
import { HomepageNew } from '@/components/HomepageNew';   // Your NEW design

export default async function Home() {
  const quickLinksFromDb = await prisma.link.findMany({
    where: { category: 'quicklink' },
  });
  const departmentDataFromDb = await prisma.link.findMany({
    where: { category: 'department' },
  });

  // 2. FIX: Explicitly type 'a' and 'b' to fix the 'any' error
  const quickLinksData = quickLinksFromDb.sort((a: Link, b: Link) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
  const departmentData = departmentDataFromDb.sort((a: Link, b: Link) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  // The Switch Logic
  if (ACTIVE_UI_DESIGN === 'new') {
    return (
      <HomepageNew
        quickLinksData={quickLinksData}
        departmentData={departmentData}
      />
    );
  }

  // By default, show the current design
  return (
    <HomePageClient
      quickLinksData={quickLinksData}
      departmentData={departmentData}
    />
  );
}
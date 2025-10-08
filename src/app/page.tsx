// In src/app/page.jsx

import HeroBanner from '@/components/HeroBanner';     // 👈 ADD THIS
import QuickLinks from '@/components/QuickLinks';
import Announcements from '@/components/Announcements';
import DepartmentSites from '@/components/DepartmentSites';
import prisma from '@/lib/prisma';

// 2. Make the component async to allow for data fetching
export default async function Home() {

  // 3. Fetch data for both components on the server
  const quickLinksData = await prisma.link.findMany({
    where: { category: 'quicklink' },
    orderBy: { createdAt: 'asc' },
  });

  const departmentData = await prisma.link.findMany({
    where: { category: 'department' },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-neutral-50 min-h-screen">

      {/* ✅ Reinserted HeroBanner at top */}
      <HeroBanner />

      {/* 4. We'll use a more robust CSS Grid for the layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        {/* Main content spans 2 columns on large screens */}
        <main className="lg:col-span-2 space-y-8">
          <Announcements />
          {/* 5. Pass the fetched data as props */}
          <DepartmentSites departmentData={departmentData} />
        </main>

        {/* Aside content spans 1 column */}
        <aside>
          {/* 5. Pass the fetched data as props */}
          <QuickLinks quickLinksData={quickLinksData} />
        </aside>
      </div>
    </div>
  );
}

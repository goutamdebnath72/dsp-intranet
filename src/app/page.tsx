// In src/app/page.tsx

import HeroBanner from '@/components/HeroBanner';
import QuickLinks from '@/components/QuickLinks';
import Announcements from '@/components/Announcements';
import DepartmentSites from '@/components/DepartmentSites';
import prisma from '@/lib/prisma';

export default async function Home() {
  const quickLinksData = await prisma.link.findMany({
    where: { category: 'quicklink' },
    orderBy: { createdAt: 'asc' },
  });
  const departmentData = await prisma.link.findMany({
    where: { category: 'department' },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="w-full min-[1500px]:w-[80%] min-[1800px]:w-[72%] mx-auto p-4 sm:p-6 lg:p-8 bg-neutral-50 min-h-screen">
      <HeroBanner />

      {/* Changed to a 5-column grid on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mt-8">
        {/* Main content now spans 3 columns */}
        <main className="lg:col-span-3 space-y-8">
          <Announcements />
          <DepartmentSites departmentData={departmentData} />
        </main>

        {/* Aside content now spans 2 columns */}
        <aside className="lg:col-span-2">
          <QuickLinks quickLinksData={quickLinksData} />
        </aside>
      </div>
    </div>
  );
}
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
    <div className="p-4 sm:p-6 lg:p-8">
      <HeroBanner />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mt-8">
        <main className="lg:col-span-3 space-y-8">
          <Announcements />
          <DepartmentSites departmentData={departmentData} />
        </main>
        <aside className="lg:col-span-2">
          <QuickLinks quickLinksData={quickLinksData} />
        </aside>
      </div>
    </div>
  );
}
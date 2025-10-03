import QuickLinks from '@/components/QuickLinks';
import Announcements from '@/components/Announcements';
import DepartmentSites from '@/components/DepartmentSites';
import HeroBanner from '@/components/HeroBanner';

export default function Home() {
  return (
    // We'll wrap the content in a single div to manage layout
    <div className="p-4 sm:p-6 lg:p-8 bg-slate-50 min-h-screen">

      {/* 2. Add the Hero Banner here */}
      <HeroBanner />

      <div className="flex flex-col lg:flex-row gap-8">
        <main className="w-full lg:w-2/3 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="space-y-8">
            <Announcements />
            <DepartmentSites />
          </div>
        </main>
        <aside className="w-full lg:w-1/3 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <QuickLinks />
        </aside>
      </div>
    </div>
  );
}
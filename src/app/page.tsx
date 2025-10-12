import prisma from '@/lib/prisma';
import HomePageClient from '@/components/HomePageClient';

// This remains a fast, async Server Component
export default async function Home() {
  // Fetch data exactly as you had it
  const quickLinksFromDb = await prisma.link.findMany({
    where: { category: 'quicklink' },
  });

  const departmentDataFromDb = await prisma.link.findMany({
    where: { category: 'department' },
  });

  const quickLinksData = quickLinksFromDb.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  const departmentData = departmentDataFromDb.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  // Pass the fetched data to the new Client Component
  return (
    <HomePageClient
      quickLinksData={quickLinksData}
      departmentData={departmentData}
    />
  );
}


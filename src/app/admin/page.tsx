import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AnnouncementForm from '@/components/AnnouncementForm';

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold font-heading mb-2 text-center">Admin Dashboard</h1>
      <p className="mb-8 text-neutral-600 text-center">Create a new announcement</p>

      <div className="flex justify-center">
        <AnnouncementForm />
      </div>
    </div>
  );
}
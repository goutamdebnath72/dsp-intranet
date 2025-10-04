// src/app/admin/page.tsx
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import AnnouncementForm from '@/components/AnnouncementForm';
import { authOptions } from '@/lib/auth'; // 1. Import the shared options

export default async function AdminPage() {
    // 2. Pass the options to getServerSession
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect('/');
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 bg-slate-50 min-h-screen">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800 mb-6">Admin Dashboard</h1>
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Create New Announcement</h2>
                    <AnnouncementForm />
                </div>
            </div>
        </div>
    );
}
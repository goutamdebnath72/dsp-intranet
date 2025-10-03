import React from 'react';
import prisma from '@/lib/prisma';


// This is a Server Component, so we can make it async and fetch data directly.
async function Announcements() {
    // 1. Fetch data from the database instead of using a hardcoded array
    const announcementsData = await prisma.announcement.findMany({
        orderBy: {
            date: 'desc', // Get the newest announcements first
        },
        take: 5, // Limit to the 5 most recent announcements
    });

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Announcements & Happenings
            </h2>
            <div className="space-y-4">
                {announcementsData.map((item) => {
                    // 2. We can calculate if an item is "new" on the fly
                    const threeDaysAgo = new Date();
                    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                    const isNew = item.date > threeDaysAgo;

                    return (
                        <div key={item.id} className="border-b last:border-b-0 pb-4 last:pb-0">
                            <div className="flex items-center justify-between">
                                <h3 className="font-medium text-gray-800">{item.title}</h3>
                                {isNew && (
                                    <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                        New
                                    </span>
                                )}
                            </div>
                            {/* 3. Format the date from the database for display */}
                            <p className="text-sm text-gray-500 mt-1">
                                {item.date.toLocaleDateString('en-GB', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                })}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default Announcements;
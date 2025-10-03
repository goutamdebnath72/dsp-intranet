import React from 'react';
import {
    BookUser,
    Fingerprint,
    Mail,
    ShieldAlert,
    Users,
    Search
} from 'lucide-react';
import prisma from '@/lib/prisma';

// Use the more general 'React.ElementType' for the icon map
const iconMap: { [key: string]: React.ElementType } = {
    BookUser,
    Fingerprint,
    Mail,
    ShieldAlert,
    Users,
    Search,
};



async function QuickLinks() {
    const quickLinksData = await prisma.link.findMany({
        where: { category: 'quicklink' },
        orderBy: { createdAt: 'asc' },
    });

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Links</h2>
            <nav>
                <ul className="space-y-2">
                    {quickLinksData.map((link) => {
                        const IconComponent = link.icon ? iconMap[link.icon] : null;

                        return (
                            <li key={link.id}>
                                <a
                                    href={link.href}
                                    target={link.href.startsWith('http') ? '_blank' : '_self'}
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 p-2 rounded-md text-gray-700 font-medium transition-colors duration-200 hover:bg-blue-50 hover:text-blue-600"
                                >
                                    {IconComponent && <IconComponent className="h-5 w-5" />}
                                    <span>{link.name}</span>
                                </a>
                            </li>
                        );
                    })}
                </ul>
            </nav>
        </div>
    );
};

export default QuickLinks;
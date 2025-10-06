// In src/components/QuickLinks.tsx
'use client'; // 1. Convert to a Client Component

import React from 'react';
import { BookUser, Fingerprint, Mail, ShieldAlert, Users, Search } from 'lucide-react';
import { motion } from 'framer-motion';

const iconMap: { [key: string]: React.ElementType } = {
    BookUser, Fingerprint, Mail, ShieldAlert, Users, Search,
};

// 2. Define the type for the props we're receiving
type QuickLinksProps = {
    quickLinksData: {
        id: number;
        href: string;
        name: string;
        icon: string | null;
    }[];
};

// 3. Accept the 'quickLinksData' as a prop
const QuickLinks: React.FC<QuickLinksProps> = ({ quickLinksData }) => {
    return (
        <motion.div
            className="bg-white/30 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20 h-[50vh]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
        >
            <h2 className="text-xl font-bold font-heading text-neutral-800 mb-4">Quick Links</h2>
            <nav>
                <ul className="space-y-2 h-[calc(100%-2.5rem)] overflow-y-auto group scrollbar-thin scrollbar-track-transparent scrollbar-thumb-transparent group-hover:scrollbar-thumb-neutral-400/50">
                    {quickLinksData.map((link) => {
                        const IconComponent = link.icon ? iconMap[link.icon] : null;
                        return (
                            <li key={link.id}>
                                <a
                                    href={link.href}
                                    target={link.href.startsWith('http') ? '_blank' : '_self'}
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 p-2 rounded-md text-neutral-700 font-medium transition-colors duration-200 hover:bg-primary-100/50 hover:text-primary-800"
                                >
                                    {IconComponent && <IconComponent className="h-5 w-5" />}
                                    <span>{link.name}</span>
                                </a>
                            </li>
                        );
                    })}
                </ul>
            </nav>
        </motion.div>
    );
};

export default QuickLinks;
// src/components/DepartmentSites.tsx
'use client'; // Required for Framer Motion's hover animations

import React from 'react';
import prisma from '@/lib/prisma';
import { Laptop, Signal, HeartPulse, Landmark, Shield, Flame, Wrench, Building } from 'lucide-react';
import { motion } from 'framer-motion'; // 1. Import motion

const iconMap: { [key: string]: React.ElementType } = {
    Laptop, Signal, HeartPulse, Landmark, Shield, Flame, Wrench, Building
};

// NOTE: Since we are adding client-side animations, this component can no longer be a Server Component.
// We will need to pass the `departmentData` as a prop instead of fetching it directly.
// This is a common pattern when enhancing server-rendered data with client-side interactivity.

type DepartmentSitesProps = {
    departmentData: {
        id: number;
        href: string;
        name: string;
        icon: string | null;
    }[];
};

const DepartmentSites: React.FC<DepartmentSitesProps> = ({ departmentData }) => {
    return (
        // 2. Apply glassmorphism and the main entrance animation
        <motion.div
            className="bg-white/30 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
        >
            <h2 className="text-xl font-bold font-heading text-neutral-800 mb-4">Department & Utility Sites</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {departmentData.map((dept) => {
                    const IconComponent = dept.icon ? iconMap[dept.icon] : null;
                    return (
                        // 3. Wrap the link in a motion component for hover animations
                        <motion.a
                            key={dept.id}
                            href={dept.href}
                            className="flex flex-col items-center justify-center p-4 border border-transparent rounded-lg text-center text-neutral-700 font-medium transition-colors duration-200 hover:bg-primary-100/50 hover:text-primary-800"
                            whileHover={{ scale: 1.05, y: -5, boxShadow: "0px 10px 20px rgba(0,0,0,0.1)" }}
                            transition={{ type: 'spring', stiffness: 300 }}
                        >
                            {IconComponent && <IconComponent className="h-8 w-8 mb-2" />}
                            <span>{dept.name}</span>
                        </motion.a>
                    );
                })}
            </div>
        </motion.div>
    );
};

export default DepartmentSites;
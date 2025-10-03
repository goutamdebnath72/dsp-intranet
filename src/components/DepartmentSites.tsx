import React from 'react';
import prisma from '@/lib/prisma';
import { Laptop, Signal, HeartPulse, Landmark, Shield, Flame, Wrench, Building } from 'lucide-react';

const iconMap: { [key: string]: React.ElementType } = {
    Laptop, Signal, HeartPulse, Landmark, Shield, Flame, Wrench, Building
};

async function DepartmentSites() {
    const departmentData = await prisma.link.findMany({
        where: { category: 'department' },
        orderBy: { name: 'asc' },
    });

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Department & Utility Sites</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {departmentData.map((dept) => {
                    const IconComponent = dept.icon ? iconMap[dept.icon] : null;
                    return (
                        <a key={dept.id} href={dept.href} className="flex flex-col items-center justify-center p-4 border rounded-lg text-center text-gray-700 font-medium transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 hover:shadow-md hover:border-blue-300">
                            {IconComponent && <IconComponent className="h-8 w-8 mb-2" />}
                            <span>{dept.name}</span>
                        </a>
                    );
                })}
            </div>
        </div>
    );
};

export default DepartmentSites;
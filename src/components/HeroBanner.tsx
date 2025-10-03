import React from 'react';
import Image from 'next/image';

const HeroBanner: React.FC = () => {
    return (
        <div className="relative w-full h-48 rounded-lg overflow-hidden mb-8 animate-fade-in-up">
            <Image
                src="/hero-banner.jpg"
                alt="DSP Banner"
                layout="fill"
                objectFit="cover"
                quality={80}
                priority
            />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/70 to-cyan-700/40" />
            <div className="relative h-full flex flex-col justify-center items-start p-8 sm:p-12">
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    Welcome to the DSP Intranet
                </h1>
                <p className="text-white/80 mt-2 max-w-lg">
                    Your central hub for tools, announcements, and resources.
                </p>
            </div>
        </div>
    );
};

export default HeroBanner;
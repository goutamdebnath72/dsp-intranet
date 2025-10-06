// src/components/HeroBanner.tsx
'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';

const HeroBanner: React.FC = () => {
    return (
        <motion.div
            className="relative w-full h-[30vh] max-h-[190px] rounded-lg overflow-hidden mb-8 shadow-2xl shadow-primary-500/20"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
        >
            <Image
                src="/hero-banner.jpg"
                alt="DSP Banner"
                fill
                className="object-cover"
                quality={80}
                priority
            />
            <div
                className="absolute inset-0 opacity-10"
                style={{ backgroundImage: 'url("/grid.svg")' }}
            />

            {/* 👇 THIS IS THE FIX: Restored your original bluish gradient overlay 👇 */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/70 to-cyan-700/40" />

            <div className="relative h-full flex flex-col justify-center items-start p-8 sm:p-12">
                {/* We are keeping the new, more elegant heading font */}
                <h1 className="text-2xl sm:text-3xl font-bold font-heading text-white tracking-tight">
                    Welcome to the DSP Intranet
                </h1>
                <p className="text-white/80 mt-2 max-w-lg">
                    Your central hub for tools, announcements, and resources.
                </p>
            </div>
        </motion.div>
    );
};

export default HeroBanner;
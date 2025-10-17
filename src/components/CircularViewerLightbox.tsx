'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Loader2, AlertCircle } from 'lucide-react';

type Circular = {
    id: number;
    headline: string;
    publishedAt: string;
    fileUrls: string[];
};

type Props = {
    circularId: number | null;
    onClose: () => void;
};

export function CircularViewerLightbox({ circularId, onClose }: Props) {
    const [circular, setCircular] = useState<Circular | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (circularId) {
            setIsLoading(true);
            setError(null);
            //setCircular(null);

            fetch(`/api/circulars/${circularId}`)
                .then(res => {
                    if (!res.ok) throw new Error('Failed to fetch circular data.');
                    return res.json();
                })
                .then(data => {
                    setCircular(data);
                })
                .catch(err => {
                    console.error(err);
                    setError('Could not load the circular.');
                })
                .finally(() => {
                    setIsLoading(false);
                });
        }
    }, [circularId]);

    return (
        <AnimatePresence>
            {circularId && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex flex-col"
                    onClick={onClose}
                >
                    {/* FIX: Header now contains the 'X' button on the top-left */}
                    <header className="flex-shrink-0 bg-black/30 text-white flex items-center p-4 space-x-4">
                        {/* The new button with the correct hover effect */}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-full text-white/70 bg-transparent transition-all duration-200 ease-in-out transform hover:scale-110 hover:bg-red-100 hover:text-primary-600"
                        >
                            <X size={28} />
                        </button>
                        <div className='flex-1 min-w-0'>
                            <h1 className="text-lg font-semibold truncate">
                                {isLoading ? 'Loading...' : circular?.headline || 'Circular'}
                            </h1>
                        </div>
                    </header>

                    {/* Content */}
                    <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 flex justify-center" onClick={e => e.stopPropagation()}>
                        {isLoading && (
                            <div className="flex items-center justify-center h-full text-white">
                                <Loader2 className="animate-spin" size={48} />
                            </div>
                        )}
                        {error && (
                            <div className="flex flex-col items-center justify-center h-full text-red-400">
                                <AlertCircle size={48} className="mb-4" />
                                <p>{error}</p>
                            </div>
                        )}
                        {circular && (
                            <div className="w-full max-w-4xl space-y-6">
                                {circular.fileUrls.map((url, index) => (
                                    <img
                                        key={index}
                                        src={url}
                                        alt={`Page ${index + 1} of ${circular.headline}`}
                                        className="w-full rounded-md shadow-lg"
                                    />
                                ))}
                            </div>
                        )}
                    </main>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
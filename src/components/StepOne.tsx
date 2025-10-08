// src/components/StepOne.tsx
'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { AnimatedInput } from './AnimatedInput';

export const StepOne = ({ ticketNo, setTicketNo, onNext, error }: any) => {
    return (
        // Corrected className to use flex-grow and padding for proper layout
        <motion.div key="step1" exit={{ x: '-50%', opacity: 0 }} className="flex flex-col flex-grow p-8">
            <div>
                <h2 className="mb-2 text-2xl font-bold font-heading text-neutral-800">Welcome Back</h2>
                <p className="h-5 text-neutral-600 text-sm">
                    {error ? <span className="text-red-600">{error}</span> : 'Please enter your ID to continue.'}
                </p>
            </div>

            <div className="mt-16">
                <AnimatedInput
                    id="step1_ticketNo"
                    label="Ticket Number"
                    value={ticketNo}
                    onChange={(e: any) => setTicketNo(e.target.value)}
                    onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); onNext(); } }}
                    autoFocus
                />
            </div>

            <button onClick={onNext} className="mt-auto flex flex-col items-center text-neutral-600 hover:text-primary-600 transition-colors">
                <span className="font-semibold text-lg">Next</span>
                <ArrowRight size={20} />
            </button>
        </motion.div>
    );
};
'use client';

import { ArrowRight } from 'lucide-react';

const AnimatedInput = ({ id, label, isReadOnly = false }: any) => {
    return (
        <div className="relative pt-4">
            <label htmlFor={id} className="absolute left-0 -top-1.5 text-sm text-primary-600 font-medium">
                {label}
            </label>
            <input
                id={id}
                type="text"
                readOnly={isReadOnly}
                // THE FIX: Removed horizontal padding (p-2 -> py-2)
                className="w-full bg-transparent px-2 py-1 text-lg tracking-wide text-neutral-800 font-mono border-b-2 border-neutral-300 focus:outline-none focus:border-primary-600 focus:bg-primary-100/50 disabled:bg-neutral-100"
                // Added a value for demonstration
                defaultValue={isReadOnly ? "342461" : ""}
            />
        </div>
    );
};

export const LoginPrototype = () => {
    return (
        <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-2xl overflow-hidden min-h-[370px]">
            <div className="flex flex-col h-full">
                <div>
                    <h2 className="mb-2 text-2xl font-bold font-heading text-neutral-800">Welcome Back</h2>
                    <p className="h-5 text-neutral-600">Please enter your ID to continue.</p>
                </div>

                <div className="mt-16">
                    <AnimatedInput id="ticketNo" label="Ticket Number" />
                </div>

                <button className="mt-auto flex flex-col items-center text-neutral-600 hover:text-primary-600 transition-colors">
                    <span className="font-semibold text-lg">Next</span>
                    <ArrowRight size={20} />
                </button>
            </div>
        </div>
    );
};
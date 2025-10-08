// src/components/StepTwo.tsx
'use client';

import { motion } from 'framer-motion';
import { Loader2, ArrowLeft } from 'lucide-react';
import { AnimatedInput } from './AnimatedInput';

export const StepTwo = ({ ticketNo, password, setPassword, onSubmit, error, isLoading, onBack }: any) => {
  return (
    <motion.div
      key="step2"
      initial={{ x: '50%', opacity: 0 }}
      animate={{ x: '0%', opacity: 1 }}
      className="flex flex-col flex-grow p-8"
    >
      <div>
        <h2 className="mb-2 text-2xl font-bold font-heading text-neutral-800">Enter Password</h2>
        <p className="h-5 text-red-600 text-sm">{error || ' '}</p>
      </div>
      <div className="my-auto space-y-8">
        <AnimatedInput
          id="ticketNoDisplay"
          label="Ticket Number"
          value={ticketNo}
          isReadOnly={true}
        />
        <AnimatedInput
          id="password"
          label="SAIL Personal No."
          type="password"
          value={password}
          onChange={(e: any) => setPassword(e.target.value)}
          onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(e); } }}
          autoFocus
        />
      </div>

      <div className="mt-auto flex flex-col items-center">
        <button
          onClick={onBack}
          className="flex items-center text-sm text-neutral-500 hover:text-primary-600 transition-colors mb-4 -translate-x-1"        >
          <ArrowLeft size={16} className="mr-1" />
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={isLoading}
          className="flex flex-col items-center text-neutral-600 hover:text-primary-600 transition-colors disabled:opacity-50"
        >
          <span className="font-semibold text-lg">
            {isLoading ? <Loader2 className="animate-spin" /> : 'Sign In'}
          </span>
        </button>
      </div>
    </motion.div>
  );
};
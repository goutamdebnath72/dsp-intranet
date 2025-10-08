// src/components/LoginModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useModal } from '@/context/ModalContext';
import { StepOne } from './StepOne';
import { StepTwo } from './StepTwo';

export default function LoginModal() {
  const { isModalOpen, closeModal } = useModal();
  const [step, setStep] = useState(1);
  const [ticketNo, setTicketNo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isModalOpen) {
      const timer = setTimeout(() => {
        setStep(1); setTicketNo(''); setPassword(''); setError(''); setIsLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isModalOpen]);

  const handleNext = () => {
    if (ticketNo.trim().length >= 1) {
      setError('');
      setStep(2);
    } else {
      setError('Please enter a valid Ticket Number.');
    }
  };
  
  // New function to handle going back to step 1
  const handleBack = () => {
    setStep(1);
    setError(''); // Clear any previous errors
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');
    setIsLoading(true);
    try {
      const result = await signIn('credentials', {
        redirect: false,
        ticketNo: ticketNo,
        password: password,
      });
      if (result?.error) {
        setError('Invalid credentials. Please try again.');
        setIsLoading(false);
      } else if (result?.ok) {
        router.push('/');
        router.refresh();
        closeModal();
      }
    } catch (error) {
      setError('An unexpected error occurred.');
      setIsLoading(false);
    }
  };
  
  const handleClose = () => {
    if (isLoading) return;
    closeModal();
  };

  return (
    <AnimatePresence>
      {isModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative w-full max-w-sm rounded-lg bg-white shadow-2xl overflow-hidden min-h-[370px] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={handleClose} className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-800 transition-colors z-20">
              <X size={24} />
            </button>
            <AnimatePresence mode="wait">
              {step === 1 ? (
                <StepOne 
                  ticketNo={ticketNo}
                  setTicketNo={setTicketNo}
                  onNext={handleNext}
                  error={error}
                />
              ) : (
                <StepTwo
                  ticketNo={ticketNo}
                  password={password}
                  setPassword={setPassword}
                  onSubmit={handleSubmit}
                  error={error}
                  isLoading={isLoading}
                  onBack={handleBack} 
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
// src/components/Header.tsx
'use client';

import React from 'react';
import Image from 'next/image';
import { Search, LogIn, LogOut } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import { useModal } from '@/context/ModalContext';

const Header: React.FC = () => {
  const { data: session, status } = useSession();
  const { openModal } = useModal();

  return (
    // The new classes have been added here
    <header className="w-full min-[1500px]:w-[80%] min-[1800px]:w-[72%] mx-auto bg-neutral-50 text-neutral-800 flex items-center justify-between px-4 sm:px-8 py-3 shadow-sm border-b border-neutral-200 sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <Image
          src="/logo.svg"
          alt="SAIL Logo"
          width={822}
          height={861}
          className="h-12 w-auto"
          priority
        />
        <div>
          <h1 className="text-base font-bold font-heading text-primary-800">
            Durgapur Steel Plant
          </h1>
          <p className="text-xs text-neutral-600">
            स्टील अथॉरिटी ऑफ इंडिया लिमिटेड
          </p>
        </div>
      </div>

      <div className="relative flex-grow mx-6 sm:mx-10 max-w-lg">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 h-5 w-5" />
        <input
          type="text"
          placeholder="Search for links, circulars, or people..."
          className="w-full pl-12 pr-4 py-2.5 rounded-full border border-neutral-400 bg-neutral-100 focus:outline-none focus:border-2 focus:border-neutral-600 transition-colors duration-300"
        />
      </div>

      <div>
        {status === 'authenticated' ? (
          <div className="flex items-center gap-4">
            {session.user?.image && (
              <Image
                src={session.user.image}
                alt={session.user.name || 'User Avatar'}
                width={40}
                height={40}
                className="rounded-full"
              />
            )}
            <button
              onClick={() => signOut()}
              className="flex items-center gap-2 bg-neutral-200 text-neutral-800 font-semibold py-2 px-4 rounded-full hover:bg-neutral-300 transition-colors"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        ) : (
          <motion.button
            onClick={openModal}
            className="relative inline-flex items-center gap-2 overflow-hidden rounded-full py-2 px-4 font-semibold text-xl text-primary-500 focus:outline-none"
            whileHover="hover"
            transition={{ duration: 1.2, ease: "circOut" }}
          >
            <motion.div
              className="absolute inset-0 bg-[url(/aurora.svg)] bg-[length:400%_400%]"
              variants={{
                hover: {
                  backgroundPosition: "100% 100%",
                  scale: 1.2
                }
              }}
            />
            <span className="relative z-10 flex items-center gap-2">
              <LogIn size={18} />
              <span className="hidden sm:inline">Login</span>
            </span>
          </motion.button>
        )}
      </div>
    </header>
  );
};

export default Header;
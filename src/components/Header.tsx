'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, LogIn, LogOut, Shield, Undo2 } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useModal } from '@/context/ModalContext';

const Header: React.FC = () => {
  const { data: session, status } = useSession();
  const { openModal } = useModal();
  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="w-full bg-neutral-50 text-neutral-800 flex items-center justify-between px-4 sm:px-8 py-3 shadow-sm border-b border-neutral-200 sticky top-0 z-50">
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

      <div className="relative flex-grow mx-4 sm:mx-8 max-w-lg">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 h-5 w-5" />
        <input
          type="text"
          placeholder="Search for links, circulars, or people..."
          className="w-full pl-12 pr-4 py-2.5 rounded-full border border-neutral-400 bg-neutral-100 focus:outline-none focus:border-2 focus:border-neutral-600 transition-colors duration-300"
        />
      </div>

      <div className="relative">
        {status === 'authenticated' ? (
          <div ref={dropdownRef}>
            <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="flex items-center gap-4 focus:outline-none">
              <span className="hidden sm:inline font-semibold text-right text-neutral-700">{session.user.name}</span>

              <div className="relative w-10 h-10">
                {session.user.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name || 'User Avatar'}
                    fill
                    className="rounded-full ring-2 ring-offset-2 ring-primary-600 aspect-square object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full ring-2 ring-offset-2 ring-primary-600 bg-primary-700 flex items-center justify-center">
                    <span className="font-bold text-white text-lg">
                      {session.user.name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U'}
                    </span>
                  </div>
                )}
              </div>

            </button>

            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-2xl border border-neutral-200/50 p-2 z-20"
                >
                  <div className="p-2 border-b border-neutral-200">
                    <p className="font-bold text-neutral-800">{session.user.name}</p>
                    <p className="text-sm text-neutral-500">{session.user.email}</p>
                  </div>
                  <nav className="mt-2 flex flex-col space-y-1">
                    {pathname !== '/' && (
                      <Link
                        href="/"
                        className="flex items-center gap-3 p-2 rounded-md text-neutral-600 font-medium hover:bg-neutral-100 transition-colors"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <Undo2 size={18} />
                        <span>Home</span>
                      </Link>
                    )}

                    {session.user.role === 'admin' && pathname !== '/admin' && (
                      <Link
                        href="/admin"
                        className="flex items-center gap-3 p-2 rounded-md font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <Shield size={18} />
                        <span>Admin Dashboard</span>
                      </Link>
                    )}
                    <button
                      onClick={() => signOut()}
                      className="w-full flex items-center gap-3 p-2 rounded-md text-neutral-600 font-medium hover:bg-neutral-100 transition-colors"
                    >
                      <LogOut size={18} />
                      <span>Logout</span>
                    </button>
                  </nav>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <motion.button
            onClick={openModal}
            className="relative inline-flex items-center gap-2 overflow-hidden rounded-full py-2 px-4 font-semibold text-xl text-primary-800 focus:outline-none"
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
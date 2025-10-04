'use client';

import React from 'react';
import Image from 'next/image';
import { Search, LogIn, LogOut } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';

const Header: React.FC = () => {
  const { data: session } = useSession();

  return (
    <header className="w-full bg-white text-gray-800 flex items-center justify-between px-4 sm:px-8 py-3 shadow-sm border-b sticky top-0 z-50">
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
          <h1 className="text-base font-bold text-blue-800">
            Durgapur Steel Plant
          </h1>
          <p className="text-xs text-gray-600">
            स्टील अथॉरिटी ऑफ इंडिया लिमिटेड
          </p>
        </div>
      </div>

      <div className="relative flex-grow mx-4 sm:mx-8 max-w-lg">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
        <input
          type="text"
          placeholder="Search for links, circulars, or people..."
          className="w-full pl-12 pr-4 py-2.5 rounded-full border border-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 transition-all duration-300"
        />
      </div>

      <div>
        {session ? (
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
              className="flex items-center gap-2 bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-full hover:bg-gray-300 transition-colors"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn('github')}
            className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-2 px-5 rounded-full shadow-lg transform transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-xl hover:shadow-cyan-500/50 active:scale-95"
          >
            <LogIn size={18} />
            <span className="hidden sm:inline">Login</span>
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
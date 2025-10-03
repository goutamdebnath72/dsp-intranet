import React from 'react';
import Image from 'next/image'; // Import the Next.js Image component
import { Search, LogIn } from 'lucide-react';
import SearchBar from './SearchBar'; // Import our new SearchBar

const Header: React.FC = () => {
  return (
    <header className="
      w-full h-20 bg-white text-gray-800 
      flex items-center justify-between 
      px-4 sm:px-8 shadow-md border-b
    ">
      {/* Left side: Logo and Title */}
      <div className="flex items-center gap-3">
        <Image
          src="/logo.svg" 
          alt="SAIL Logo"          
          width={345}
          height={360}
          className="h-14 w-auto"
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

      {/* Middle: Search Bar */}
      <div className="hidden lg:flex flex-grow justify-center px-8">
        <SearchBar />
      </div>

      {/* Right side: Login Button */}
      <div>
        <button
          className="
            flex items-center gap-2
            bg-gradient-to-r from-cyan-500 to-blue-500 
            text-white font-semibold 
            py-2 px-5 rounded-full 
            shadow-lg
            transform transition-all duration-300 ease-in-out
            hover:scale-105 hover:shadow-xl hover:shadow-cyan-500/50
            active:scale-95
          "
        >
          <LogIn size={18} />
          <span className="hidden sm:inline">Login</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
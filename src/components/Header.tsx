import React from 'react';
import { LogIn } from 'lucide-react'; // 1. Import the icon we want

const Header: React.FC = () => {
  return (
    <header className="w-full h-16 bg-blue-800 text-white flex items-center justify-between px-8 shadow-md">
      {/* Left side: Logo and Title */}
      <div className="flex items-center">
        <h1 className="text-xl font-bold">Durgapur Steel Plant Intranet</h1>
      </div>

      {/* Right side: The new "Wow Factor" Login Button */}
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
          <LogIn size={18} /> {/* 2. Add the icon to the button */}
          <span>Login</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
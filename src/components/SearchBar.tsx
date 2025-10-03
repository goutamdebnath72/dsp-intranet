"use client"; // This directive is needed because we're using a React Hook (useState)

import React, { useState } from "react";
import { Search } from "lucide-react";

const SearchBar: React.FC = () => {
    // We use 'useState' to keep track of what the user is typing.
    const [query, setQuery] = useState("");

    return (
        <div className="relative w-full max-w-lg">
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for links, circulars, or people..."
                className="
  w-full pl-10 pr-4 py-2 
  border border-slate-400 rounded-full 
  text-gray-900 
  bg-gray-50 
  focus:outline-none focus:ring-2 focus:ring-blue-500
"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <Search className="h-5 w-5 text-gray-400" />
            </div>
        </div>
    );
};

export default SearchBar;

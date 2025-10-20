// src/components/NewHero.tsx

import React from "react";

export function NewHero() {
  return (
    // This is the main hero container
    <div
      className="w-full h-[450px] rounded-lg shadow-lg relative overflow-hidden
                 bg-cover bg-center text-white"
      // Apply the background image from your public folder
      style={{ backgroundImage: "url('/background-image.png')" }}
    >
      {/* Add a dark overlay for better text contrast */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Content wrapper */}
      <div className="relative z-10 p-12 h-full flex flex-col justify-center">
        <h1 className="font-black text-5xl tracking-tight">
          Welcome to the DSP Intranet
        </h1>
        <p className="mt-4 text-xl max-w-lg">
          Your central hub for tools, announcements, and resources.
        </p>
      </div>
    </div>
  );
}

// src/components/PersonBadges.tsx
//
// The small badges after a person's name on a card (step 47b): EXE (an executive, as before) and PhD (a non-medical employee on the manual list of employees/honorific.ts).
// A doctor has no PhD badge: the "Dr." before the name and the designation under it already say it. The PhD badge is a badge and not text added to the name, so the name stays clean
// for Copy, the table, the CSV and the sort order.

import React from "react";

export function PersonBadges({ isExecutive, phd }: { isExecutive?: boolean; phd?: boolean }) {
  return (
    <>
      {isExecutive && (
        <span className="ml-2 align-middle rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
          EXE
        </span>
      )}
      {phd && (
        <span title="Holds a PhD" className="ml-1.5 align-middle rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
          PhD
        </span>
      )}
    </>
  );
}

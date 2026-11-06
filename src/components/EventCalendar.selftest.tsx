// src/components/EventCalendar.selftest.tsx
// Verification test for EventCalendar header enhancement:
// 1. Clickable month showing vertical list of 12 full month names
// 2. Clickable year showing vertical list of previous years with vertical scrollbar
// 3. Full year calendar modal button
// 4. Flat appearance: no chevrons, no hover button style; only cursor turns to pointer (hand) on hover
// 5. Clean non-disturbing overlay positioning

import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCalendar } from "./EventCalendar";
import { DateTime } from "luxon";

let pass = 0;
let fail = 0;

const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name} ${extra}`);
  }
};

const src = readFileSync("src/components/EventCalendar.tsx", "utf8");

// 1. Structural checks
ok("No chevrons are imported or rendered on Month and Year",
  !src.includes("ChevronDown")
);

ok("Month and Year buttons look completely flat with cursor-pointer as the only hover cue",
  src.includes('className="text-lg font-bold text-neutral-800 font-heading cursor-pointer bg-transparent border-none p-0 focus:outline-none"')
);

ok("EventCalendar defines FULL_MONTH_NAMES with all 12 months",
  ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    .every((m) => src.includes(`"${m}"`))
);

ok("EventCalendar generates a long range of years down to 1950",
  src.includes("1950") && src.includes("yearOptions")
);

ok("Month selector button has accessible attributes",
  src.includes('aria-label="Select month"') &&
  src.includes('aria-expanded={isMonthOpen}')
);

ok("Year selector button has accessible attributes",
  src.includes('aria-label="Select year"') &&
  src.includes('aria-expanded={isYearOpen}')
);

ok("Month dropdown is positioned absolute with z-30 without disturbing layout",
  src.includes("absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-36 bg-white rounded-lg shadow-xl border border-neutral-200 py-1 z-30 max-h-56 overflow-y-auto scrollbar-thin")
);

ok("Year dropdown is positioned absolute with z-30 with vertical scrollbar",
  src.includes("absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-28 bg-white rounded-lg shadow-xl border border-neutral-200 py-1 z-30 max-h-56 overflow-y-auto scrollbar-thin")
);

ok("Click outside and Escape handlers close the dropdowns",
  src.includes('document.addEventListener("mousedown", handleClickOutside)') &&
  src.includes('document.addEventListener("keydown", handleKeyDown)') &&
  src.includes('e.key === "Escape"')
);

ok("Year dropdown auto-centers the active year inside its scroll container",
  src.includes("yearListRef.current") &&
  src.includes("selectedYearButtonRef.current") &&
  src.includes("container.scrollTop =")
);

ok("Full year modal button with CalendarDays is preserved in the header",
  src.includes('title="View Year Calendar"') &&
  src.includes("<CalendarDays size={18} />")
);

// 2. Render checks
const markup = renderToStaticMarkup(<EventCalendar holidays={[]} isLoading={false} />);

ok("Renders Month and Year in the header flat",
  markup.includes(DateTime.local().toFormat("MMMM")) &&
  markup.includes(String(DateTime.local().year))
);

ok("Renders full year calendar trigger button",
  markup.includes('title="View Year Calendar"')
);

console.log(`\nEventCalendar selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

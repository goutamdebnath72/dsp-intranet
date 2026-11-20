// src/tools/pf/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the provident fund page: its tile and its page, which has two tabs (PF maturity, PF loan EMI).
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { PiggyBank } from "lucide-react";
import { PfPage, startTabFor } from "./PfPage";
import { type TopicUi } from "@/tools/uiTypes";

/** THE WIDTH OF THE PF PAGE'S BOX, in rem (it follows the text size and the zoom) and never more than the page: the one number to change to make the page narrower or wider, in small steps (4 rem is about 64 px) */
export const PF_BOX_REM = 72;

export const pfUi: TopicUi = {
  id: "pf",
  form: {
    title: "Provident fund (PF)",
    tone: "emerald",
    wide: { maxRem: PF_BOX_REM }, // wider than the normal box, for three boxes in a row and a table of years, but not the whole page
    icon: <PiggyBank size={18} />,
    menu: { title: "Provident fund (PF)", text: "Your PF on the day you retire, and the EMI of a refundable PF loan" },
    // opened from a line about the loan ("pf loan emi") it starts on the loan tab; from the list of calculators, on the maturity tab
    render: (c) => <PfPage start={startTabFor(c.query)} />,
  },
};

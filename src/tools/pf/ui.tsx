// src/tools/pf/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the probable PF maturity calculator: its tile and its page.
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { PiggyBank } from "lucide-react";
import { PfForm } from "./PfForm";
import { type TopicUi } from "@/tools/uiTypes";

/** THE WIDTH OF THE PF PAGE'S BOX, in rem (it follows the text size and the zoom) and never more than the page: the one number to change to make the page narrower or wider, in small steps (4 rem is about 64 px) */
export const PF_BOX_REM = 72;

export const pfUi: TopicUi = {
  id: "pf",
  form: {
    title: "Probable PF at superannuation",
    tone: "emerald",
    wide: { maxRem: PF_BOX_REM }, // wider than the normal box, for three boxes in a row and a table of years, but not the whole page
    icon: <PiggyBank size={18} />,
    menu: { title: "PF maturity", text: "Your PF on the day you retire, from your DSP PF page" },
    render: () => <PfForm />,
  },
};

// src/tools/pf/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the probable PF maturity calculator: its tile and its page.
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { PiggyBank } from "lucide-react";
import { PfForm } from "./PfForm";
import { type TopicUi } from "@/tools/uiTypes";

export const pfUi: TopicUi = {
  id: "pf",
  form: {
    title: "Probable PF maturity calculator",
    tone: "emerald",
    icon: <PiggyBank size={18} />,
    menu: { title: "PF maturity", text: "What your provident fund may grow to" },
    render: () => <PfForm />,
  },
};

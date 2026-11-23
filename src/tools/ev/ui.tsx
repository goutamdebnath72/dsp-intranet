// src/tools/ev/ui.tsx
//
// This is how this topic looks in the panel of the search bar: the electric car charging-time estimate, its tile and its page.
// Its logic is in the files beside this one, and what the search line needs to know is in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { BatteryCharging } from "lucide-react";
import { EvForm } from "./EvForm";
import { type TopicUi } from "@/tools/uiTypes";

export const evUi: TopicUi = {
  id: "ev",
  form: {
    title: "Electric car charging time",
    tone: "emerald",
    icon: <BatteryCharging size={18} />,
    menu: { title: "Electric car charging", text: "Time and cost of a charge, 10% to 90%; battery and charger words" },
    render: () => <EvForm />,
  },
};

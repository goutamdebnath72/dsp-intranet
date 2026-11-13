// src/tools/ev/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the electric car charging-time estimate: its tile and its page.
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
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
    menu: { title: "Electric car charging", text: "Battery and charger words; time from 10% to 90%" },
    render: () => <EvForm />,
  },
};

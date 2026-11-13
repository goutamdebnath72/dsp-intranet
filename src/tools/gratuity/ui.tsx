// src/tools/gratuity/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the gratuity calculator: its tile and its page.
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { Gift } from "lucide-react";
import { GratuityForm } from "./GratuityForm";
import { type TopicUi } from "@/tools/uiTypes";

export const gratuityUi: TopicUi = {
  id: "gratuity",
  form: {
    title: "Gratuity calculator",
    tone: "violet",
    icon: <Gift size={18} />,
    menu: { title: "Gratuity", text: "From last pay and years of service" },
    render: () => <GratuityForm />,
  },
};

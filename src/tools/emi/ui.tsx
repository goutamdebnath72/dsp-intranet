// src/tools/emi/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the loan EMI calculator: its tile and its page.
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { Landmark } from "lucide-react";
import { EmiForm } from "./EmiForm";
import { type TopicUi } from "@/tools/uiTypes";

export const emiUi: TopicUi = {
  id: "emi",
  form: {
    title: "Loan EMI calculator",
    tone: "sky",
    icon: <Landmark size={18} />,
    menu: { title: "Loan EMI", text: "Bank, PF and co-operative society loans" },
    render: () => <EmiForm />,
  },
};

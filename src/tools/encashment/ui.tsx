// src/tools/encashment/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the leave encashment calculator: its tile and its page.
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { Wallet } from "lucide-react";
import { EncashmentForm } from "./EncashmentForm";
import { type TopicUi } from "@/tools/uiTypes";

export const encashmentUi: TopicUi = {
  id: "encashment",
  form: {
    title: "Leave encashment calculator",
    tone: "amber",
    icon: <Wallet size={18} />,
    menu: { title: "Leave encashment", text: "EL / HPL encashment" },
    render: () => <EncashmentForm />,
  },
};

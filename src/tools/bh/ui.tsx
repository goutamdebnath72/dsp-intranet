// src/tools/bh/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the Bharat (BH) series guide: its tile, its page and the card for a typed BH number.
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { Route } from "lucide-react";
import { BhCard } from "./BhCard";
import { ToolShell } from "@/components/tools/toolKit";
import { onHit, type TopicUi } from "@/tools/uiTypes";

export const bhUi: TopicUi = {
  id: "bh",
  form: {
    title: "Bharat (BH) series number plate guide",
    tone: "emerald",
    icon: <Route size={18} />,
    menu: { title: "Bharat (BH) series number plate", text: "The all-India vehicle number: who can have it, how to apply, the road tax" },
    render: () => <BhCard start="26 BH 1234 AA" />,
  },
  hits: [
    onHit("bh", (hit) => (
      <ToolShell title="How to read a BH-series number" subtitle="Appears as you type" tone="emerald" icon={<Route size={20} />} instant>
        <BhCard key={hit.text} start={hit.text} />
      </ToolShell>
    )),
  ],
};

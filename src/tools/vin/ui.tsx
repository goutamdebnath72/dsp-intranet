// src/tools/vin/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the VIN reader: its tile, its page and the card for a typed VIN.
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { Car } from "lucide-react";
import { VinCard } from "./VinCard";
import { ToolShell } from "@/components/tools/toolKit";
import { onHit, type TopicUi } from "@/tools/uiTypes";

export const vinUi: TopicUi = {
  id: "vin",
  form: {
    title: "Vehicle identification number (VIN) reader",
    tone: "amber",
    icon: <Car size={18} />,
    menu: { title: "Vehicle number (VIN) reader", text: "What the 17 characters of a VIN mean, and its full forms" },
    render: () => <VinCard start="MALBM51BLKM000001" />,
  },
  hits: [
    onHit("vin", (hit) => (
      <ToolShell title="How to read a VIN" subtitle="Appears as you type" tone="amber" icon={<Car size={20} />} instant>
        <VinCard key={hit.text} start={hit.text} />
      </ToolShell>
    )),
  ],
};

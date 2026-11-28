// src/tools/vin/ui.tsx
//
// How this topic looks in the panel of the search bar: the VIN reader, with its tile, its page and the card for a typed VIN.
// Its logic is in the files beside this one, and what the search line needs to know is in topic.ts. I list it once, in src/tools/registry.ui.tsx.
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
    // No foot notice at all (owner, 28 Nov 2026: "Nothing you type here is saved anywhere" under the VIN window is irrelevant): a VIN is read from a code, nothing is estimated and nothing private is typed.
    notice: false,
    render: () => <VinCard start="MALBM51BLKM000001" />,
  },
  hits: [
    onHit("vin", (hit) => (
      <ToolShell title="How to read a VIN" subtitle="Appears as you type" tone="amber" icon={<Car size={20} />} instant notice={false}>
        <VinCard key={hit.text} start={hit.text} />
      </ToolShell>
    )),
  ],
};

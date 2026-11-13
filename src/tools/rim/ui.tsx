// src/tools/rim/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the card for a typed wheel (rim) marking such as 8Jx20. The rim guide also sits under the tyre reader (tyre/TyreCard.tsx).
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { Disc3 } from "lucide-react";
import { RimGuide } from "./RimGuide";
import { ToolShell } from "@/components/tools/toolKit";
import { onHit, type TopicUi } from "@/tools/uiTypes";

export const rimUi: TopicUi = {
  id: "rim",
  hits: [
    onHit("rim", (hit) => (
      <ToolShell title="How to read a wheel (rim) marking" subtitle="Appears as you type" tone="emerald" icon={<Disc3 size={20} />} instant>
        <RimGuide key={hit.text} start={hit.text} standalone />
      </ToolShell>
    )),
  ],
};

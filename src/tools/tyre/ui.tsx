// src/tools/tyre/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the tyre and rim size reader: its tile, its page and the card for a typed tyre size.
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { Disc3 } from "lucide-react";
import { TyreCard } from "./TyreCard";
import { ToolShell } from "@/components/tools/toolKit";
import { onHit, type TopicUi } from "@/tools/uiTypes";

export const tyreUi: TopicUi = {
  id: "tyre",
  form: {
    title: "Tyre and rim size reader",
    tone: "rose",
    icon: <Disc3 size={18} />,
    menu: { title: "Tyre and rim size reader", text: "What a tyre size like 205/55 R16 91V and a wheel marking like 8Jx20 mean, part by part" },
    render: () => <TyreCard start="205/55 R16 91V" />,
  },
  hits: [
    onHit("tyre", (hit) => (
      <ToolShell title="How to read a tyre size and its rim" subtitle="Appears as you type" tone="rose" icon={<Disc3 size={20} />} instant>
        <TyreCard key={hit.text} start={hit.text} />
      </ToolShell>
    )),
  ],
};

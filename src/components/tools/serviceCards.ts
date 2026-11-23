// src/components/tools/serviceCards.ts
//
// The cards of the utility services page, worked out from the registry (src/tools/registry.ts and registry.ui.tsx), never written by hand: every topic that has a page of its own (a calculator or reader) or a live
// card (prices, news, weather, trains, the guides) is one card, sorted A to Z. A new topic added to the registry appears here by itself, and this file names no topic.
// Title and sentence: a calculator or reader uses its tile in the list of calculators (so the two lists agree word for word); a live card uses its topic's own name and sentence (topic.ts `intent`).
// "Type": a short sample question of the topic (pickType), which the registry's test proves the topic answers.
import type React from "react";
import { TOPICS } from "@/tools/registry";
import { TOPIC_UIS } from "@/tools/registry.ui";
import type { TopicLogic } from "@/tools/types";
import type { TopicUi } from "@/tools/uiTypes";
import type { Tone } from "./toolKit";

export const GROUP_FORMS = "Calculators & readers";
export const GROUP_INFO = "Information & guides";
export type ServiceGroup = typeof GROUP_FORMS | typeof GROUP_INFO;

export interface ServiceCard {
  id: string;
  title: string;
  text: string;
  tone: Tone;
  icon: React.ReactNode;
  /** A calculator or reader opens its own page; a live card opens in place. */
  kind: "form" | "live";
  group: ServiceGroup;
  /** The words that open it from the search bar. */
  type: string;
}

/** The words shown on a card: I take the topic's first sample question that is short enough to read at a glance (5 to 24 characters), else its first ("durgapur weather report with forecast" gives way to "weather"). */
export function pickType(samples: readonly { q: string }[] | undefined, fallback: string): string {
  const qs = (samples ?? []).map((s) => s.q).filter(Boolean);
  return qs.find((q) => q.length >= 5 && q.length <= 24) ?? qs[0] ?? fallback;
}

const byTitle = (a: ServiceCard, b: ServiceCard) => a.title.localeCompare(b.title, "en", { sensitivity: "base", numeric: true }) || a.id.localeCompare(b.id);

export function buildServiceCards(topics: readonly TopicLogic[] = TOPICS as readonly TopicLogic[], uis: readonly TopicUi[] = TOPIC_UIS): ServiceCard[] {
  const out: ServiceCard[] = [];
  for (const t of topics) {
    const ui = uis.find((u) => u.id === t.id);
    const form = ui?.form;
    const live = ui?.live;
    if (form) {
      out.push({ id: t.id, title: form.menu.title, text: form.menu.text, tone: form.tone, icon: form.icon, kind: "form", group: GROUP_FORMS, type: pickType(t.samples, form.menu.title.toLowerCase()) });
    } else if (live) {
      out.push({ id: t.id, title: t.intent?.title ?? live.title, text: t.intent?.about ?? live.subtitle, tone: live.tone, icon: live.icon, kind: "live", group: GROUP_INFO, type: pickType(t.samples, live.title.toLowerCase()) });
    }
  }
  return out.sort(byTitle);
}

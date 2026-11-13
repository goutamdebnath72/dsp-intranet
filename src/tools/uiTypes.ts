// src/tools/uiTypes.ts
//
// THE PANEL SIDE OF THE CONTRACT OF A TOPIC (the logic side is in types.ts): how a topic looks in the tools panel of the search bar. A topic's ui.tsx says it once; src/components/tools/ToolPanel.tsx
// only walks the list in registry.ui.tsx.
import type React from "react";
import type { Rates } from "@/tools/converter/currency";
import type { FormKind, ToolHit } from "@/lib/tools/detect";
import type { Tone } from "@/components/tools/toolKit";

export type RatesState = "idle" | "loading" | "ok" | "error";

/** What the panel hands to a topic when it draws it */
export interface UiCtx {
  /** the public exchange-rate table, once downloaded (only a currency question asks for it) */
  rates: Rates | null;
  ratesState: RatesState;
  /** opens a form (or the list of calculators), or closes it with null */
  openForm: (f: FormKind | "menu" | null) => void;
}

/** A calculator or reader that has its own page, opened from the list of calculators or with Enter */
export interface FormUi {
  title: string;
  tone: Tone;
  /** the icon of its tile and of its page (size 18 in the tile) */
  icon: React.ReactNode;
  /** its tile in the list of calculators */
  menu: { title: string; text: string };
  /** the page says that the public exchange-rate table is downloaded */
  rates?: boolean;
  render: (c: UiCtx) => React.ReactNode;
}

/** The card for one kind of typed line, drawn as you type */
export interface HitUi {
  kind: ToolHit["kind"];
  render: (hit: ToolHit, c: UiCtx) => React.ReactNode;
}

/** The card of a live-data topic (gold, markets, fuel, news, sports) */
export interface LiveUi {
  title: string;
  subtitle: string;
  tone: Tone;
  icon: React.ReactNode;
  card: (lang?: string) => React.ReactNode;
}

export interface TopicUi {
  id: string;
  form?: FormUi;
  hits?: readonly HitUi[];
  live?: LiveUi;
  /** true when this topic needs the exchange-rate table for what is typed or opened */
  needsRates?: (hit: ToolHit | null, form: FormKind | "menu" | null) => boolean;
}

/** Declares a hit card for one kind and gives its render the exact type of that hit */
export function onHit<K extends ToolHit["kind"]>(kind: K, render: (hit: Extract<ToolHit, { kind: K }>, c: UiCtx) => React.ReactNode): HitUi {
  return { kind, render: (hit, c) => render(hit as Extract<ToolHit, { kind: K }>, c) };
}

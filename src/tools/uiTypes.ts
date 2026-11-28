// src/tools/uiTypes.ts
//
// THE PANEL SIDE OF THE CONTRACT OF A TOPIC (the logic side is in types.ts): how a topic looks in the tools panel of the search bar. A topic's ui.tsx says it once, and I keep src/components/tools/ToolPanel.tsx
// walking only the list in registry.ui.tsx.
import type React from "react";
import type { Rates } from "@/tools/converter/currency";
import type { FormKind, ToolHit } from "@/lib/tools/detect";
import type { Tone } from "@/components/tools/toolKit";
import type { Notice } from "@/components/tools/toolAtoms";

export type RatesState = "idle" | "loading" | "ok" | "error";

/** What the panel hands to a topic when it draws it */
export interface UiCtx {
  /** The public exchange-rate table, once downloaded (only a currency question asks for it) */
  rates: Rates | null;
  ratesState: RatesState;
  /** Opens a form (or the list of calculators), or closes it with null */
  openForm: (f: FormKind | "menu" | "services" | null) => void;
  /** The line typed in the search bar when the form was opened (a page with tabs may start on the tab the line is about: "pf loan emi") */
  query?: string;
}

/** A calculator or reader that has its own page, opened from the list of calculators or with Enter */
export interface FormUi {
  title: string;
  tone: Tone;
  /** The icon of its tile and of its page (size 18 in the tile) */
  icon: React.ReactNode;
  /** Its tile in the list of calculators */
  menu: { title: string; text: string };
  /** The page says that the public exchange-rate table is downloaded */
  rates?: boolean;
  /** The two lines at the foot of the page, each said only where it means something (toolAtoms.tsx, Notice): `{ typing }`, `{ estimate }`, `false` for neither; both when not said. */
  notice?: Notice;
  /** For a page that needs a WIDE box of the search bar I offer two settings: `true` = as wide as the page behind it (the width an answer with a table of 4 or more columns gets); `{ maxRem }` = that wide but never more than maxRem (a width that follows the text size and the zoom), and never wider than the page. Read by toolWidth.ts */
  wide?: boolean | { maxRem: number };
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
  /** The two lines at the foot of the card, each said only where it means something (toolAtoms.tsx, Notice): `{ typing }` for a card where the reader types something of their own, `{ estimate }` for a card of forecasts, rates or estimates, `false` for neither (headlines, a directory, a story); both when not said */
  notice?: Notice;
}

export interface TopicUi {
  id: string;
  form?: FormUi;
  hits?: readonly HitUi[];
  live?: LiveUi;
  /** True when this topic needs the exchange-rate table for what is typed or opened */
  needsRates?: (hit: ToolHit | null, form: FormKind | "menu" | "services" | null) => boolean;
}

/** I use this to declare a hit card for one kind; it gives the render the exact type of that hit */
export function onHit<K extends ToolHit["kind"]>(kind: K, render: (hit: Extract<ToolHit, { kind: K }>, c: UiCtx) => React.ReactNode): HitUi {
  return { kind, render: (hit, c) => render(hit as Extract<ToolHit, { kind: K }>, c) };
}

// src/tools/types.ts
//
// THE CONTRACT OF A TOPIC. Every subject the search bar knows about (a calculator, a converter, the tyre reader, the VIN reader, the BH-series guide, a live-data card) is ONE folder in src/tools/<topic>/:
//
//     <topic>.ts          the pure logic (a calculation, a reading, a table), with its own selftest
//     <Something>.tsx     its cards and forms (React)
//     topic.ts            WHAT THE SEARCH LINE NEEDS TO KNOW (pure, no React): the words that ask for it, the lines it answers as you type, its sample questions
//     ui.tsx              HOW IT LOOKS IN THE PANEL (React): its tile in the calculators list, its form, its card
//
// and ONE line in src/tools/registry.ts (and one in registry.ui.tsx). My rule: nothing else names a topic. src/lib/tools/detect.ts, src/components/tools/ToolPanel.tsx and the sample-question guide only walk the
// registry, and src/tools/registry.selftest.ts keeps it that way. This file is the logic side of the contract; the panel side is in uiTypes.ts.
import type { DateTime } from "luxon";
import type { SampleQuestion } from "@/lib/help/sampleQuestions";

/** What a form request is checked with: the words of the line, and helpers bound to this topic. */
export interface FormCtx {
  /** The words of the line, lower case, without punctuation */
  w: string[];
  /** True when any word of the line is in the set */
  has: (set: string[]) => boolean;
  /** True when EVERY word is a noun of this topic or a filler ("calculator", "the", "for"), so that "ev policy circular" stays an ordinary search */
  only: () => boolean;
  /** True when the line has a word like calculator, estimate, compute */
  calcWord: boolean;
}

/** A typed line that is this topic's own data (a tyre size, a VIN, a sum), which I answer as you type. `kind` names the card; the rest is what the card needs. */
export interface HitRule {
  /** The order in which topics try the line (lower first); see RANKS in detect.ts */
  rank: number;
  detect: (q: string, now?: DateTime) => { kind: string } | null;
}

/** The words of a live-data card ("gold rate today"): I count a line as the card's when it has a key word and every word is a key word, an extra word or a filler. */
export interface LiveRule {
  keys: string[];
  /** Multi-word names that count as key words and are read as ONE word ("dainik bhaskar"). I need this so that a part of a name that is also a person's name ("bhaskar") never opens the card alone. */
  phrases?: string[];
  extra: string[];
  /** For the news: the tab or language the line asked for (the topic's own words; its card reads it) */
  lang?: (w: string[]) => string | undefined;
}

/** What the topic is, in plain words, for finding it from a line that uses none of its keywords: its name, one sentence about it (read by the AI that is asked what a user means, and shown), and the words and near-words people use for it. */
export interface IntentInfo {
  title: string;
  about: string;
  words: string[];
}

export interface TopicLogic {
  /** The name of the form (opened with Enter), of the live card, or of the reader */
  id: string;
  /** A plain-words request for this topic's form, opened with Enter */
  form?: { rank: number; nouns: string[]; wants: (c: FormCtx) => boolean };
  /** Lines I answer as you type */
  hits?: readonly HitRule[];
  /** a live-data card */
  live?: LiveRule;
  /** What the topic is, for finding it from any line (src/lib/tools/intent.ts) */
  intent?: IntentInfo;
  /** Questions for the user guide ("Calculators and converters"); each must really be answered by this topic */
  samples?: readonly SampleQuestion[];
}

/** I use this to declare a topic and keep its exact types, so that the kinds of its hits and its id reach ToolHit and FormKind without being written anywhere else. */
export function defineTopic<const T extends TopicLogic>(t: T): T {
  return t;
}

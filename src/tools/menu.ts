// src/tools/menu.ts
//
// THE LIST OF CALCULATORS has no topic of its own: it is the page that lists them all. These are its words and its sample question.
import type { SampleQuestion } from "@/lib/help/sampleQuestions";

/** a request for the list: "calculators", "all tools", "calculator menu" */
export const MENU_WORDS = ["calculator", "calculators", "calc", "tools", "tool", "all", "menu", "list", "of", "available", "utilities", "the", "online"];
export const MENU_KEYS = ["calculator", "calculators", "calc", "tools", "tool", "utilities"];
export const MENU_RANK = 15;

export const MENU_SAMPLES: readonly SampleQuestion[] = [
    { q: "calculators", note: "the menu of all of them" },
];

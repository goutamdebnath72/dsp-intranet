// src/tools/services.ts
//
// THE PAGE OF ALL THE UTILITY SERVICES has no topic of its own, like the list of calculators (menu.ts): it is the page that lists every topic of the registry, A to Z (src/components/tools/UtilityServicesPage.tsx).
// These are its words and its sample question. A line opens it when EVERY word is one of SERVICES_WORDS and at least one is a key: "utility services", "utilities", "all utilities", "list of utilities".
// I changed "utilities" to open this page, which has the calculators in it; it used to open the list of calculators (menu.ts).
import type { SampleQuestion } from "@/lib/help/sampleQuestions";

export const SERVICES_WORDS = ["utility", "utilities", "service", "services", "all", "list", "of", "available", "the", "menu", "our", "online", "every", "a", "to", "z"];
export const SERVICES_KEYS = ["utility", "utilities"];
export const SERVICES_RANK = 14;

export const SERVICES_SAMPLES: readonly SampleQuestion[] = [
  { q: "utility services", note: "the page of every service, A to Z" },
];

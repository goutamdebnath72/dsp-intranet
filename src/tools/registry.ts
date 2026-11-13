// src/tools/registry.ts
//
// THE LIST OF TOPICS (logic side). One line for each subject the search bar knows. Adding a topic = a folder in src/tools/<topic>/ (see types.ts) + one line here + one line in registry.ui.tsx.
// The ORDER here is the order of the user guide's sample questions and of the tiles in the list of calculators (registry.ui.tsx follows it); the order in which a typed line is tried is set
// by each topic's `rank`, not by this list. Nothing outside this folder names a topic: detect.ts, ToolPanel.tsx and sampleQuestions.ts only walk this list.
import { calcTopic } from "@/tools/calculator/topic";
import { emiTopic } from "@/tools/emi/topic";
import { pfTopic } from "@/tools/pf/topic";
import { gratuityTopic } from "@/tools/gratuity/topic";
import { encashmentTopic } from "@/tools/encashment/topic";
import { datesTopic } from "@/tools/dates/topic";
import { converterTopic } from "@/tools/converter/topic";
import { tyreTopic } from "@/tools/tyre/topic";
import { rimTopic } from "@/tools/rim/topic";
import { evTopic } from "@/tools/ev/topic";
import { vinTopic } from "@/tools/vin/topic";
import { bhTopic } from "@/tools/bh/topic";
import { goldTopic } from "@/tools/gold/topic";
import { marketsTopic } from "@/tools/markets/topic";
import { fuelTopic } from "@/tools/fuel/topic";
import { newsTopic } from "@/tools/news/topic";
import { sportsTopic } from "@/tools/sports/topic";
import { weatherTopic } from "@/tools/weather/topic";
import { flightsTopic } from "@/tools/flights/topic";
import { railwayTopic } from "@/tools/railway/topic";
import { aicpiTopic } from "@/tools/aicpi/topic";

export const TOPICS = [
  calcTopic, emiTopic, pfTopic, gratuityTopic, encashmentTopic, datesTopic, converterTopic,
  tyreTopic, rimTopic, evTopic, vinTopic, bhTopic,
  goldTopic, marketsTopic, fuelTopic, newsTopic, sportsTopic, weatherTopic, flightsTopic, railwayTopic, aicpiTopic,
] as const;

type Topic = (typeof TOPICS)[number];

/** the calculators and readers that have a page of their own, opened with Enter or from the list: derived from the topics, never written twice */
export type FormKind = Extract<Topic, { form: object }>["id"];
/** the live-data cards */
export type LiveTopic = Extract<Topic, { live: object }>["id"];
/** every kind of typed line that a topic answers, with what its card needs */
export type TopicHit = Topic extends infer T ? T extends { hits: readonly (infer R)[] } ? (R extends { detect: (...a: never[]) => infer H } ? NonNullable<H> : never) : never : never;

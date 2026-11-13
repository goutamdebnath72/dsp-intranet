// src/tools/registry.ui.tsx
//
// THE LIST OF TOPICS (panel side). One line for each topic, in the order of src/tools/registry.ts: this order is the order of the tiles in the list of calculators. See types.ts and uiTypes.ts.
import { calcUi } from "@/tools/calculator/ui";
import { emiUi } from "@/tools/emi/ui";
import { pfUi } from "@/tools/pf/ui";
import { gratuityUi } from "@/tools/gratuity/ui";
import { encashmentUi } from "@/tools/encashment/ui";
import { datesUi } from "@/tools/dates/ui";
import { converterUi } from "@/tools/converter/ui";
import { tyreUi } from "@/tools/tyre/ui";
import { rimUi } from "@/tools/rim/ui";
import { evUi } from "@/tools/ev/ui";
import { vinUi } from "@/tools/vin/ui";
import { bhUi } from "@/tools/bh/ui";
import { goldUi } from "@/tools/gold/ui";
import { marketsUi } from "@/tools/markets/ui";
import { fuelUi } from "@/tools/fuel/ui";
import { newsUi } from "@/tools/news/ui";
import { sportsUi } from "@/tools/sports/ui";
import { weatherUi } from "@/tools/weather/ui";
import { flightsUi } from "@/tools/flights/ui";
import { railwayUi } from "@/tools/railway/ui";
import { aicpiUi } from "@/tools/aicpi/ui";
import type { TopicUi } from "@/tools/uiTypes";

export const TOPIC_UIS: readonly TopicUi[] = [
  calcUi, emiUi, pfUi, gratuityUi, encashmentUi, datesUi, converterUi, tyreUi, rimUi, evUi, vinUi, bhUi, goldUi, marketsUi, fuelUi, newsUi, sportsUi, weatherUi, flightsUi, railwayUi, aicpiUi,
];

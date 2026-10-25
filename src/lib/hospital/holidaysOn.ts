// src/lib/hospital/holidaysOn.ts
// The production holiday lookup for the OPD closure check: the holidays on one date from the holiday tables (the same data as the holiday answers).

import { isHolidayYearLoaded, queryHolidays } from "@/lib/holidays/analytics";
import type { HolidaysOn } from "./closure";

export const holidaysOn: HolidaysOn = async (iso) => {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !(await isHolidayYearLoaded(year))) return { yearLoaded: false, hits: [] };
  const res = await queryHolidays({ op: "list", filters: { year, date: { month, day } } });
  return { yearLoaded: true, hits: (res.holidays ?? []).map((h) => ({ name: h.name, type: h.type, categories: h.categories })) };
};

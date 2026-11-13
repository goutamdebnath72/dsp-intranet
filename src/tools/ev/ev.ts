// src/tools/ev/ev.ts
//
// ELECTRIC-CAR CHARGING: an approximate idea of how long a battery of a given size takes to charge (say from 10% to 90%) from AC and DC chargers of various ratings, and what
// the battery and charger specifications mean. Pure; nothing is stored or sent anywhere.
//
// The method is the plain one, and the answer is marked as approximate everywhere it is shown:
//   energy to add (kWh) = capacity x (to% - from%)
//   AC charger: the car's on-board charger sets the pace, at the lower of the charger's and the car's AC limit; about 90% of the power reaches the battery.
//   DC charger: the power is the lower of the charger's and the car's DC limit, about 95% reaches the battery, and a lithium-ion battery takes less as it fills:
//               up to 50% about 75% of that peak on average, 50-80% about half of it, above 80% about a fifth. Cold weather, a hot battery or an old one make it slower still.

export interface Charger {
  id: string;
  kind: "AC" | "DC";
  kw: number;
  label: string;
  note: string;
}

export const CHARGERS: Charger[] = [
  { id: "ac3", kind: "AC", kw: 3.3, label: "AC 3.3 kW", note: "ordinary 15 A socket or Bharat AC-001 point: overnight at home or office" },
  { id: "ac7", kind: "AC", kw: 7.4, label: "AC 7.4 kW", note: "single-phase wall box (230 V, 32 A): the common home or office charger for cars" },
  { id: "ac11", kind: "AC", kw: 11, label: "AC 11 kW", note: "three-phase wall box (415 V, 16 A), if the car accepts it" },
  { id: "ac22", kind: "AC", kw: 22, label: "AC 22 kW", note: "three-phase public AC point (415 V, 32 A), if the car accepts it" },
  { id: "dc30", kind: "DC", kw: 30, label: "DC 30 kW", note: "small CCS2 fast charger" },
  { id: "dc60", kind: "DC", kw: 60, label: "DC 60 kW", note: "common CCS2 public fast charger" },
  { id: "dc120", kind: "DC", kw: 120, label: "DC 120 kW", note: "high-power CCS2 charger" },
  { id: "dc240", kind: "DC", kw: 240, label: "DC 240 kW", note: "ultra-fast CCS2 charger, only for cars that can take it" },
];

export const AC_EFFICIENCY = 0.9;
export const DC_EFFICIENCY = 0.95;
/** average share of the peak power over each stretch of the battery's state of charge (DC) */
export const DC_BANDS: Array<{ from: number; to: number; share: number }> = [
  { from: 0, to: 50, share: 0.75 },
  { from: 50, to: 80, share: 0.5 },
  { from: 80, to: 100, share: 0.2 },
];

export interface EvInput {
  capacityKwh: number;
  fromPct: number;
  toPct: number;
  /** the most the car's on-board charger takes on AC, kW */
  carAcKw: number;
  /** the most the car takes on DC at its peak, kW */
  carDcKw: number;
  /** how far one kWh takes the car, km (for the range added) */
  kmPerKwh: number;
}

export const EV_DEFAULTS: EvInput = { capacityKwh: 40, fromPct: 10, toPct: 90, carAcKw: 7.4, carDcKw: 60, kmPerKwh: 6 };

export interface ChargeEstimate {
  hours: number;
  /** the power the car actually takes at its peak, kW */
  pace: number;
  limitedBy: "charger" | "car";
  addedKwh: number;
  fromGridKwh: number;
  addedKm: number;
}

export interface EvProblem { error: string }
export const isEvProblem = (x: unknown): x is EvProblem => !!x && typeof (x as EvProblem).error === "string";

export function validateEv(i: EvInput): EvProblem | null {
  if (!(i.capacityKwh > 0) || i.capacityKwh > 300) return { error: "Enter the battery size in kWh (for example 40)." };
  if (!(i.fromPct >= 0 && i.fromPct < 100)) return { error: "Start charge must be between 0 and 99 percent." };
  if (!(i.toPct > 0 && i.toPct <= 100)) return { error: "Target charge must be between 1 and 100 percent." };
  if (i.toPct <= i.fromPct) return { error: "The target must be higher than the starting charge." };
  if (!(i.carAcKw > 0) || !(i.carDcKw > 0)) return { error: "Enter what the car accepts on AC and on DC, in kW (see the car's manual)." };
  return null;
}

/** The time for one charger. */
export function estimateCharge(i: EvInput, c: { kind: "AC" | "DC"; kw: number }): ChargeEstimate | EvProblem {
  const bad = validateEv(i);
  if (bad) return bad;
  if (!(c.kw > 0)) return { error: "Enter the charger's rating in kW." };
  const limit = c.kind === "AC" ? i.carAcKw : i.carDcKw;
  const pace = Math.min(c.kw, limit);
  const added = (i.capacityKwh * (i.toPct - i.fromPct)) / 100;
  let hours: number;
  if (c.kind === "AC") {
    hours = added / (pace * AC_EFFICIENCY);
  } else {
    hours = 0;
    for (const b of DC_BANDS) {
      const lo = Math.max(b.from, i.fromPct), hi = Math.min(b.to, i.toPct);
      if (hi <= lo) continue;
      hours += ((i.capacityKwh * (hi - lo)) / 100) / (pace * b.share * DC_EFFICIENCY);
    }
  }
  const eff = c.kind === "AC" ? AC_EFFICIENCY : DC_EFFICIENCY;
  return { hours, pace, limitedBy: c.kw <= limit ? "charger" : "car", addedKwh: added, fromGridKwh: added / eff, addedKm: added * i.kmPerKwh };
}

/** "4 h 48 min", "42 min", "under 1 min" */
export function hoursText(h: number): string {
  if (!Number.isFinite(h) || h < 0) return "—";
  const total = Math.round(h * 60);
  if (total < 1) return "under 1 min";
  const hh = Math.floor(total / 60), mm = total % 60;
  return hh ? `${hh} h${mm ? ` ${mm} min` : ""}` : `${mm} min`;
}

export interface EvTerm { term: string; meaning: string }

export const BATTERY_TERMS: EvTerm[] = [
  { term: "Capacity (kWh)", meaning: "The energy the battery stores, like the size of a fuel tank. 40 kWh can supply 40 kW for an hour. Makers quote gross (total) or usable (what the car lets you use) capacity; usable is the smaller figure." },
  { term: "Voltage (V)", meaning: "The pressure of the battery pack, 300 to 450 V in most cars and about 800 V in the newest fast-charging cars. A higher voltage lets the same power flow at lower current, so a car can charge faster without thicker cables." },
  { term: "Ah (ampere-hour)", meaning: "The charge a battery holds. Capacity in kWh = voltage x Ah / 1000." },
  { term: "State of charge (SoC, %)", meaning: "How full the battery is. Charging is fastest in the middle and slows a lot above 80%, so 10-80% is the usual quick stop." },
  { term: "Range (km)", meaning: "How far a full battery takes the car. The certified figure (ARAI / MIDC) is higher than what you get on the road; allow about 70-80% of it." },
  { term: "Efficiency (km per kWh, or Wh/km)", meaning: "How far one kWh takes the car: small city cars about 6-7 km, large SUVs about 4-5 km. It converts the energy added into the range added." },
  { term: "Battery type", meaning: "LFP (lithium iron phosphate) is durable and safe and may be charged to 100% daily; NMC (nickel manganese cobalt) is lighter and compact, kept best between 20% and 80% for daily use." },
];

export const CHARGER_TERMS: EvTerm[] = [
  { term: "AC charging (slow, 3.3 to 22 kW)", meaning: "The socket supplies alternating current and the car's own on-board charger changes it to direct current. The on-board charger (commonly 3.3 or 7.4 kW) sets the limit, whatever the wall box can give." },
  { term: "DC charging (fast, 25 to 350 kW)", meaning: "The charger itself changes the power to direct current and feeds the battery directly, bypassing the on-board charger. This is what a highway fast charger does. The car's battery management limits the pace, and cuts it above 80%." },
  { term: "kW (charger power)", meaning: "Power = voltage x current. Single phase: kW = V x A / 1000 (230 V x 32 A = 7.4 kW). Three phase: kW = 1.732 x V x A / 1000 (415 V x 32 A = 22 kW)." },
  { term: "Connector: Type 2 (AC)", meaning: "The round seven-pin plug used for AC charging of cars in India and Europe (IEC 62196)." },
  { term: "Connector: CCS2 (DC)", meaning: "The Type 2 plug with two large pins below it for DC fast charging: the standard for cars in India (also CHAdeMO on some older cars)." },
  { term: "Bharat AC-001 / DC-001", meaning: "The Indian light-EV standards for scooters, three-wheelers and small vehicles: AC-001 is a 3.3 kW AC point, DC-001 a low-voltage DC point (about 15 kW); they are not for cars." },
  { term: "Time to charge", meaning: "Hours = energy to add (kWh) / (power in kW x efficiency). AC loses about 10% as heat, DC about 5%; DC gets slower as the battery fills." },
];

// src/tools/ev/evGuideData.ts
//
// "EV SPECIFICATIONS, IN PLAIN WORDS": the second tab of the electric-car window. A person who is not an electrical engineer meets the same dozen words on every EV page, advert and spec sheet (kW, kWh, bhp, PS, Nm,
// volt, LFP, Blade battery, AC and DC charging, CCS2, C-rate). This file says what each means, in the order a buyer meets them, in six distinct sections. Pure data, no React (EvGuide.tsx draws it); tested in evGuide.selftest.ts.
//
// Where a figure is a maker's claim or a news report, the section says so and names it; where a figure is arithmetic (bhp from kW) it is computed here from the same constants as the converter (src/tools/converter/units.ts).
// The Blade-battery facts are BYD's own (its blog of January 22, 2023) and, for the Indian cars, Autocar India, Autocar Professional and S&P Global Mobility; nothing here is a price, a range figure for a named car or a warranty.

export interface GuideSource { name: string; url: string; quote: string }

/** the two sources of the mechanical and metric horsepower, in watts: the same as the converter's (bhp 745.7 W, PS 735.5 W) */
export const WATTS = { bhp: 745.6998715823, ps: 735.49875 } as const;
export const kwToBhp = (kw: number): number => (kw * 1000) / WATTS.bhp;
export const kwToPs = (kw: number): number => (kw * 1000) / WATTS.ps;
export const bhpToKw = (bhp: number): number => (bhp * WATTS.bhp) / 1000;

export interface GuideTerm {
  /** the word as it is printed on a spec sheet */
  term: string;
  /** what it means, with no jargon */
  plain: string;
  /** the one thing to remember when comparing two cars (optional) */
  tip?: string;
}

export interface GuideSection {
  id: "two" | "power" | "battery" | "blade" | "charging" | "socket";
  /** 1 to 6, the order a buyer meets them */
  no: number;
  title: string;
  /** one line under the title: the question the section answers */
  question: string;
  tone: "emerald" | "sky" | "violet" | "amber" | "rose" | "teal";
  intro: string;
  terms: GuideTerm[];
  /** a short note in the margin (what to watch for) */
  watch?: string;
  sources?: GuideSource[];
}

export const GUIDE_LEAD =
  "Every electric car is described by a few numbers. This page says what each one means, in plain words, in the order you meet it: how strong the car is, what its battery holds, what the Blade battery is, and how it charges. Nothing here needs any electrical training.";

/** the picture to keep in mind: a petrol car's tank and engine */
export const TWO_NUMBERS = {
  kwh: { unit: "kWh", name: "kilowatt-hour", picture: "the fuel tank", says: "how much energy the battery holds, so how FAR the car can go" },
  kw: { unit: "kW", name: "kilowatt", picture: "the engine", says: "how much power the motor (or the charger) can give at one moment, so how FAST and how STRONG" },
};

const BLADE_SOURCES: GuideSource[] = [
  { name: "BYD, \"BYD's revolutionary Blade Battery: all you need to know\" (January 22, 2023)", url: "https://www.byd.com/eu/blog/BYDs-revolutionary-Blade-Battery-all-you-need-to-know", quote: "the Blade Battery gave off no smoke or fire and the surface temperature only reached 30 to 60 degrees Celsius" },
  { name: "BYD, the same page", url: "https://www.byd.com/eu/blog/BYDs-revolutionary-Blade-Battery-all-you-need-to-know", quote: "BYD CTP (Cell to Pack) technology makes the difference, with the Blade Battery increasing space utilization by 50%." },
  { name: "Autocar India, Suzuki e Vitara revealed as first Maruti EV for India", url: "https://www.autocarindia.com/car-news/suzuki-e-vitara-revealed-as-first-maruti-ev-for-india-433404", quote: "The e Vitara will be available with two battery options – 49kWh and 61kWh" },
  { name: "Autocar India, the same page", url: "https://www.autocarindia.com/car-news/suzuki-e-vitara-revealed-as-first-maruti-ev-for-india-433404", quote: "The batteries use LFP (Lithium Iron-phosphate) ‘blade’ cells from Chinese battery giant BYD." },
  { name: "S&P Global Mobility, Mahindra launches BE 6e and XEV 9e with LFP battery packs (November 28, 2024)", url: "https://autotechinsight.spglobal.com/news/5279279/mahindra-mahindra-launches-be-6e-and-xev-9e-bevs-with-lfp-battery-packs", quote: "powered by BYD-sourced LFP battery packs" },
  { name: "Autocar Professional, REVEALED: A to Z component suppliers to Mahindra’s latest BEVs", url: "https://www.autocarpro.in/feature/revealed-a-to-z-component-suppliers-to-mahindras-latest-bevs-124391", quote: "BYD – The Chinese EV technology major is the supplier of its proprietary lithium-iron phosphate (LPF) ‘Blade Cells’ that are arranged in a cell-to-module format." },
  { name: "Autocar Professional, the same page", url: "https://www.autocarpro.in/feature/revealed-a-to-z-component-suppliers-to-mahindras-latest-bevs-124391", quote: "in the 59kWh and 79kWh battery packs offered on the two models" },
  { name: "Autocar Professional, the same page", url: "https://www.autocarpro.in/feature/revealed-a-to-z-component-suppliers-to-mahindras-latest-bevs-124391", quote: "in-house-assembled LFP battery packs" },
];

export const GUIDE: GuideSection[] = [
  {
    id: "two", no: 1, tone: "emerald",
    title: "The two numbers on every EV",
    question: "What is the difference between kWh and kW?",
    intro: "A petrol car has a fuel tank (litres) and an engine (horsepower). An electric car has the same two things: its \"tank\" is measured in kilowatt-hours (kWh) and its \"engine\" in kilowatts (kW). The two units look alike and people mix them up all the time.",
    terms: [
      { term: "kWh (kilowatt-hour): the tank", plain: "The energy the battery stores. It decides how far the car goes on a full charge. It is the same \"unit\" that your electricity bill counts: 1 kWh = 1 unit of electricity. A 60 kWh battery holds 60 units.", tip: "A bigger kWh number means a longer range, not a faster car." },
      { term: "kW (kilowatt): the engine", plain: "The power: how hard the motor can push, or how fast a charger can fill the battery, at one moment. Power is the speed of using energy: 1 kW running for 1 hour uses 1 kWh.", tip: "A bigger kW number means quicker acceleration (or quicker charging), not a longer range." },
      { term: "The link between them", plain: "A 60 kWh battery can feed a 60 kW motor for one hour, or a 30 kW motor for two hours. A 7 kW charger adds 7 kWh in an hour (a little less, because some energy is lost as heat)." },
    ],
    watch: "When an advert says \"60\", ask whether it is kWh (the battery) or kW (the power). They are different things.",
  },
  {
    id: "power", no: 2, tone: "sky",
    title: "Power: kW, bhp and PS",
    question: "How strong is the car, and how is that written?",
    intro: "Petrol and diesel cars give engine power in bhp or PS. Electric cars give the motor power in kW, the international unit; many makers print the bhp or PS beside it so that you can compare. All three measure the same thing.",
    terms: [
      { term: "kW, bhp and PS", plain: "1 kW = 1.341 bhp = 1.360 PS. So 100 kW is 134 bhp or 136 PS. bhp (brake horsepower) is the British unit and PS (Pferdestärke) the metric one; the two differ by about 1.4%. The search bar's converter and the \"100 bhp\" line show all three together.", tip: "bhp, PS and kW are the same quantity: never add them or compare a bhp figure with a kW figure without converting." },
      { term: "Peak power", plain: "The most the motor gives for a short burst, such as a hard start or an overtaking. This is the figure in adverts." },
      { term: "Continuous (rated) power", plain: "The lower level the motor can keep up for hours without overheating. Certification papers list it; adverts usually do not." },
      { term: "Combined power (two motors)", plain: "A car with a motor on each axle (all-wheel drive) gives the combined figure for the whole car. It is often a little less than the two motors' ratings added together, because the battery can only deliver so much at one moment." },
      { term: "Torque (Nm)", plain: "The twist, or pull, of the motor. An electric motor gives its full torque from the first turn, which is why even a modest EV feels quick from a standstill. Newton-metre (Nm) is the unit." },
      { term: "The motor itself", plain: "The motor that turns the wheels is an AC motor (alternating current), usually a permanent-magnet synchronous motor (PMSM) or an induction motor. The battery stores DC (direct current), and a box called the inverter turns that DC into the AC the motor needs. Older or simpler vehicles may use DC motors; modern cars rarely do." },
    ],
    watch: "In short: the battery is quoted in kWh, and the power of the car is quoted in kW, which is the power of the motor (or of both motors together) that drives the wheels.",
  },
  {
    id: "battery", no: 3, tone: "teal",
    title: "The battery",
    question: "What do the battery numbers mean?",
    intro: "The battery is the most expensive part of an electric car and the part that decides range, charging speed and how long the car stays healthy. These are its words.",
    terms: [
      { term: "Capacity (kWh)", plain: "The size of the tank. A 75 kWh battery can in theory give 75 kW for one hour, or 15 kW for five hours." },
      { term: "Gross and usable capacity", plain: "Gross is all the energy the cells can hold. Usable (net) is the part the car lets you use. Makers lock away a small cushion at the top and bottom (usually 3% to 10%) so that the battery does not wear out early. Usable is the smaller figure and the one that counts when you plan a trip." },
      { term: "Voltage (V)", plain: "The electrical pressure of the pack. Most cars run at about 400 V; some newer fast-charging cars run at 800 V or more. A higher voltage moves the same power through thinner, cooler cables, which helps a car charge quickly." },
      { term: "State of charge (SoC, %)", plain: "How full the battery is, like a fuel gauge. Charging is fastest when the battery is low and slows down as it fills, above all after 80%." },
      { term: "Range (km) and efficiency", plain: "Range is how far a full charge takes the car. The certified figure (ARAI) is measured under test conditions and is higher than what you will see in daily driving; allow about 70% to 80% of it. Efficiency is km per kWh: a small city car gives about 6 to 7, a large SUV about 4 to 5." },
      { term: "NMC / NCA chemistry", plain: "Nickel-based cells. They pack more energy into less weight and cope better with cold, but cost more and are best kept between 20% and 80% for daily use." },
      { term: "LFP chemistry (lithium iron phosphate)", plain: "Cells with no cobalt or nickel. A little heavier for the same energy, but cheaper, safer and longer-lived. They can be charged to 100% regularly without much harm." },
      { term: "Charge cycles and life", plain: "One cycle is one full charge-and-use. LFP cells are commonly rated for a few thousand cycles, nickel-based cells for fewer (often 1,000 to 2,000). In theory a battery with 1,500 cycles on a car that does 300 km per full charge could cover about 4.5 lakh km; real life is shorter, so read the maker's battery warranty (years and km)." },
    ],
  },
  {
    id: "blade", no: 4, tone: "violet",
    title: "The Blade battery (BYD)",
    question: "What is a Blade battery, and is it better?",
    intro: "BYD's Blade battery, launched in March 2020, is a lithium iron phosphate (LFP) battery whose cells are long and flat, like blades, laid side by side in the pack. It is a clever shape for an old and safe chemistry.",
    terms: [
      { term: "What is different", plain: "Ordinary packs use many small round or box-shaped cells grouped into modules. BYD's cells are long and thin (roughly a metre long and about 1.35 cm thick; the published sizes differ a little). Because the flat shape gives a large surface, heat leaves easily, and because the cells are strong, they can act as part of the pack's own structure. BYD says this Cell-to-Pack (CTP) design uses the space in the pack 50% better." },
      { term: "Safety", plain: "In the nail-penetration test (a steel nail driven through the cell, the standard test for battery fires), BYD reports that the Blade cell gave off no smoke or fire and its surface only reached 30 to 60 °C. BYD puts this down to the chemistry: LFP has excellent thermal stability." },
      { term: "More powerful?", plain: "Not by itself. The power of a car comes from its motors and from how fast its battery can discharge; the Blade shape does not add power. What it adds, BYD says, is safety, a long life and a better use of the space in the pack. It is a little heavier than nickel-based cells for the same kWh." },
      { term: "Who uses it in India", plain: "News reports say the Mahindra BE 6 (launched as the BE 6e) and XEV 9e use BYD Blade LFP cells, which Mahindra assembles into its own 59 kWh and 79 kWh packs at its Chakan plant, grouped in modules; and that the Maruti e Vitara uses BYD Blade batteries in 49 kWh and 61 kWh sizes, and Maruti imports the whole pack. Other makers use LFP too, in other cell shapes: LFP is not a BYD invention, the blade shape is." },
    ],
    watch: "\"Blade\" is the shape of the cell; \"LFP\" is the chemistry. A car can have LFP cells without being a Blade battery.",
    sources: BLADE_SOURCES,
  },
  {
    id: "charging", no: 5, tone: "amber",
    title: "Charging: AC and DC",
    question: "What do the charger numbers mean?",
    intro: "A battery can only store direct current (DC). The wall supplies alternating current (AC). Someone has to convert it: the car (AC charging) or the charger (DC charging).",
    terms: [
      { term: "AC charging (slow)", plain: "From a home wall box or a slow public point. The charger inside the car, the on-board charger (OBC), converts the AC to DC. The OBC is small (commonly 3.3, 7.4 or 11 kW), so it is the limit: a 22 kW wall box charges a car with a 7.4 kW OBC at 7.4 kW only." },
      { term: "DC fast charging", plain: "At a public rapid charger the conversion is done inside the charger station itself, which is big and powerful, and it feeds high-voltage DC straight into the battery, bypassing the on-board charger." },
      { term: "Charger power (kW)", plain: "How fast energy flows in. Higher kW, shorter stop. A 60 kWh battery on a 7 kW AC point takes most of a night; on a 100 kW DC charger, if the car can take that power, 10% to 80% takes well under an hour." },
      { term: "Peak against average speed", plain: "A car rated \"250 kW\" reaches that speed only when the battery is low (roughly 10% to 30%). As the battery fills, the car's computer slows the flow (the charging curve) to protect the cells. So the time for 10% to 80% is a far better number than the peak kW." },
      { term: "C-rate", plain: "Charging speed compared with battery size. 1C charges a battery in about one hour: for a 60 kWh battery that is 60 kW. 2C is about half an hour (120 kW), 3C about 20 minutes (180 kW)." },
    ],
    watch: "The tab beside this one works out the time for your own battery and chargers.",
  },
  {
    id: "socket", no: 6, tone: "rose",
    title: "The charging socket",
    question: "Does a car need one socket for AC and another for DC?",
    intro: "No. Most cars sold in India today have a single charging socket (one \"mouth\") that takes both an AC plug and a DC plug.",
    terms: [
      { term: "CCS2 (Combined Charging System 2)", plain: "The standard car socket in India and Europe. It is a round Type 2 socket on top with two large DC pins underneath it, which together make the \"combined\" port." },
      { term: "Plugging in AC", plain: "A Type 2 cable goes into the round top part. The two big pins below stay unused and are usually covered by a small flap." },
      { term: "Plugging in DC", plain: "You lift the flap and push in the larger CCS2 plug, which fills the whole socket: the top part carries the communication and the earth, and the two big pins carry the high-voltage DC into the battery." },
      { term: "Exceptions", plain: "Older Japanese cars (CHAdeMO), such as the first Nissan Leaf, have two separate sockets side by side, a small one for AC and a round one for DC. Tesla's own plug (called NACS, in North America) uses the same pins for AC and DC, so there is no flap to lift." },
      { term: "Bharat AC-001 and DC-001", plain: "The Indian standards for light electric vehicles (scooters and three-wheelers): a low-power AC and a low-voltage DC point. They are not for cars." },
    ],
  },
];

/** a worked example: a made-up car, with the figures worked out so that each term has a number beside it (it is an illustration, not a real car) */
export const EXAMPLE = { capacityKwh: 60, motorKw: 110, kmPerKwh: 5, acKw: 7.4 };

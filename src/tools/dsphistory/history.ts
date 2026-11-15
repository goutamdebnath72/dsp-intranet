// src/tools/dsphistory/history.ts
//
// THE DATA OF THE DSP STORY CARD (pure, no React): how the Durgapur Steel Plant came to be, who made it, what it made at the start, who has headed it, and the family of SAIL it belongs to.
// Every fact carries its SOURCE. The sources, in order of weight:
//   * SAIL's own publications: "Steel Cities" (2020), the Background & History page and its History Tree of dated photographs, the plant's page and its RTI manual, the annual reports.
//   * The Ministry of Steel (a 2002 backgrounder; the 2025-26 annual report; a Lok Sabha reply), the Government's and SAIL's own records.
//   * The plant's and SAIL's JO Manuals 2022 (the five manuals read for this card; the page is given).
//   * A MEMOIR by M S Srinivasan, who served Hindustan Steel and SAIL for over thirty years and was part of the team that built Durgapur ("Durgapur - fifty years ago", 2010). It is the only source for the early heads' order and
//     for some colour; it is a personal account, so wherever it is used the card says so, and where SAIL's captions confirm a name or a date the card says that too. Its remarks on persons are not repeated.
// A date is the date the source gives; where two sources differ BOTH are shown (the card says "the sources differ"). A name or year that no source gives is left out: the card has gaps and says so, it never fills one.
// The pictures are SAIL's own photographs (SAIL's History Tree and its Steel Cities book), kept in public/dsp-history/ with the SAIL caption; their credit is on the card. Tested in history.selftest.ts.

export interface Source { name: string; url?: string; page?: string; quote?: string }

export const SRC = {
  cities: { name: "SAIL, Steel Cities (2020)", url: "https://www.sail.co.in/sites/default/files/publication/2020-06/sail_steel_cities.pdf" },
  history: { name: "SAIL, Background & History (History Tree)", url: "https://sail.co.in/en/company/background-history" },
  rti: { name: "SAIL, particulars of Durgapur Steel Plant (RTI manual)", url: "https://sail.co.in/en/right-information-act/brief-manuals/particulars-durgapur-steel-plants-organization-functions-and" },
  about: { name: "SAIL, About Durgapur Steel Plant", url: "https://sail.co.in/en/plants/about-durgapur-steel-plant-0" },
  pib: { name: "Ministry of Steel, backgrounder on Durgapur Steel Plant, July 9, 2002 (PIB)", url: "https://archive.pib.gov.in/release02/lyr2002/rjul2002/09072002/r090720023.html" },
  memoir: { name: "M S Srinivasan, \"Durgapur - fifty years ago\" (a memoir, 2010)", url: "https://matrixmantra.blogspot.com/2010/11/history-of-durgapur-steel-plant.html" },
  dspManual: { name: "Durgapur Steel Plant, Operation Department Manual (JO Manual 2022)" },
  sailManual: { name: "SAIL, JO Manual 2022: Industry & Company Awareness" },
  lokSabha: { name: "Lok Sabha unstarred question 5356 (Ministry of Steel, 2025)", url: "https://steel.gov.in/sites/default/files/2025-04/lu%205356.pdf" },
  mos26: { name: "Ministry of Steel, Annual Report 2025-26", url: "https://steel.gov.in/sites/default/files/2026-04/Final%20Annual%20Report%202025-26%20(English%20Version).pdf" },
  ar22: { name: "SAIL Annual Report 2021-22", url: "https://sail.co.in/sites/default/files/2024-03/Sail-Annual-Report_2021-22-%281%29_3.pdf" },
  ar23: { name: "SAIL Annual Report 2022-23", url: "https://sail.co.in/sites/default/files/2023-09/SAIL_Annual-Report-2022-2023.pdf" },
  ar25: { name: "SAIL Annual Report 2024-25", url: "https://sail.co.in/sites/default/files/2025-08/Sail%20Annual%20Report_2025_(25_08_2025).pdf" },
  ar26: { name: "SAIL Annual Report 2025-26", url: "https://sail.co.in/sites/default/files/2026-10/2025-26.pdf" },
  bajaj: { name: "SAIL news, November 2, 2009", url: "https://sail.co.in/en/sail-news/mr-punkaj-kumar-bajaj-takes-over-managing-director-sail-durgapur-steel-plant" },
  pkSingh: { name: "SAIL news, December 10, 2015", url: "https://sail.co.in/en/sail-news/mr-pk-singh-takes-charge-sail-chairman" },
  rath: { name: "Millennium Post, March 27, 2016", url: "https://www.millenniumpost.in/a-k-rath-takes-over-as-sails-dsp-ceo-131840" },
  bs16: { name: "Business Standard (PTI), March 29, 2016", url: "https://www.business-standard.com/article/pti-stories/sail-appoints-ceos-of-burnpur-rourkela-durgapur-plants-116032900661_1.html" },
  bs97: { name: "Business Standard, April 1997", url: "https://www.business-standard.com/article/specials/durgapur-steel-plant-sets-ambitious-production-targets-197040501059_1.html" },
  dasgupta: { name: "SAIL Salem Refractory profile of Shri Anirban Dasgupta", url: "https://www.srclsalem.in/shri-anirban-dasgupta.php" },
  dspPost: { name: "SAIL Durgapur Steel Plant's post on X, September 2019", url: "https://x.com/dspsail1/status/1176062193638395905" },
} as const satisfies Record<string, Source>;

// ---------------------------------------------------------------- PICTURES
export type PhotoId =
  | "panorama" | "coates" | "bf1" | "senCoke" | "queenNiyogi" | "queenClub" | "nehruSection" | "royMerchant" | "nehruWheel" | "shastriBell" | "indiraWadhera" | "sathe" | "mishra";
export interface Photo { id: PhotoId; file: string; caption: string; date: string | null; credit: string; /** a tall picture: drawn whole, never cropped to a landscape frame */ portrait?: boolean }
const SAIL_PHOTO = "Photograph: SAIL (History Tree, sail.co.in)";
const SAIL_BOOK = "Photograph: SAIL, Steel Cities (2020)";
export const PHOTOS: Readonly<Record<PhotoId, Photo>> = {
  panorama: { id: "panorama", file: "panorama-inception.jpg", caption: "Panoramic view of Durgapur Steel Plant during its inception phase", date: null, credit: SAIL_PHOTO },
  coates: { id: "coates", file: "eric-coates-mission.jpg", caption: "Members of the Eric Coates Mission, formed to set up Durgapur Steel Plant with British collaboration, during their visit to India in 1956", date: "1956", credit: SAIL_BOOK },
  bf1: { id: "bf1", file: "blast-furnace-1-president-prasad-1959.jpg", caption: "President Rajendra Prasad after inaugurating Blast Furnace #1 at Durgapur Steel Plant", date: "December 26, 1959", credit: SAIL_PHOTO },
  senCoke: { id: "senCoke", file: "ks-sen-coke-oven-battery-1959.jpg", caption: "General Manager Mr K K Sen lighting up Coke Oven Battery #1 at Durgapur Steel Plant", date: "November 23, 1959", credit: SAIL_PHOTO },
  queenNiyogi: { id: "queenNiyogi", file: "queen-elizabeth-with-niyogi-1961.jpg", caption: "Queen Elizabeth with Mr P C Niyogi, then General Manager, during her visit to Durgapur Steel Plant", date: "February 1961", credit: SAIL_PHOTO },
  queenClub: { id: "queenClub", file: "queen-elizabeth-durgapur-club.jpg", caption: "Queen Elizabeth at Durgapur Club", date: "February 1961", credit: SAIL_BOOK, portrait: true },
  nehruSection: { id: "nehruSection", file: "nehru-section-mill-1961.jpg", caption: "Pandit Nehru on the occasion of commissioning of Section Mill at Durgapur Steel Plant", date: "February 18, 1961", credit: SAIL_PHOTO },
  royMerchant: { id: "royMerchant", file: "bc-roy-merchant-mill-1962.jpg", caption: "Dr B C Roy, West Bengal Chief Minister, commissioning the Merchant Mill at Durgapur Steel Plant", date: "January 19, 1962", credit: SAIL_PHOTO },
  nehruWheel: { id: "nehruWheel", file: "nehru-wheel-plant-1962.jpg", caption: "Pandit Nehru on the occasion of inauguration of Wheel Plant at Durgapur Steel Plant", date: "January 24, 1962", credit: SAIL_PHOTO },
  shastriBell: { id: "shastriBell", file: "shastri-bell-1964.jpg", caption: "Prime Minister Shri Lal Bahadur Shastri reviewing work on Durgapur Steel Plant's capacity expansion to 1.6 million tonnes with Mr D J Bell, General Manager", date: "January 11, 1964", credit: SAIL_PHOTO },
  indiraWadhera: { id: "indiraWadhera", file: "indira-gandhi-wadhera-1970.jpg", caption: "Prime Minister Smt Indira Gandhi with Major General B P Wadhera, then Director-in-Charge, Durgapur Steel Plant, during her visit to the plant", date: "1970", credit: SAIL_PHOTO },
  sathe: { id: "sathe", file: "sathe-modernisation-1985.jpg", caption: "Minister for Steel, Mines & Coal Shri Vasant Sathe announcing the modernisation plan for Durgapur Steel Plant", date: "January 23, 1985", credit: SAIL_PHOTO },
  mishra: { id: "mishra", file: "surajit-mishra.jpg", caption: "Shri Surajit Mishra, Director In-charge (Burnpur and Durgapur Steel Plants)", date: null, credit: "Photograph: SAIL (Board & Organisation, sail.co.in)", portrait: true },
};
export const photoSrc = (id: PhotoId): string => `/dsp-history/${PHOTOS[id].file}`;

// ---------------------------------------------------------------- THE STORY IN A STRIP
/** the five dates every DSP person knows */
export const KEY_DATES: ReadonlyArray<{ when: string; what: string; note: string }> = [
  { when: "October 1956", what: "Contract signed", note: "with the Indian Steel Works Construction Company (ISCON), the British consortium that built the plant" },
  { when: "January 1957", what: "Construction begins", note: "on 6,568 hectares acquired for the plant and township" },
  { when: "December 26, 1959", what: "First blast furnace", note: "inaugurated by President Rajendra Prasad (the Ministry's backgrounder says it was commissioned on December 29)" },
  { when: "April 24, 1960", what: "First ingot cast", note: "the day is observed as DSP Day" },
  { when: "January 24, 1973", what: "SAIL is formed", note: "celebrated every year as SAIL Day; Durgapur becomes one of its integrated steel plants" },
];

/** the plant in a few facts, each with its source */
export const FACTS: ReadonlyArray<{ label: string; value: string; source: Source }> = [
  { label: "Technology came from", value: "Britain: the Indian Steel Works Construction Company (ISCON), a consortium of British companies (Rourkela's technology came from Germany, Bhilai's from the USSR)", source: { ...SRC.cities, page: "p. 63" } },
  { label: "Where", value: "Durgapur, West Bengal, on the banks of the Damodar River, on the Grand Trunk Road (NH-19) and the Kolkata-Delhi main line. SAIL gives its distance from Kolkata as 158 km; road distances quoted elsewhere are longer, about 170 to 180 km", source: SRC.about },
  { label: "Its place", value: "the third integrated steel plant of Hindustan Steel Limited, after Rourkela and Bhilai", source: { ...SRC.dspManual, page: "p. 2" } },
  { label: "Why here", value: "coal fields, the Grand Trunk Road, the Kolkata-Delhi railway, Kolkata Port, power from DVC and water from the Durgapur Barrage", source: { ...SRC.dspManual, page: "p. 2" } },
  { label: "Cost, at the start", value: "Rs 189.6 crore, of which Rs 17.36 crore for the township", source: { ...SRC.dspManual, page: "p. 3" } },
  { label: "Land", value: "6,568 hectares acquired; the township covers 32 sq km in three zones, A, B and C", source: { ...SRC.cities, page: "pp. 65, 69" } },
  { label: "Initial capacity", value: "1 MT (million tonnes) of crude steel a year", source: SRC.about },
  { label: "Unique in India", value: "the only maker of forged railway wheels and axles in the country", source: SRC.about },
];

// ---------------------------------------------------------------- THE TIMELINE
export interface TimelineEvent { id: string; when: string; sort: string; title: string; text: string; photo?: PhotoId; note?: string; sources: Source[] }
export const EVENTS: readonly TimelineEvent[] = [
  { id: "hsl", when: "January 19, 1954", sort: "1954-01-19", title: "Hindustan Steel Limited is set up", text: "The company was formed to own the new plants. At first it was to manage only Rourkela; in April 1957 it was given charge of Bhilai and Durgapur too.", sources: [SRC.history, { ...SRC.sailManual, page: "p. 33" }] },
  { id: "birla", when: "1954", sort: "1954-06-01", title: "A private proposal is turned down; a British mission is invited", text: "The Birlas proposed a steel plant with British help in 1954; the Government of India declined it under its policy of the time, but invited a technical mission from the United Kingdom to study a third steel plant.", sources: [{ ...SRC.cities, page: "p. 63" }] },
  { id: "coates", when: "April 1955", sort: "1955-04-01", title: "The Eric Coates mission", text: "The mission led by Sir Eric Coates came in April 1955 and four months later reported for a one-million-tonne plant at Durgapur. The Government accepted the report.", photo: "coates", note: "SAIL's photograph is captioned as the mission's visit to India in 1956; the book's text gives April 1955 for the mission. The sources differ.", sources: [{ ...SRC.cities, page: "pp. 63, 86" }] },
  { id: "iscon", when: "Jan to October 1956", sort: "1956-10-01", title: "ISCON reports; the contract is signed", text: "A consortium of British equipment manufacturers, the Indian Steel Works Construction Company (ISCON), sent its preliminary report and estimates in January 1956. After negotiation the contract was signed with it in October 1956.", sources: [{ ...SRC.cities, page: "p. 63" }] },
  { id: "begin", when: "January 1957", sort: "1957-01-01", title: "Construction begins", text: "6,568 hectares had been acquired, and the farmers gave their land willingly. ISCON, the British consortium of 13 companies, was building the plant. The Durgapur Club was founded in 1957 as the ISCON Club.", photo: "panorama", sources: [{ ...SRC.cities, page: "pp. 65, 73" }] },
  { id: "coke", when: "November 23, 1959", sort: "1959-11-23", title: "Coke Oven Battery No. 1 is lit", text: "General Manager K K Sen lit up the first coke oven battery.", photo: "senCoke", sources: [SRC.history, { ...SRC.cities, page: "pp. 86-87" }] },
  { id: "bf1", when: "December 26, 1959", sort: "1959-12-26", title: "President Rajendra Prasad inaugurates Blast Furnace No. 1", text: "The first blast furnace was ready on schedule and the President of India came to inaugurate it. Iron production began that day (the plant manual gives December 26, 1959, as the start of iron production).", photo: "bf1", note: "The Ministry of Steel's 2002 backgrounder gives December 29, 1959, for its commissioning. SAIL's book names the furnace Kasturba; the memoir calls it Sharada Devi. The sources differ.", sources: [{ ...SRC.cities, page: "pp. 65, 86" }, SRC.pib, { ...SRC.dspManual, page: "p. 3" }, SRC.memoir] },
  { id: "ingot", when: "April 24, 1960", sort: "1960-04-24", title: "The first ingot", text: "The first ingot was cast in the steel melting shop. The day is observed as DSP Day.", sources: [SRC.rti, SRC.pib] },
  { id: "queen", when: "February 1961", sort: "1961-02-01", title: "Queen Elizabeth II visits", text: "Durgapur is the only steel city in India that has hosted Queen Elizabeth II. She flew to Panagarh air base, came by helicopter to the A-Zone ground, was received by the Steel Minister, Sardar Swaran Singh, and was the city's guest for a day and a night. DSP was a showpiece of Indo-British collaboration in independent India.", photo: "queenNiyogi", sources: [{ ...SRC.cities, page: "pp. 63, 66" }, SRC.history] },
  { id: "section", when: "February 18, 1961", sort: "1961-02-18", title: "Pandit Nehru commissions the Section Mill", text: "The Prime Minister was at Durgapur for the commissioning of the Section Mill, which rolls the plant's angles, channels and joists.", photo: "nehruSection", sources: [SRC.history, { ...SRC.cities, page: "pp. 6-7" }] },
  { id: "merchant", when: "January 19, 1962", sort: "1962-01-19", title: "Dr B C Roy commissions the Merchant Mill", text: "The Chief Minister of West Bengal, who had done most to bring the plant to Durgapur, commissioned the Merchant Mill.", photo: "royMerchant", note: "The plant's own manual says the Merchant Mill was commissioned in 1961; SAIL's photograph is dated January 19, 1962. The sources differ.", sources: [SRC.history, { ...SRC.cities, page: "pp. 86-87" }, { ...SRC.dspManual, page: "p. 37" }] },
  { id: "wheel", when: "January 24, 1962", sort: "1962-01-24", title: "Pandit Nehru inaugurates the Wheel Plant", text: "The Wheel and Axle Plant, now the only maker of forged railway wheels and axles in India, was inaugurated. Its commissioning completed the 1 MT stage of Durgapur in January 1962.", photo: "nehruWheel", sources: [SRC.history, { ...SRC.sailManual, page: "p. 33" }] },
  { id: "bell", when: "January 11, 1964", sort: "1964-01-11", title: "Lal Bahadur Shastri reviews the expansion to 1.6 MT", text: "He reviewed work on the capacity expansion with D J Bell, the General Manager.", photo: "shastriBell", note: "SAIL's caption calls him Prime Minister; he became Prime Minister in June 1964. The caption is shown as SAIL prints it.", sources: [SRC.history, { ...SRC.cities, page: "p. 86" }] },
  { id: "stage16", when: "August 6, 1969", sort: "1969-08-06", title: "The 1.6 MT stage is complete", text: "The expansion to 1.6 MT of crude steel was completed after the furnace in the steel melting shop was commissioned.", sources: [{ ...SRC.sailManual, page: "p. 33" }, SRC.history] },
  { id: "indira", when: "1970", sort: "1970-06-01", title: "Prime Minister Indira Gandhi visits", text: "She visited the plant with Major General B P Wadhera, then Director-in-Charge.", photo: "indiraWadhera", sources: [SRC.history, { ...SRC.cities, page: "p. 86" }] },
  { id: "sail", when: "January 24, 1973", sort: "1973-01-24", title: "SAIL is incorporated", text: "The Steel Authority of India Limited (SAIL) was incorporated with an authorised capital of Rs 2,000 crore as the holding company of the steel plants, among them Durgapur. In 1978 it was restructured as an operating company. January 24 is celebrated every year as SAIL Day.", sources: [SRC.history, { ...SRC.sailManual, page: "p. 33" }] },
  { id: "modplan", when: "January 23, 1985", sort: "1985-01-23", title: "The modernisation plan is announced", text: "Steel Minister Vasant Sathe announced the modernisation plan for DSP. In the early eighties British Steel Corporation, MECON and the Japan Iron & Steel Federation had studied the plant's problems (deterioration of raw materials, an ageing plant, obsolete technology and high energy use). The Government approved a cost of Rs 2,668 crore in 1989; it later rose beyond Rs 4,500 crore.", photo: "sathe", sources: [SRC.history, { ...SRC.cities, page: "pp. 86-87" }, { ...SRC.dspManual, page: "p. 3" }] },
  { id: "bof", when: "1994-95", sort: "1994-06-07", title: "The modern steel shop", text: "The three BOF converters, made by Mannesmann Demag of Germany, were commissioned on June 7, 1994, September 11, 1994, and February 21, 1995. The first two continuous-casting billet machines (Concast, Switzerland) started on July 9 and August 9, 1994: the first billet caster in any SAIL integrated plant. The new sinter machine started on February 1, 1995.", sources: [{ ...SRC.dspManual, page: "pp. 15, 24, 27-28" }] },
  { id: "bs97", when: "1996-97", sort: "1997-04-01", title: "After the Rs 4,500 crore modernisation", text: "DSP made 1.49 million tonnes of hot metal in 1996-97. For 1997-98 it set itself targets of 2 million tonnes of hot metal, 1.8 million tonnes of crude steel and 1.55 million tonnes of finished steel. The plant's Managing Director was S B Singh.", sources: [SRC.bs97] },
  { id: "mep", when: "June 2015", sort: "2015-06-01", title: "The Modernisation & Expansion Plan is completed", text: "SAIL's Modernisation and Expansion Plan was completed at Durgapur in June 2015 (scheduled for December 2012; cost Rs 3,169 crore, against Rs 2,875 crore planned). It brought the new Medium Structural Mill, the Bloom cum Round Caster and the third Ladle Furnace.", sources: [SRC.lokSabha, { ...SRC.dspManual, page: "p. 28" }] },
  { id: "expand", when: "November 7, 2024", sort: "2024-11-07", title: "The next expansion is approved", text: "The SAIL Board approved the brownfield capacity expansion of Durgapur Steel Plant. A greenfield expansion is also being studied: M N Dastur is the consultant for the project report, which was expected by February 2026.", sources: [SRC.mos26] },
];

// ---------------------------------------------------------------- THE MAKERS
export interface Maker { id: string; title: string; lead: string; points: string[]; photos: PhotoId[]; note?: string; sources: Source[] }
export const MAKERS: readonly Maker[] = [
  { id: "idea", title: "How the idea began", lead: "It all started with Pandit Jawaharlal Nehru, whose dream was to turn India from an agrarian country into an industrial one.",
    points: [
      "Dr Bidhan Chandra Roy, Chief Minister of West Bengal, picked those threads up in his state.",
      "The Durgapur project was firmed up as a follow-up to the recommendations of the Colombo Plan.",
      "Two mills were already planned in the public sector, Rourkela and Bhilai, so Durgapur was to be the third. Those two had German and Soviet help; the Government looked to Britain for Durgapur.",
    ], photos: [], sources: [{ ...SRC.cities, page: "p. 63" }] },
  { id: "britain", title: "Technology from Britain", lead: "A British mission chose the plant and a British consortium built it.",
    points: [
      "Sir Eric Coates led the mission of April 1955 whose report, for a one-million-tonne plant at Durgapur, the Government accepted.",
      "ISCON, a consortium of British equipment makers (13 companies, in SAIL's book and in the memoir), reported in January 1956 and signed the construction contract in October 1956.",
      "Durgapur is the only SAIL steel city that has hosted a British monarch: the plant came to be a showpiece of Indo-British collaboration.",
      "The memoir adds that the Coates report had to serve as the feasibility report, and that British technicians stood among the crowd at the first blast furnace's inauguration.",
    ], photos: ["coates"], sources: [{ ...SRC.cities, page: "pp. 63, 65" }, SRC.memoir] },
  { id: "roy", title: "Dr Bidhan Chandra Roy", lead: "The Chief Minister of West Bengal, \"largely instrumental in influencing the location of the third steel plant at Durgapur\".",
    points: [
      "He had a vision for the industrialisation of the whole Durgapur-Asansol belt, not only the plant.",
      "He commissioned the Merchant Mill on January 19, 1962 (picture).",
      "The memoir says the Coates team chose Durgapur thanks to his vision and his rapport with Nehru.",
    ], photos: ["royMerchant"], sources: [{ ...SRC.cities, page: "p. 65" }, SRC.history, SRC.memoir] },
  { id: "nehru", title: "Pandit Jawaharlal Nehru", lead: "The Prime Minister whose dream began it, and who came to Durgapur twice, according to SAIL's dated photographs.",
    points: [
      "February 18, 1961: commissioning of the Section Mill.",
      "January 24, 1962: inauguration of the Wheel Plant, which completed the 1 MT stage.",
    ], photos: ["nehruSection", "nehruWheel"], sources: [SRC.history, { ...SRC.cities, page: "pp. 6-7" }] },
  { id: "queen", title: "Queen Elizabeth II, February 1961", lead: "Durgapur is the only steel city in India that has hosted Queen Elizabeth II.",
    points: [
      "She arrived at Panagarh air base and came by helicopter to the Durgapur A-Zone ground, where Sardar Swaran Singh, the Steel Minister, received her.",
      "She was due for a day but stayed the night: Durgapur House, the plant's guest house, is still called \"Rani Kuthi\" (the Queen's house) because she slept in what is now Suite No. 1.",
      "She is pictured with Mr P C Niyogi, then General Manager, and at the Durgapur Club.",
    ], photos: ["queenNiyogi", "queenClub"], note: "SAIL gives the month, February 1961; the exact day is not in the sources read for this card.", sources: [{ ...SRC.cities, page: "p. 63" }, SRC.history] },
  { id: "president", title: "President Rajendra Prasad, December 26, 1959", lead: "He inaugurated Blast Furnace No. 1, the plant's first great moment.",
    points: [
      "A former worker recalls that the President wanted papayas for breakfast; there were none in Durgapur, so a car was sent to Kolkata for them.",
      "The memoir lists those on the dais: Steel Minister Swaran Singh, the British High Commissioner, the Steel Secretary, the Governor of West Bengal, the Chairman of Hindustan Steel, General Manager K K Sen and ISCON's representatives.",
    ], photos: ["bf1"], sources: [{ ...SRC.cities, page: "p. 65" }, SRC.history, SRC.memoir] },
  { id: "site", title: "The site and the city", lead: "A jungle between two rivers became a steel city.",
    points: [
      "Shri Jnananjan Niyogi was involved in the early selection of the site; he chose the area for its nearness to the coal fields and its water. (SAIL's photograph captions name the General Manager of 1961 as \"Mr P C Niyogi\"; the card does not say they are the same person.)",
      "The Durgapur Barrage had been built by the Damodar Valley Corporation in 1955, the first multipurpose river valley project of independent India.",
      "The American architects Joseph Allen Stein and Benjamin Polk were given the task of designing the city.",
      "The township is not divided into sectors but into zones (A, B and C) over 32 sq km, with avenues named for Ashok, Chaitanya, Einstein, Guru Nanak, Jagdish Chandra Bose, Newton, Ramkrishna and Tagore.",
      "In 1958 DSP opened its first three schools; at one time 24,000 students studied in its schools.",
    ], photos: ["panorama"], sources: [{ ...SRC.cities, page: "pp. 64-71" }] },
];

// ---------------------------------------------------------------- THE FIRST PRODUCTS
export interface FirstItem { when: string; what: string; detail: string; source: Source[]; note?: string }
export const FIRST_ITEMS: readonly FirstItem[] = [
  { when: "December 26, 1959", what: "Pig iron", detail: "Blast Furnace No. 1 starts: iron production begins. The plan had three blast furnaces, one meant only for foundry-grade pig iron.", source: [{ ...SRC.dspManual, page: "p. 3" }, SRC.memoir] },
  { when: "April 24, 1960", what: "Steel, in ingots", detail: "The first ingot is cast in the steel melting shop (the steel then came from open-hearth furnaces; the basic oxygen shop came in 1994).", source: [SRC.rti, { ...SRC.dspManual, page: "p. 23" }] },
  { when: "February 18, 1961", what: "Structurals", detail: "The Section Mill is commissioned. Today it rolls joists 200 × 100 mm and channels 200 × 75 mm and 150 × 75 mm; its capacity is 2,12,000 tonnes a year. The sources do not say which sections it rolled first.", source: [SRC.history, { ...SRC.dspManual, page: "p. 34" }] },
  { when: "1961 to January 19, 1962", what: "Bars and rounds", detail: "The Merchant Mill was commissioned with a capacity of 2,40,000 tonnes a year and was later modernised to 2,80,000 tonnes for plain rounds and TMT ribbed bars. It is today the plant's TMT mill.", source: [{ ...SRC.dspManual, page: "p. 37" }, SRC.history], note: "The manual says 1961; SAIL's photograph of the commissioning is dated January 19, 1962." },
  { when: "January 24, 1962", what: "Railway wheels and axles", detail: "The Wheel and Axle Plant is inaugurated, with a capacity of 45,000 sets a year, later raised to 75,000 sets. It was first meant for broad-gauge coach wheels. Its commissioning completed the 1 MT stage.", source: [SRC.history, { ...SRC.dspManual, page: "p. 40" }, { ...SRC.sailManual, page: "p. 33" }] },
  { when: "Early years", what: "Billets, blooms, bars and commercial sections", detail: "According to the memoir, the product mix leaned towards the Railways' needs (wheels and axles), with billets, blooms, bars and commercial sections sold to re-rollers.", source: [SRC.memoir], note: "A personal account; no official product list of the first years was found." },
];
/** what is NOT known, said once */
export const FIRST_UNKNOWN = "How many tonnes DSP itself made in 1959-62 is not in any source read for this card. The only early figure is Hindustan Steel's, for all its plants together (Rourkela, Bhilai and Durgapur): 0.158 MT of crude steel in 1959-60 and 1.6 MT in 1961-62 (SAIL JO Manual, p. 33).";

// ---------------------------------------------------------------- THE HEADS
export type EraId = "gm" | "dic" | "md" | "ceo" | "dic2";
export interface Era { id: EraId; title: string; span: string; text: string }
export const ERAS: readonly Era[] = [
  { id: "gm", title: "General Manager", span: "the Hindustan Steel years, 1950s to 1960s", text: "The head of the plant was its General Manager. (The memoir adds that a senior works post, General Superintendent, ranked below him.)" },
  { id: "dic", title: "Director-in-Charge", span: "by 1970", text: "Hindustan Steel appointed a Director-in-Charge for Durgapur, alongside the General Manager." },
  { id: "md", title: "Managing Director", span: "the early 1970s to 2009", text: "From the early 1970s (the memoir) until 2009 (SAIL) the plant's head was named Managing Director." },
  { id: "ceo", title: "Chief Executive Officer", span: "2012 until the SAIL Board was reorganised in 2020", text: "SAIL's plants were headed by Chief Executive Officers; for some years one CEO held charge of two or three plants." },
  { id: "dic2", title: "Director In-charge", span: "since 2022", text: "After SAIL's Board was reorganised in 2020, its plants are led by a Director on the Board, the Director In-charge; for Durgapur and Burnpur (DSP and ISP, with ASP) the first named in the sources is B P Singh, from April 2022." },
];
export type Basis = "SAIL record" | "SAIL report" | "Annual report" | "Press report" | "Memoir";
export interface Head {
  id: string; name: string; era: EraId;
  /** what the head is called in that source, as printed */
  title: string;
  /** a display of the period as the source gives it; empty when the sources give none */
  when: string;
  /** an ISO date or year used only to order the list */
  sort: string;
  photo: PhotoId | null;
  note: string;
  basis: Basis;
  sources: Source[];
}
export const HEADS: readonly Head[] = [
  { id: "sen", name: "K K Sen", era: "gm", title: "General Manager", when: "General Manager in November and December 1959", sort: "1959-11", photo: "senCoke", basis: "SAIL record",
    note: "He lit Coke Oven Battery No. 1 on November 23, 1959, and sat on the dais at the first blast furnace's inauguration. SAIL's caption prints his name as Mr KK Sen; the memoir writes K K Sen and names him Karunaketan Sen, a senior ICS officer of the West Bengal Government, who headed the project during construction.", sources: [SRC.history, SRC.memoir] },
  { id: "niyogi", name: "P C Niyogi", era: "gm", title: "General Manager", when: "General Manager in February 1961", sort: "1961-02", photo: "queenNiyogi", basis: "SAIL record",
    note: "He received Queen Elizabeth II in February 1961. The memoir, which spells the name Neogi, says he succeeded K K Sen and was a civil engineer of the Indian Railway Engineering Service.", sources: [SRC.history, SRC.memoir] },
  { id: "bell", name: "D J Bell", era: "gm", title: "General Superintendent, then General Manager", when: "General Manager for nearly three years, and in the post on January 11, 1964", sort: "1964-01", photo: "shastriBell", basis: "SAIL record",
    note: "Pictured with Lal Bahadur Shastri. The memoir says he had been the chief executive of ISCON, the British consortium, before he was made General Superintendent of the plant, and that he later became General Manager.", sources: [SRC.history, SRC.memoir] },
  { id: "chatterjee", name: "R K Chatterjee", era: "gm", title: "General Manager", when: "after D J Bell (no date given)", sort: "1965-06", photo: null, basis: "Memoir",
    note: "The memoir describes him as the first insider, a mechanical engineer who had worked at Burnpur, to become General Manager. No SAIL record with his name was found.", sources: [SRC.memoir] },
  { id: "banerjee", name: "A N Banerjee", era: "gm", title: "Deputy General Manager, later Resident Director", when: "in the 1960s (no date given)", sort: "1967-06", photo: null, basis: "Memoir",
    note: "Deputy General Manager during construction; later, the memoir says, General Manager of Rourkela and, for a time, also Resident Director of Durgapur. No SAIL record with his name was found.", sources: [SRC.memoir] },
  { id: "wadhera", name: "Major General B P Wadhera", era: "dic", title: "Director-in-Charge", when: "Director-in-Charge in 1970", sort: "1970", photo: "indiraWadhera", basis: "SAIL record",
    note: "Pictured with Prime Minister Indira Gandhi. The memoir says he came from the Army Staff College, Pune, while R K Chatterjee still held the post of General Manager.", sources: [SRC.history, { ...SRC.cities, page: "p. 86" }, SRC.memoir] },
  { id: "tulpule", name: "Bhagaram Tulpule", era: "md", title: "Managing Director", when: "early 1970s (no date given)", sort: "1972", photo: null, basis: "Memoir",
    note: "The memoir says Steel Minister Mohan Kumaramangalam chose him, from outside the industry, as Managing Director of Durgapur. No SAIL record with his name was found.", sources: [SRC.memoir] },
  { id: "paul", name: "P K Paul", era: "md", title: "Head of the plant (\"CEO\" in the memoir)", when: "no date given", sort: "1975", photo: null, basis: "Memoir",
    note: "The memoir calls him \"another great CEO of Durgapur\". The memoir gives neither his title in full nor his years; no SAIL record with his name was found.", sources: [SRC.memoir] },
  { id: "sbsingh", name: "S B Singh", era: "md", title: "Managing Director", when: "Managing Director in April 1997", sort: "1997-04", photo: null, basis: "Press report",
    note: "He is named as the plant's managing director in a note to all departments setting the 1997-98 targets after the Rs 4,500 crore modernisation.", sources: [SRC.bs97] },
  { id: "shyam", name: "V Shyamsundar", era: "md", title: "Managing Director", when: "until October 31, 2009", sort: "2009-10", photo: null, basis: "SAIL report",
    note: "He handed over to P K Bajaj at Ispat Bhawan, Durgapur Steel Plant, on October 31, 2009.", sources: [SRC.bajaj] },
  { id: "bajaj", name: "Punkaj Kumar Bajaj", era: "md", title: "Managing Director, SAIL, Durgapur Steel Plant", when: "from November 1, 2009", sort: "2009-11", photo: null, basis: "SAIL report",
    note: "A metallurgical engineer, he began at Rourkela Steel Plant in 1974. Before this post he was Executive Director (Operations) and In-charge, Special Steels, at the SAIL Corporate Office. How long he held the post is not in the sources read.", sources: [SRC.bajaj] },
  { id: "pksingh", name: "Prakash Kumar Singh", era: "ceo", title: "Chief Executive Officer", when: "May 2012 to December 2015", sort: "2012-05", photo: null, basis: "SAIL report",
    note: "A metallurgical engineer (IIT Roorkee) and an expert in blast furnaces, he began at Bokaro in 1980. He was given additional charge of IISCO Steel Plant in July 2015 and became Chairman of SAIL on December 10, 2015.", sources: [SRC.pkSingh] },
  { id: "rath", name: "Arun Kumar Rath", era: "ceo", title: "Chief Executive Officer", when: "from March 2016", sort: "2016-03", photo: null, basis: "Press report",
    note: "An electrical engineer (NIT Rourkela), he began at Rourkela Steel Plant in 1982 and was Executive Director (Projects) at IISCO Steel Plant before this post. How long he held the post is not in the sources read.", sources: [SRC.rath, SRC.bs16] },
  { id: "dasgupta", name: "Anirban Dasgupta", era: "ceo", title: "CEO (additional charge of DSP and ASP)", when: "October 2018, and again with Bhilai from June 2019", sort: "2018-10", photo: null, basis: "SAIL report",
    note: "As CEO of IISCO Steel Plant he was given additional charge of DSP and ASP in October 2018; in June 2019 he became CEO of Bhilai Steel Plant with additional charge of DSP and ASP.", sources: [SRC.dasgupta] },
  { id: "kamlakar", name: "A V Kamlakar", era: "ceo", title: "CEO (ISP, DSP & ASP)", when: "September 2019", sort: "2019-09", photo: null, basis: "SAIL report",
    note: "Shown as CEO of the three plants in a post by SAIL Durgapur Steel Plant in September 2019. His start and end dates are not in the sources read.", sources: [SRC.dspPost] },
  { id: "bpsingh", name: "Brijendra Pratap Singh", era: "dic2", title: "Director In-charge (Burnpur and Durgapur Steel Plants)", when: "April 19, 2022 to January 2025", sort: "2022-04", photo: null, basis: "Annual report",
    note: "He was appointed to the Board with effect from April 19, 2022; the annual report for 2024-25 shows him as Director up to January 8, 2025. According to the annual report, he is a mining engineer (B.Tech, Mining Engineering).", sources: [{ ...SRC.ar23, page: "Board's Report" }, { ...SRC.ar25, page: "Board's Report" }] },
  { id: "interim", name: "Anirban Dasgupta and Alok Verma", era: "dic2", title: "Holding charge in turn", when: "January to July 2025", sort: "2025-01", photo: null, basis: "Annual report",
    note: "After B P Singh the post was held by additional charge: the 2024-25 report names Anirban Dasgupta; the 2025-26 report names him as Link Officer from April 8 to 30, 2025, and Alok Verma, Director In-charge of Rourkela, as holding additional charge from April 8 to July 14, 2025.", sources: [{ ...SRC.ar25, page: "Board's Report" }, { ...SRC.ar26, page: "Board's Report" }] },
  { id: "mishra", name: "Surajit Mishra", era: "dic2", title: "Director In-charge (Burnpur and Durgapur Steel Plants)", when: "from July 15, 2025", sort: "2025-07", photo: "mishra", basis: "Annual report",
    note: "He was appointed Director (In-charge, Burnpur and Durgapur Steel Plants) from July 15, 2025. Before this he had been Chief General Manager (Maintenance) at Durgapur Steel Plant from July 1, 2022, and had led the revival of VISL.", sources: [{ ...SRC.ar26, page: "Board's Report" }, { ...SRC.ar25, page: "Board's Report" }] },
];
/** where the sources leave a gap between two heads: said in words, never filled */
export const HEAD_GAPS: ReadonlyArray<{ after: string; text: string }> = [
  { after: "paul", text: "Between the 1970s and 1997, no further names were found in the sources read. DSP's own records (the heads' board, its souvenirs) would fill this." },
  { after: "bajaj", text: "No name was found for the time between P K Bajaj's appointment in November 2009 and P K Singh's in May 2012." },
  { after: "rath", text: "How long A K Rath served, and who followed him until October 2018, is not in the sources read." },
  { after: "kamlakar", text: "From late 2019 to April 2022, no further name was found." },
];
export const HEADS_BASIS_NOTE = "The names, titles and dates are as the sources give them. SAIL's own photographs and reports confirm K K Sen, P C Niyogi, D J Bell and B P Wadhera by name; the order of the early heads, and R K Chatterjee, A N Banerjee, Bhagaram Tulpule and P K Paul, are from a memoir by a former Hindustan Steel and SAIL officer and are marked \"Memoir\". DSP's own record of its heads would complete the list.";
/** the pictures of the heads: where the plant has a face to show, it is a photograph from SAIL; elsewhere the card shows initials and says no picture was found */
export const initials = (name: string): string => {
  const words = name.replace(/\(.*?\)/g, " ").replace(/\band\b.*$/i, "").replace(/\./g, " ").split(/\s+/).filter((w) => /^[A-Z]/.test(w) && !/^(Major|General|Shri|Dr|Smt|Mr)$/.test(w));
  return words.length === 0 ? "" : words.length === 1 ? words[0][0] : words[0][0] + words[words.length - 1][0];
};
export const eraOf = (id: EraId): Era => ERAS.find((e) => e.id === id)!;
export const headsByEra = (): Array<{ era: Era; heads: Head[] }> => ERAS.map((e) => ({ era: e, heads: HEADS.filter((h) => h.era === e.id) })).filter((x) => x.heads.length > 0);

// ---------------------------------------------------------------- SAIL AND ITS UNITS
export const SAIL_STORY: ReadonlyArray<{ when: string; what: string; source: Source[] }> = [
  { when: "January 19, 1954", what: "Hindustan Steel Limited is set up, to manage the plant coming up at Rourkela. From April 1957 it also supervised Bhilai and Durgapur. Its registered office moved from New Delhi to Calcutta in July 1956 and to Ranchi in December 1959.", source: [SRC.history, { ...SRC.sailManual, page: "p. 33" }] },
  { when: "January 1964", what: "Bokaro Steel Limited is incorporated to build the Bokaro plant.", source: [{ ...SRC.sailManual, page: "p. 33" }] },
  { when: "1971 to December 1972", what: "A holding company for steel is considered by the Committee on Public Undertakings of the Fifth Lok Sabha and in the Department of Steel; the policy statement is placed before Parliament on December 2, 1972, and the formation of SAIL is approved in December 1972.", source: [SRC.history, { ...SRC.sailManual, page: "pp. 33-34" }] },
  { when: "January 24, 1973", what: "The Steel Authority of India Limited (SAIL) is incorporated, with an authorised capital of Rs 2,000 crore, to manage the five integrated plants (Bhilai, Bokaro, Durgapur, Rourkela and Burnpur), the Alloy Steels Plant and the Salem Steel Plant. January 24 is celebrated every year as SAIL Day.", source: [SRC.history] },
  { when: "1978", what: "SAIL is restructured as an operating company; on May 1, 1978 Bokaro Steel Limited merges with it.", source: [SRC.history, { ...SRC.sailManual, page: "p. 40" }] },
  { when: "August 18, 1989", what: "Visvesvaraya Iron & Steel Limited becomes a SAIL subsidiary.", source: [{ ...SRC.cities, page: "p. 5" }] },
  { when: "February 16, 2006", what: "IISCO is amalgamated with SAIL and renamed IISCO Steel Plant (ISP).", source: [{ ...SRC.sailManual, page: "p. 40" }] },
  { when: "July 12, 2011", what: "Chandrapur Ferro Alloy Plant becomes a unit of SAIL.", source: [{ ...SRC.sailManual, page: "p. 34" }] },
];
export interface Unit { id: string; name: string; short: string; where: string; kind: "Integrated steel plant" | "Special steel plant" | "Ferro alloy plant" | "Other unit"; partner: string | null; began: string; today: string; source: Source[]; dsp?: boolean }
export const UNITS: readonly Unit[] = [
  { id: "bsp", name: "Bhilai Steel Plant", short: "BSP", where: "Chhattisgarh", kind: "Integrated steel plant", partner: "USSR (agreement signed February 2, 1955)", began: "Coke Oven Battery No. 1 on January 31, 1959; Blast Furnace No. 1 on February 4, 1959", today: "Hot metal 7.5, crude steel 7.0, saleable steel 6.56 MT a year after expansion; heavy rails, structurals, wire rods, plates", source: [{ ...SRC.sailManual, page: "pp. 35-36" }] },
  { id: "rsp", name: "Rourkela Steel Plant", short: "RSP", where: "Odisha", kind: "Integrated steel plant", partner: "Germany (a consortium of Thyssen and Demag; agreement signed December 31, 1953)", began: "Coke Oven Battery No. 1 on December 3, 1958; Blast Furnace No. 1 on February 3, 1959", today: "Hot metal 4.5, crude steel 4.2, saleable steel 3.9 MT a year after expansion; the first plant in Asia with the basic oxygen process; flat products and pipes", source: [{ ...SRC.sailManual, page: "pp. 36-38" }] },
  { id: "dsp", name: "Durgapur Steel Plant", short: "DSP", where: "West Bengal", kind: "Integrated steel plant", partner: "Britain (the ISCON consortium of British companies; contract signed October 1956)", began: "Blast Furnace No. 1 inaugurated on December 26, 1959; first ingot April 24, 1960", today: "Hot metal 2.45, crude steel 2.20, saleable steel 2.12 MT a year; merchant products, structurals, forged wheels and axles, semis", source: [SRC.about, SRC.cities], dsp: true },
  { id: "bsl", name: "Bokaro Steel Plant", short: "BSL", where: "Jharkhand", kind: "Integrated steel plant", partner: "USSR (agreement signed January 25, 1965)", began: "Construction started April 6, 1968; Blast Furnace No. 1 on October 2, 1972", today: "4.65 MT of liquid steel after modernisation; hot and cold rolled coils, sheets and plates", source: [{ ...SRC.sailManual, page: "pp. 39-40" }] },
  { id: "isp", name: "IISCO Steel Plant, Burnpur", short: "ISP", where: "West Bengal", kind: "Integrated steel plant", partner: "Indian Iron & Steel Company (set up as an enterprise in 1918); amalgamated with SAIL on February 16, 2006", began: "Iron first made at Hirapur (later Burnpur) in 1922", today: "Crude steel capacity of 2.5 MT a year after expansion; Universal Section Mill, Bar Mill, Wire Rod Mill", source: [{ ...SRC.sailManual, page: "pp. 40-42" }] },
  { id: "asp", name: "Alloy Steels Plant, Durgapur", short: "ASP", where: "West Bengal", kind: "Special steel plant", partner: null, began: "Commissioned for 1,00,000 tonnes of ingot steel a year", today: "Over 400 grades: alloy, stainless, armour and naval steels; the country's only slab-cum-twin bloom caster of its kind", source: [{ ...SRC.sailManual, page: "pp. 42-43" }] },
  { id: "ssp", name: "Salem Steel Plant", short: "SSP", where: "Tamil Nadu", kind: "Special steel plant", partner: null, began: "Commissioned in 1981", today: "Stainless steel coils, sheets and blanks", source: [{ ...SRC.sailManual, page: "p. 43" }] },
  { id: "visp", name: "Visvesvaraya Iron & Steel Plant, Bhadravati", short: "VISP", where: "Karnataka", kind: "Special steel plant", partner: null, began: "Became a SAIL subsidiary on August 18, 1989", today: "Alloy and special steels and pig iron", source: [{ ...SRC.sailManual, page: "p. 44" }, { ...SRC.cities, page: "p. 5" }] },
  { id: "cfp", name: "Chandrapur Ferro Alloy Plant", short: "CFP", where: "Maharashtra", kind: "Ferro alloy plant", partner: null, began: "A unit of SAIL from July 12, 2011 (earlier Maharashtra Elektrosmelt Ltd)", today: "The only public-sector maker of manganese-based ferro alloys in the country", source: [{ ...SRC.sailManual, page: "pp. 34, 44" }] },
];
/** SAIL's other bodies, as the SAIL manual lists them */
export const OTHER_BODIES: ReadonlyArray<{ name: string; detail: string; page: string }> = [
  { name: "Captive mines", detail: "SAIL has the second largest mining outfit in the country after Coal India", page: "p. 45" },
  { name: "SAIL Refractory Unit", detail: "formerly Bharat Refractory Limited, merged with SAIL from April 2007", page: "pp. 44-45" },
  { name: "Central Marketing Organisation", detail: "India's largest industrial marketing set-up; regional offices, branch sales offices and warehouses across the country", page: "pp. 46-47" },
  { name: "Research & Development Centre for Iron & Steel (RDCIS), Ranchi", detail: "set up in 1972", page: "p. 48" },
  { name: "Management Training Institute (MTI), Ranchi", detail: "set up in 1962", page: "pp. 49-50" },
  { name: "Centre for Engineering & Technology (CET), Ranchi", detail: "started in 1982, with sub-centres at the plants, among them Durgapur", page: "p. 49" },
  { name: "SAIL Safety Organisation, Ranchi", detail: "set up in 1988", page: "pp. 48-49" },
  { name: "SAILCON", detail: "SAIL's consultancy arm, with assignments abroad", page: "p. 47" },
  { name: "Central Coal Supply Organisation (CCSO), Dhanbad", detail: "moves washed coking coal to the plants, Durgapur included", page: "pp. 45-46" },
];
export const SAIL_NOW = "SAIL's five integrated steel plants and three special steel plants employ more than 62,000 trained people (as of April 1, 2022); in 2021-22 it recorded its best-ever production and sales, with revenue from operations of Rs 1,03,473 crore and EBITDA of Rs 22,364 crore (SAIL JO Manual, p. 34).";

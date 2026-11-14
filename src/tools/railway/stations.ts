// src/tools/railway/stations.ts
//
// THE FULL NAME AND THE PLACE OF A STATION, for the code the railway uses ("HWH", "KOAA", "PRRB"), so that the card can say "Howrah Junction (HWH), Howrah, West Bengal" and the reader need not decipher a code.
// RailRadar's answer gives each end of a train as a code and a short name ("Howrah Jn", "Kolkatta Terminal"), but no city or state, and a few names are misspelt; this table holds the stations that appear at the ends of the
// trains that stop at Durgapur (the 77 of 13 Nov 2026). The CODE IS ALWAYS KEPT beside the name (it is what a ticket and the railway's own boards show).
// Names carry no brackets of their own (the code is printed in brackets beside them). A station that is not in the table is shown by the name RailRadar gives, with no place: nothing is guessed. Pratapnagar (PRTN, Vadodara, Gujarat) was added on the owner's word (14 Nov 2026), not from a source the tool read. A JUNCTION is a station whose official name carries "Junction" (RailRadar writes "Jn"); the card marks it. Nothing else is called a junction here (Agra Cantt, Malda Town and Jhajha are junctions in practice but not by name, so they are not marked).
export interface Station {
  /** the full name, "Jn" written out */
  name: string;
  /** the city or town, and the state (the city is left out when it is the state: Delhi) */
  city: string;
  state: string;
}

const S = (name: string, city: string, state: string): Station => ({ name, city, state });

export const STATIONS: Record<string, Station> = {
  // West Bengal
  HWH: S("Howrah Junction", "Howrah", "West Bengal"),
  SHM: S("Shalimar", "Howrah", "West Bengal"),
  KOAA: S("Kolkata Chitpur", "Kolkata", "West Bengal"),
  SDAH: S("Sealdah", "Kolkata", "West Bengal"),
  BWN: S("Bardhaman Junction", "Bardhaman", "West Bengal"),
  ASN: S("Asansol Junction", "Asansol", "West Bengal"),
  UDL: S("Andal Junction", "Andal", "West Bengal"),
  DGR: S("Durgapur", "Durgapur", "West Bengal"),
  SURI: S("Siuri", "Suri", "West Bengal"),
  MLDT: S("Malda Town", "Malda", "West Bengal"),
  NJP: S("New Jalpaiguri Junction", "Siliguri", "West Bengal"),
  DGHA: S("Digha", "Digha", "West Bengal"),
  // Bihar
  PNBE: S("Patna Junction", "Patna", "Bihar"),
  RJPB: S("Rajendra Nagar Terminal", "Patna", "Bihar"),
  RXL: S("Raxaul Junction", "Raxaul", "Bihar"),
  JYG: S("Jaynagar", "Jaynagar", "Bihar"),
  DBG: S("Darbhanga Junction", "Darbhanga", "Bihar"),
  SMI: S("Sitamarhi Junction", "Sitamarhi", "Bihar"),
  MFP: S("Muzaffarpur Junction", "Muzaffarpur", "Bihar"),
  BJU: S("Barauni Junction", "Barauni", "Bihar"),
  MBI: S("Madhubani", "Madhubani", "Bihar"),
  LKQ: S("Laukaha Bazar", "Laukaha", "Bihar"),
  GGH: S("Ghogardiha", "Ghogardiha", "Bihar"),
  ARA: S("Ara Junction", "Arrah", "Bihar"),
  BTH: S("Bettiah", "Bettiah", "Bihar"),
  MKA: S("Mokama Junction", "Mokama", "Bihar"),
  THE: S("Thawe Junction", "Thawe", "Bihar"),
  JAJ: S("Jhajha", "Jhajha", "Bihar"),
  GAYA: S("Gaya Junction", "Gaya", "Bihar"),
  // Jharkhand
  DHN: S("Dhanbad Junction", "Dhanbad", "Jharkhand"),
  RNC: S("Ranchi Junction", "Ranchi", "Jharkhand"),
  HTE: S("Hatia", "Ranchi", "Jharkhand"),
  BKSC: S("Bokaro Steel City", "Bokaro", "Jharkhand"),
  JSME: S("Jasidih Junction", "Jasidih", "Jharkhand"),
  DGHR: S("Deoghar", "Deoghar", "Jharkhand"),
  // the south and the east coast
  MAS: S("MGR Chennai Central", "Chennai", "Tamil Nadu"),
  TBM: S("Tambaram", "Chennai", "Tamil Nadu"),
  SMVB: S("Sir M. Visvesvaraya Terminal", "Bengaluru", "Karnataka"),
  ERS: S("Ernakulam Junction", "Kochi", "Kerala"),
  PURI: S("Puri", "Puri", "Odisha"),
  KUR: S("Khurda Road Junction", "Khurda", "Odisha"),
  // Assam
  KYQ: S("Kamakhya Junction", "Guwahati", "Assam"),
  SHTT: S("Silghat Town", "Silghat", "Assam"),
  NTSK: S("New Tinsukia Junction", "Tinsukia", "Assam"),
  // Delhi, Punjab and the north
  NDLS: S("New Delhi", "Delhi", "Delhi"),
  ANVT: S("Anand Vihar Terminal", "Delhi", "Delhi"),
  SSB: S("Shakurbasti", "Delhi", "Delhi"),
  ASR: S("Amritsar Junction", "Amritsar", "Punjab"),
  LDH: S("Ludhiana Junction", "Ludhiana", "Punjab"),
  JAT: S("Jammu Tawi", "Jammu", "Jammu and Kashmir"),
  KLK: S("Kalka", "Kalka", "Haryana"),
  YNRK: S("Yog Nagari Rishikesh", "Rishikesh", "Uttarakhand"),
  KGM: S("Kathgodam", "Haldwani", "Uttarakhand"),
  LKU: S("Lalkuan Junction", "Lalkuan", "Uttarakhand"),
  // Uttar Pradesh
  GKP: S("Gorakhpur Junction", "Gorakhpur", "Uttar Pradesh"),
  BNRS: S("Banaras", "Varanasi", "Uttar Pradesh"),
  GCT: S("Ghazipur City", "Ghazipur", "Uttar Pradesh"),
  BUI: S("Ballia", "Ballia", "Uttar Pradesh"),
  MAU: S("Mau Junction", "Mau", "Uttar Pradesh"),
  AMH: S("Azamgarh", "Azamgarh", "Uttar Pradesh"),
  PRRB: S("Prayagraj Rambag", "Prayagraj", "Uttar Pradesh"),
  CNB: S("Kanpur Central", "Kanpur", "Uttar Pradesh"),
  AGC: S("Agra Cantt", "Agra", "Uttar Pradesh"),
  MTJ: S("Mathura Junction", "Mathura", "Uttar Pradesh"),
  AMG: S("Alamnagar", "Lucknow", "Uttar Pradesh"),
  // Madhya Pradesh, Rajasthan, Gujarat, Maharashtra
  GWL: S("Gwalior Junction", "Gwalior", "Madhya Pradesh"),
  BPL: S("Bhopal Junction", "Bhopal", "Madhya Pradesh"),
  INDB: S("Indore Junction", "Indore", "Madhya Pradesh"),
  JBP: S("Jabalpur Junction", "Jabalpur", "Madhya Pradesh"),
  KWP: S("Khatipura", "Jaipur", "Rajasthan"),
  BKN: S("Bikaner Junction", "Bikaner", "Rajasthan"),
  AII: S("Ajmer Junction", "Ajmer", "Rajasthan"),
  MDJN: S("Madar Junction", "Madar", "Rajasthan"),
  ADI: S("Ahmedabad Junction", "Ahmedabad", "Gujarat"),
  ST: S("Surat", "Surat", "Gujarat"),
  PRTN: S("Pratapnagar", "Vadodara", "Gujarat"),
  CSMT: S("Chhatrapati Shivaji Maharaj Terminus", "Mumbai", "Maharashtra"),
};

export interface StationLabel {
  code: string;
  /** the full name (RailRadar's own when the station is not in the table) */
  name: string;
  /** "Howrah, West Bengal", "Delhi"; null when the station is not in the table */
  place: string | null;
  /** a junction: the official name carries "Junction" (or the source's name carries "Jn") */
  junction: boolean;
}

const JUNCTION = /\bJunction\b|\bJn\b\.?/;

/** the label of a station: the table's name and place when it has the code, else the name RailRadar gave and no place */
export function stationLabel(code: string, railRadarName: string): StationLabel {
  const s = STATIONS[code];
  if (!s) return { code, name: railRadarName, place: null, junction: JUNCTION.test(railRadarName) };
  return { code, name: s.name, place: s.city === s.state ? s.state : `${s.city}, ${s.state}`, junction: JUNCTION.test(s.name) };
}

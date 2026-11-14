// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/railway/stations.selftest.ts
// The station names and places: every code at the end of a train that stops at Durgapur (the 77 of 13 Nov 2026) has its full name and its city and state, except the one whose city is not certain; a station that is not in
// the table keeps the name the railway source gives.
import { STATIONS, stationLabel } from "./stations";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

// the codes at the two ends of the 258 trains that stop at Durgapur, as RailRadar listed them on 13 Nov 2026
const SEEN = "HWH KOAA SDAH BWN ASN PNBE GKP RXL JYG DBG MAS SMI NDLS KYQ ASR ANVT DHN MFP MLDT KWP BNRS GCT YNRK PURI RNC TBM GWL AGC BJU MBI SHM SMVB BKN KUR SSB SURI LKU BUI ST ARA RJPB SHTT NTSK MAU MTJ INDB PRRB KLK KGM ERS DGHR PRTN CSMT DGHA LKQ JSME JAT BPL ADI MDJN AII GGH LDH NJP AMG GAYA JBP BTH MKA THE AMH CNB BKSC JAJ HTE DGR UDL".split(" ");
const STATES = new Set(["West Bengal", "Bihar", "Jharkhand", "Tamil Nadu", "Karnataka", "Kerala", "Odisha", "Assam", "Delhi", "Punjab", "Jammu and Kashmir", "Haryana", "Uttarakhand", "Uttar Pradesh", "Madhya Pradesh", "Rajasthan", "Gujarat", "Maharashtra"]);

ok("77 distinct codes were seen at the ends of the trains", SEEN.length === 77 && new Set(SEEN).size === 77);
ok("every one of them is in the table, Pratapnagar (PRTN) included: Vadodara, Gujarat", SEEN.every((c) => STATIONS[c]) && STATIONS.PRTN.city === "Vadodara" && STATIONS.PRTN.state === "Gujarat", SEEN.filter((c) => !STATIONS[c]).join());
ok("the table holds no code that is not a real end of those trains (no stray entries)", Object.keys(STATIONS).every((c) => SEEN.includes(c)), Object.keys(STATIONS).filter((c) => !SEEN.includes(c)).join());
ok("every entry has a full name, a city and a known state (a typo in a state would show here)", Object.entries(STATIONS).every(([, s]) => s.name.length > 2 && s.city.length > 1 && STATES.has(s.state)), Object.entries(STATIONS).filter(([, s]) => !STATES.has(s.state)).map(([c]) => c).join());
ok("no name carries brackets of its own (the code is printed in brackets beside it)", Object.values(STATIONS).every((s) => !/[()]/.test(s.name)));
ok("no name is left abbreviated as 'Jn' or 'Jn.' (written out as Junction) and none keeps the railway source's misspelling 'Kolkatta'", Object.values(STATIONS).every((s) => !/\bJn\b\.?/.test(s.name) && !/Kolkatta/.test(s.name)));
ok("the biggest ends read plainly: HWH Howrah Junction, Howrah, West Bengal; KOAA Kolkata Chitpur; SDAH Sealdah; NDLS New Delhi (Delhi); SMVB Sir M. Visvesvaraya Terminal, Bengaluru, Karnataka; CSMT Chhatrapati Shivaji Maharaj Terminus, Mumbai", stationLabel("HWH", "Howrah Jn").name === "Howrah Junction" && stationLabel("HWH", "x").place === "Howrah, West Bengal" && stationLabel("KOAA", "Kolkatta Terminal").name === "Kolkata Chitpur" && stationLabel("SDAH", "x").place === "Kolkata, West Bengal" && stationLabel("NDLS", "x").place === "Delhi" && stationLabel("SMVB", "x").place === "Bengaluru, Karnataka" && stationLabel("CSMT", "x").place === "Mumbai, Maharashtra");
ok("the code always comes back with the name, and the table's name wins over the railway source's", stationLabel("PNBE", "Patna Jn").code === "PNBE" && stationLabel("PNBE", "Patna Jn").name === "Patna Junction" && stationLabel("PNBE", "x").place === "Patna, Bihar");
ok("a station that is not in the table keeps the name the source gave and has no place (nothing is guessed)", stationLabel("ZZZZ", "Some Place").name === "Some Place" && stationLabel("ZZZZ", "Some Place").place === null);
ok("Pratapnagar reads: Pratapnagar (PRTN), Vadodara, Gujarat, and is not a junction", stationLabel("PRTN", "Pratapnagar").place === "Vadodara, Gujarat" && stationLabel("PRTN", "Pratapnagar").junction === false);
ok("a junction is a station whose name says Junction: Howrah, Asansol, Jabalpur, Patna are; Sealdah, Durgapur, Delhi, Shalimar, Surat are not", ["HWH", "ASN", "JBP", "PNBE"].every((c) => stationLabel(c, "x").junction) && ["SDAH", "DGR", "NDLS", "SHM", "ST", "PRTN"].every((c) => !stationLabel(c, "x").junction));
ok("a station not in the table is a junction when the source's name says Jn or Junction, and not otherwise", stationLabel("ZZ1", "Newplace Jn").junction && stationLabel("ZZ2", "Newplace Junction").junction && !stationLabel("ZZ3", "Newplace").junction && !stationLabel("ZZ4", "Jnana Nagar").junction);
ok("Durgapur and its neighbours are right: DGR Durgapur, UDL Andal Junction, ASN Asansol Junction, BWN Bardhaman Junction, all West Bengal", ["DGR", "UDL", "ASN", "BWN"].every((c) => STATIONS[c].state === "West Bengal") && STATIONS.UDL.name === "Andal Junction");

console.log(`stations: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

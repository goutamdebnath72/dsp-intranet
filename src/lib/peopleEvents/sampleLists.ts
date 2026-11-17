// src/lib/peopleEvents/sampleLists.ts
//
// THE SAMPLE LISTS OF THE BIRTHDAY AND RETIREMENT (SUPERANNUATION) TABS OF THE HOME PAGE: the five sample people of each list, with the photos kept in the project's public folder
// (public/Eleanor_Vance.jpeg and so on). They were the lists of the first version of the widget; the owner asked on 17 Nov 2026 for them back on those two tabs.
// The Silver Jubilee tab is not here: it still comes from the database. To show the real birthdays and retirements from the database again, set USE_SAMPLE_LISTS to false: nothing else changes
// (the API, the query and the hook are still in place and still feed the Silver Jubilee tab).
import { isoDay, todayIST } from "./rules";
import type { PersonEvent } from "./query";

export const USE_SAMPLE_LISTS = true;

/** Birthdays today: the card shows no date. */
export const SAMPLE_BIRTHDAYS: PersonEvent[] = [
  { id: 1, name: "Eleanor Vance", designation: "Chief General Manager", department: "R&D Lab", imageUrl: "/Eleanor_Vance.jpeg", on: null },
  { id: 2, name: "Sophia Clarke", designation: "General Manager", department: "HR", imageUrl: "/Sophia_Clarke.jpeg", on: null },
  { id: 3, name: "Olivia Reed", designation: "Dy. General Manager", department: "Finance & A/C", imageUrl: "/Olivia_Reed.jpeg", on: null },
  { id: 4, name: "Arthur Finch", designation: "Sr. Manager", department: "Maintenance", imageUrl: "/Arthur_Finch.jpeg", on: null },
  { id: 5, name: "Benjamin Hayes", designation: "Asst. General Manager", department: "IT", imageUrl: "/Benjamin_Hayes.jpeg", on: null },
];

const RETIRING: Omit<PersonEvent, "on">[] = [
  { id: 1, name: "Matthias Schmidt", designation: "Executive Director", department: "Quality Control", imageUrl: "/Matthias_Schmidt.jpeg" },
  { id: 2, name: "Antoine Leclerc", designation: "Dy. General Manager", department: "Logistics", imageUrl: "/Antoine_Leclerc.jpeg" },
  { id: 3, name: "Ingrid Bergman", designation: "Director(M-HS)", department: "Safety & Health", imageUrl: "/Ingrid_Bergman.jpeg" },
  { id: 4, name: "Natalia Petrova", designation: "Manager", department: "Security", imageUrl: "/Natalia_Petrova.jpeg" },
  { id: 5, name: "Sofia Karlsson", designation: "Asst. General Manager", department: "Public Relations", imageUrl: "/Sofia_Karlsson.jpeg" },
];

/** Retirements this month: each farewell is the last day of the current month (in India), as the sample list always showed. */
export const sampleRetirements = (): PersonEvent[] => {
  const monthEnd = isoDay(todayIST().endOf("month").startOf("day"));
  return RETIRING.map((p) => ({ ...p, on: monthEnd }));
};

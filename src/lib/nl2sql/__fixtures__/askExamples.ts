// src/lib/nl2sql/__fixtures__/askExamples.ts
//
// The clarifying questions that step 49a used to ask for "garage" and "refractory" (until step 55a resolved those words instead). The checkbox question itself stays in the app (departmentAsk.ts,
// ClarifyChoices.tsx) for any future word that really has to be asked about, and these examples keep it tested: three real department rows (so every combination of ticks can be tried against
// namedRows) and one single-option question.

import type { DepartmentAsk } from "../departmentAsk";
import { PLANT_GARAGE_ROWS } from "../departmentWords";

export const refractoryAsk = (question: string, bare = false): DepartmentAsk => ({
  message: "Which department do you mean by \u201Crefractory\u201D? The HR list has three. Tick one or more, then press Continue.",
  word: "refractory",
  question,
  options: [
    { id: "refractory", label: "REFRACTORY (code 86000)", phrase: "REFRACTORY (code 86000)" },
    { id: "office", label: "REFRACTORY (OFFICE) (code 86030)", phrase: "REFRACTORY (OFFICE) (code 86030)" },
    { id: "coke", label: "COKE OVEN REFRACTORY (code 86600)", phrase: "COKE OVEN REFRACTORY (code 86600)" },
  ],
  none: { label: "None of these", reply: "Please type the department's full name, or its code." },
  ...(bare ? { documents: { label: "I am looking for documents (circulars) about \u201Crefractory\u201D instead", query: `circular about ${question.trim()}` } } : {}),
});

export const garageAsk = (question: string, bare = false): DepartmentAsk => ({
  message: "Which department do you mean by \u201Cgarage\u201D? The HR list has one garage department, the Plant Garage (six sections). Tick the one you mean, then press Continue.",
  word: "garage",
  question,
  options: [{ id: "plant", label: "Plant Garage (all its sections)", phrase: PLANT_GARAGE_ROWS }],
  none: { label: "None of these", reply: "If you mean another department, please type its full name." },
  ...(bare ? { documents: { label: "I am looking for documents (circulars) about \u201Cgarage\u201D instead", query: `circular about ${question.trim()}` } } : {}),
});

// src/tools/railway/premium.ts
//
// THE LOOK OF THE PREMIUM TRAINS (shared by the train rows and the fare finder).
/** THE PREMIUM TRAINS. A Vande Bharat or a Shatabdi that stops at Durgapur is told from the rest by a coloured badge in place of the plain class word, a thick coloured edge and a tint on its row (each has its own colour: cyan for Vande Bharat, indigo for Shatabdi). Only the two the railway names so (the label comes from the source's own train type). */
export const PREMIUM: Record<string, { badge: string; row: string; text: string }> = {
  "Vande Bharat": { badge: "bg-cyan-600 text-white", row: "border-cyan-200 border-l-[5px] border-l-cyan-600 bg-cyan-50/70", text: "VANDE BHARAT" },
  Shatabdi: { badge: "bg-indigo-600 text-white", row: "border-indigo-200 border-l-[5px] border-l-indigo-600 bg-indigo-50/70", text: "SHATABDI" },
};

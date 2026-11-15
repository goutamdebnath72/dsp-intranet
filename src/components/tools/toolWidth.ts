// src/components/tools/toolWidth.ts
//
// WHICH CALCULATOR PAGE NEEDS THE WIDE BOX OF THE SEARCH BAR. A form's ui.tsx says `wide: true` (src/tools/uiTypes.ts) when its page is cramped in the normal width (the PF page: three boxes in a row, and a table of years);
// the box then takes exactly the width that an Executive Deep Synthesis answer with a table of 4 or more columns gets (src/lib/search/edsLayout.ts): the width of the page behind it. A pure function of the form that is open,
// so the box returns to its normal width the moment the form is closed. This file names no topic: it only reads the list of topics.
import { TOPIC_UIS } from "@/tools/registry.ui";

export function toolFormIsWide(form: string | null | undefined): boolean {
  if (!form || form === "menu") return false;
  return TOPIC_UIS.some((t) => t.id === form && !!t.form?.wide);
}

/** the largest width in rem that a form's page asks for (never more than the page itself); null when it asks for the page's whole width, or for nothing */
export function toolFormMaxRem(form: string | null | undefined): number | null {
  if (!form || form === "menu") return null;
  const w = TOPIC_UIS.find((t) => t.id === form)?.form?.wide;
  return typeof w === "object" && w !== null ? w.maxRem : null;
}

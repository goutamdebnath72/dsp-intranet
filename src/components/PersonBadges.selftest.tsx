// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/PersonBadges.selftest.tsx
// The badges after a name: EXE as before, PhD only for the listed non-medical PhD holders, nothing for anyone else.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PersonBadges } from "./PersonBadges";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const h = (el: React.ReactElement) => renderToStaticMarkup(el);
const EXE = '<span class="ml-2 align-middle rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">EXE</span>';

ok("an executive: the EXE badge, exactly as before, and no PhD", h(<PersonBadges isExecutive />) === EXE, h(<PersonBadges isExecutive />));
ok("an executive with a PhD: EXE first, then PhD", /EXE<\/span><span[^>]*>PhD<\/span>$/.test(h(<PersonBadges isExecutive phd />)) && h(<PersonBadges isExecutive phd />).startsWith(EXE));
ok("a non-executive with a PhD: only PhD", /^<span[^>]*>PhD<\/span>$/.test(h(<PersonBadges phd />)) && !/EXE/.test(h(<PersonBadges phd />)));
ok("nobody special: nothing at all", h(<PersonBadges />) === "" && h(<PersonBadges isExecutive={false} phd={false} />) === "");
ok("the PhD badge says in words what it is", /title="Holds a PhD"/.test(h(<PersonBadges phd />)));
ok("it is a different colour from EXE and neither red nor green", /bg-sky-100/.test(h(<PersonBadges phd />)) && !/amber|red|green|emerald/.test(h(<PersonBadges phd />)));
ok("a doctor (no phd flag, only the Dr. title on the name) gets no PhD badge", !/PhD/.test(h(<PersonBadges isExecutive />)));
ok("a missing flag is the same as false", h(<PersonBadges isExecutive phd={undefined} />) === EXE);

// ---- step 53a: the discipline chip beside EXE
ok("a doctor with a discipline: EXE first, then the discipline chip, then nothing else", /^<span[^>]*>EXE<\/span><span title="Discipline"[^>]*>Medicine<\/span>$/.test(h(<PersonBadges isExecutive discipline="Medicine" />)), h(<PersonBadges isExecutive discipline="Medicine" />));
ok("the chip says in words what it is, and has its own colour (not EXE's amber, not PhD's sky)", /title="Discipline"/.test(h(<PersonBadges discipline="ENT" />)) && /bg-teal-100/.test(h(<PersonBadges discipline="ENT" />)) && !/amber|sky/.test(h(<PersonBadges discipline="ENT" />)));
ok("the order is EXE, discipline, PhD", /EXE<\/span><span[^>]*>Surgery<\/span><span[^>]*>PhD<\/span>$/.test(h(<PersonBadges isExecutive discipline="Surgery" phd />)));
ok("no discipline (unknown, empty, null): no chip, and the EXE badge is exactly as before", h(<PersonBadges isExecutive discipline={null} />) === EXE && h(<PersonBadges isExecutive discipline="" />) === EXE && h(<PersonBadges isExecutive discipline={undefined} />) === EXE);
ok("a non-executive doctor: just the chip", /^<span title="Discipline"[^>]*>Paediatrics<\/span>$/.test(h(<PersonBadges discipline="Paediatrics" />)));
ok("the discipline text is escaped", !h(<PersonBadges discipline="<b>x</b>" />).includes("<b>"));
ok("a long discipline is shown whole", h(<PersonBadges discipline="Obstetrics and Gynaecology (DGO)" />).includes("Obstetrics and Gynaecology (DGO)"));

console.log(`PersonBadges selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// src/lib/ui/inkShift.selftest.ts
// Run:  npx tsx src/lib/ui/inkShift.selftest.ts
import { inkShift } from "./inkShift";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// a text laid out starting at x=10, baseline y=14; its ink starts 1px right of the origin (left = -1), ends 5px right of it, rises 9px above the
// baseline and does not go below it
const ink = { left: -1, right: 5, ascent: 9, descent: 0 };
const base = { originX: 10, baselineY: 14, ink };

let r = inkShift({ ...base, targetX: 13, targetY: 9.5, dpr: 4 });
check("edges exactly centred: no move", near(r.dx, 0) && near(r.dy, 0), JSON.stringify(r));
r = inkShift({ ...base, targetX: 14, targetY: 9.5, dpr: 4 });
check("ink 1px LEFT of the target: move it right by 1", near(r.dx, 1) && near(r.dy, 0), JSON.stringify(r));
r = inkShift({ ...base, targetX: 13, targetY: 11, dpr: 4 });
check("ink 1.5px ABOVE the target: move it down by 1.5", near(r.dx, 0) && near(r.dy, 1.5), JSON.stringify(r));
r = inkShift({ ...base, targetX: 12, targetY: 8, dpr: 4 });
check("ink right of / below the target: negative moves", near(r.dx, -1) && near(r.dy, -1.5), JSON.stringify(r));
r = inkShift({ originX: 10, baselineY: 14, ink: { left: 1, right: 5, ascent: 8, descent: 2 }, targetX: 12, targetY: 11, dpr: 4 });
check("ink reaching left of the origin and below the baseline: centre = origin + (right-left)/2, baseline + (descent-ascent)/2", near(r.dx, 0) && near(r.dy, 0), JSON.stringify(r));

// the centre of WEIGHT: a "1" is a heavy stem with a light flag on its left. Its edges span x=10..16 (middle 13) but its weight sits at 14.2
const one = { left: 0, right: 6, ascent: 9, descent: 0, weightX: 4.2 };
r = inkShift({ originX: 10, baselineY: 14, ink: one, targetX: 13, targetY: 9.5, dpr: 4 });
check("with a centre of weight, THAT is what gets centred (weight at 14.2, target 13: move left 1.2), not the edges (which are already centred)", near(r.dx, -1.2) || near(r.dx, -1.25), JSON.stringify(r));
r = inkShift({ originX: 10, baselineY: 14, ink: { ...one, weightX: 3 }, targetX: 13, targetY: 9.5, dpr: 4 });
check("a symmetrical digit (weight at the middle of its edges): no horizontal move", near(r.dx, 0), JSON.stringify(r));
check("without a centre of weight the middle of the edges is used, as before", near(inkShift({ ...base, targetX: 14, targetY: 9.5, dpr: 4 }).dx, 1));

// snapping
r = inkShift({ ...base, targetX: 13.3, targetY: 9.8, dpr: 2 });
check("2x screen: moves are snapped to half pixels, both ways (0.3 -> 0.5)", near(r.dx, 0.5) && near(r.dy, 0.5), JSON.stringify(r));
r = inkShift({ ...base, targetX: 13.4, targetY: 9.5, dpr: 3 });
check("3x screen: moves are multiples of 1/3", near(r.dx, 1 / 3), JSON.stringify(r));
r = inkShift({ ...base, targetX: 13.4, targetY: 9.8, dpr: 1 });
check("1x screen: sideways moves go to a QUARTER pixel (0.4 -> 0.5), up/down moves stay whole pixels (0.3 -> 0)", near(r.dx, 0.5) && near(r.dy, 0), JSON.stringify(r));
r = inkShift({ ...base, targetX: 13.3, targetY: 9.5, dpr: 1 });
check("1x screen: 0.3 sideways -> 0.25", near(r.dx, 0.25), JSON.stringify(r));
check("a move smaller than half a device pixel is no move at all (2x screen)", near(inkShift({ ...base, targetX: 13.2, targetY: 9.5, dpr: 2 }).dx, 0));

// different digits need different moves
const narrow = inkShift({ originX: 10, baselineY: 14, ink: { left: -1.5, right: 3.5, ascent: 9, descent: 0, weightX: 2.4 }, targetX: 12, targetY: 9.5, dpr: 4 });
const wide = inkShift({ originX: 10, baselineY: 14, ink: { left: -0.5, right: 6.5, ascent: 9, descent: 0, weightX: 3 }, targetX: 12, targetY: 9.5, dpr: 4 });
check("a narrow '1' and a wide '8' need DIFFERENT horizontal moves", !near(narrow.dx, wide.dx), `${narrow.dx} vs ${wide.dx}`);

console.log(`\ninkShift selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

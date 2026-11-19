// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/converter/holdRepeat.selftest.ts
// Press and hold: one step at once; a short press is one step only; a held press goes on one step at a time until it is let go, and then stops.
import { startHold } from "./holdRepeat";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const later = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function run(): Promise<void> {
  let n = 0;
  const stop = startHold(() => { n++; }, 40, 10);
  ok("a press steps once at once", n === 1);
  let m = 0;
  const stopShort = startHold(() => { m++; }, 40, 10);
  stopShort();
  return later(120).then(() => {
    ok("a short press, let go before the delay, is one step only", m === 1, String(m));
    ok("a held press went on stepping, one step each time (many more than one)", n >= 4, String(n));
    stop();
    const atStop = n;
    stop();
    return later(60).then(() => {
      ok("after it is let go it steps no more (and letting go twice does no harm)", n === atStop, `${n} vs ${atStop}`);
    });
  });
}

run().then(() => {
  console.log(`holdRepeat: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
});

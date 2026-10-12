// src/lib/ui/scrollWhenSettled.selftest.ts
// Run:  npx tsx src/lib/ui/scrollWhenSettled.selftest.ts      (no browser: the images and the clock are stand-ins)
import { isAligned, whenImagesSettled, type ImgLike, type Timers } from "./scrollWhenSettled";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

class FakeImg implements ImgLike {
  listeners: Record<"load" | "error", Array<() => void>> = { load: [], error: [] };
  constructor(public complete: boolean) {}
  addEventListener(type: "load" | "error", cb: () => void) { this.listeners[type].push(cb); }
  removeEventListener(type: "load" | "error", cb: () => void) { this.listeners[type] = this.listeners[type].filter((x) => x !== cb); }
  fire(type: "load" | "error") { this.complete = true; for (const cb of [...this.listeners[type]]) cb(); }
  get attached() { return this.listeners.load.length + this.listeners.error.length; }
}
class FakeTimers implements Timers {
  now = 0;
  next = 1;
  tasks: Array<{ id: number; at: number; cb: () => void }> = [];
  setTimeout(cb: () => void, ms: number) { const id = this.next++; this.tasks.push({ id, at: this.now + ms, cb }); return id; }
  clearTimeout(id: unknown) { this.tasks = this.tasks.filter((t) => t.id !== id); }
  advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      const due = this.tasks.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.tasks = this.tasks.filter((t) => t !== due);
      this.now = due.at;
      due.cb();
    }
    this.now = end;
  }
}

// 1. everything already loaded (a second visit)
{
  const t = new FakeTimers();
  const imgs = [new FakeImg(true), new FakeImg(true)];
  let calls = 0;
  whenImagesSettled(imgs, () => calls++, { timers: t });
  check("all images already loaded: nothing is called at once (always asynchronous)...", calls === 0);
  t.advance(0);
  check("...and once the page has been laid out: called exactly once, with no listeners ever attached", calls === 1 && imgs.every((i) => i.attached === 0));
}
// 2. the first visit: pages above the target arrive one by one
{
  const t = new FakeTimers();
  const imgs = [new FakeImg(false), new FakeImg(false), new FakeImg(false)];
  let calls = 0;
  whenImagesSettled(imgs, () => calls++, { timers: t });
  imgs[2].fire("load");
  imgs[0].fire("load");
  check("the target's own image (the last one) has loaded but two pages above have not: NOT yet (this was the bug)", calls === 0);
  imgs[1].fire("load");
  check("the moment the last page above arrives: called, once", calls === 1);
  check("...and every listener is removed", imgs.every((i) => i.attached === 0));
  t.advance(60_000);
  check("the timeout that was waiting does not call it again", calls === 1);
}
// 3. a page that fails counts as done
{
  const t = new FakeTimers();
  const imgs = [new FakeImg(false), new FakeImg(false)];
  let calls = 0;
  whenImagesSettled(imgs, () => calls++, { timers: t });
  imgs[0].fire("error");
  imgs[1].fire("load");
  check("a page that fails to load does not hold the scroll back for ever", calls === 1);
}
// 4. only the pending ones are waited for
{
  const t = new FakeTimers();
  const imgs = [new FakeImg(true), new FakeImg(false), new FakeImg(true)];
  let calls = 0;
  whenImagesSettled(imgs, () => calls++, { timers: t });
  check("images already loaded are not listened to", imgs[0].attached === 0 && imgs[2].attached === 0 && imgs[1].attached === 2);
  imgs[1].fire("load");
  check("it waits only for the one that was still loading", calls === 1);
}
// 5. never arrives: the timeout
{
  const t = new FakeTimers();
  const imgs = [new FakeImg(false), new FakeImg(false)];
  let calls = 0;
  whenImagesSettled(imgs, () => calls++, { timers: t });
  imgs[0].fire("load");
  t.advance(9_999);
  check("a page that never arrives: still waiting just before the 10 s limit", calls === 0);
  t.advance(1);
  check("...at 10 s it goes ahead anyway (once) and lets go of the listeners", calls === 1 && imgs[1].attached === 0);
  imgs[1].fire("load");
  check("a late arrival after that does not call it a second time", calls === 1);
}
{
  const t = new FakeTimers();
  let calls = 0;
  whenImagesSettled([new FakeImg(false)], () => calls++, { timers: t, timeoutMs: 500 });
  t.advance(500);
  check("the limit can be set (500 ms)", calls === 1);
}
// 6. cancelling (the person scrolled, or the viewer closed)
{
  const t = new FakeTimers();
  const imgs = [new FakeImg(false), new FakeImg(false)];
  let calls = 0;
  const cancel = whenImagesSettled(imgs, () => calls++, { timers: t });
  cancel();
  check("cancelled: every listener is removed at once", imgs.every((i) => i.attached === 0));
  imgs[0].fire("load");
  imgs[1].fire("load");
  t.advance(60_000);
  check("...and it is never called, however the images arrive afterwards", calls === 0);
  const t2 = new FakeTimers();
  let c2 = 0;
  const cancel2 = whenImagesSettled([new FakeImg(true)], () => c2++, { timers: t2 });
  cancel2();
  t2.advance(10);
  check("cancelled while nothing was pending: not called either", c2 === 0);
  const t3 = new FakeTimers();
  const i3 = new FakeImg(false);
  let c3 = 0;
  const cancel3 = whenImagesSettled([i3], () => c3++, { timers: t3 });
  i3.fire("load");
  cancel3();
  check("cancelling after it has finished is harmless", c3 === 1);
}
// 7. nothing to wait for
{
  const t = new FakeTimers();
  let calls = 0;
  whenImagesSettled([], () => calls++, { timers: t });
  t.advance(0);
  check("no images at all: called once, asynchronously", calls === 1);
}
// 8. is the target where it was meant to be?
check("aligned: the top is at the scroll margin (16 px) below the viewer's top", isAligned(116, 100, 16) === true);
check("aligned within 24 px either way, not beyond", isAligned(116 + 24, 100, 16) === true && isAligned(116 - 24, 100, 16) === true && isAligned(116 + 25, 100, 16) === false && isAligned(116 - 25, 100, 16) === false);
check("far away (the old bug: 5,000 px below, or well above): not aligned", isAligned(5100, 100, 16) === false && isAligned(-3000, 100, 16) === false);
check("a tighter tolerance can be given (2 px, used while pinning)", isAligned(118, 100, 16, 2) === true && isAligned(119, 100, 16, 2) === false);

console.log(`\nscrollWhenSettled selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

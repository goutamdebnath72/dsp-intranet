// src/tools/converter/holdRepeat.ts
//
// Press and hold: fire once at once, and, if the press is kept, again and again (after `delay`, then every `every` milliseconds) until it is let go. I use it for the spinner arrows of the colour boxes, so a held arrow
// changes the number one step at a time, rapidly, in its own direction. Returns the function that ends the hold; ending it twice does no harm.

export const HOLD_DELAY_MS = 350;
export const HOLD_EVERY_MS = 45;

export function startHold(fire: () => void, delay: number = HOLD_DELAY_MS, every: number = HOLD_EVERY_MS): () => void {
  fire();
  let repeat: ReturnType<typeof setInterval> | null = null;
  const wait = setTimeout(() => { repeat = setInterval(fire, every); }, delay);
  return () => {
    clearTimeout(wait);
    if (repeat !== null) { clearInterval(repeat); repeat = null; }
  };
}

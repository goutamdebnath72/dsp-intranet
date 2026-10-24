// src/lib/ui/originTint.ts
//
// The OPTIONAL colouring of ticket numbers by origin (step 44c). OFF for everybody until a person turns it on, kept in that person's browser, never shown otherwise.
// Direct recruit (second digit 9) = indigo with a hollow dot, promotee (any other second digit) = amber with a filled dot: two neutral shades (no good/bad colour like red and green)
// and a dot whose SHAPE differs, so it does not rest on colour alone. The legend appears only while the switch is on.

import { useSyncExternalStore } from "react";
import type { Origin } from "@/lib/nl2sql/designationFilter";

const KEY = "dsp.originTint";
const EVENT = "dsp-origin-tint";

const read = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/** [is the tint on, switch it]. Every place that shows a ticket follows the same switch, in this tab and in other tabs. */
export function useOriginTint(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = (value: boolean) => {
    try {
      window.localStorage.setItem(KEY, value ? "1" : "0");
    } catch {
      /* private mode: the switch simply does not stick */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [on, set];
}

export const originClass = (o: Origin): string => (o === "promotee" ? "text-amber-700" : o === "direct" ? "text-indigo-700" : "");
export const originDot = (o: Origin): string => (o === "promotee" ? "\u25CF" : o === "direct" ? "\u25CB" : "");

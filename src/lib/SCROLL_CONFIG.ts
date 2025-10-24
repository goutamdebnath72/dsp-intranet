// src/lib/SCROLL_CONFIG.ts
export const DIRECTION = {
  UP: 1 as const,
  DOWN: -1 as const,
};

export type Direction = typeof DIRECTION[keyof typeof DIRECTION];

export const SCROLL_CONFIG = {
  // global defaults
  speedPxPerSec: 18, // scroll speed (px/sec)
  gapHeight: 12,     // visual gap between cards (px)

  // per-column directions
  topResourcesDirection: DIRECTION.UP as Direction,
  announcementsDirection: DIRECTION.DOWN as Direction,
};

// src/hooks/useCircularStatus.ts
"use client";
//
// The "new circular" state of the home page: the red circle on the Circulars thumbnail AND the highlighted rows in the Circulars modal. ONE place owns it,
// so the two can never disagree. (They used to keep separate copies, each asking the server on its own timing, and they overwrote each other: after
// the FIRST opening of a new circular the highlight came back, and the red circle could keep its old number, until the second opening.)
//
// The rules (the same as the server's, /api/circulars/seen):
//   * a circular is "new" for 24 hours after it was uploaded;
//   * LOGGED IN: it stops being new for that person the moment they open it. It is cleared on screen AT ONCE, and kept cleared until the server has
//     saved the read (saving takes a second or two), so no answer from the server that was asked for BEFORE the read was saved can bring it back;
//   * LOGGED OUT: nothing is cleared by opening (there is no one to remember it for); the circular stays new for its 24 hours.
//
// And only the NEWEST question to the server may update the screen: an older answer that arrives late (it was asked before the read was saved, so it
// is out of date) is thrown away.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** What a person should see as new: the server's list, minus the circulars they have just opened and whose "read" is still being saved. */
export function mergeUnread(server: readonly number[], justOpened: ReadonlySet<number>): number[] {
  return server.filter((id) => !justOpened.has(id));
}

export interface CircularStatus {
  hasNewCircular: boolean;
  newCircularCount: number;
  /** the ids of the circulars to show as new (the modal highlights these) */
  unreadIds: ReadonlySet<number>;
  /** ask the server again (when the modal opens, when the viewer closes) */
  refresh: () => Promise<void>;
  /** call when a circular is opened: clears it at once (logged in), saves the read, then checks the server. Resolves true when the read was saved. */
  markOpened: (id: number) => Promise<boolean>;
}

export function useCircularStatus(isLoggedIn: boolean): CircularStatus {
  const [serverUnread, setServerUnread] = useState<number[]>([]);
  const [justOpened, setJustOpened] = useState<ReadonlySet<number>>(() => new Set());
  const newest = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++newest.current;
    try {
      const res = await fetch("/api/circulars/seen", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (mine !== newest.current) return; // a newer question was asked after this one: its answer is the one to use
      setServerUnread(Array.isArray(data?.unreadIds) ? data.unreadIds.map(Number) : []);
    } catch {
      // a passing network error: leave the screen as it is
    }
  }, []);

  // on the first load, and again whenever someone logs in or out (the answer depends on who is asking)
  useEffect(() => {
    void refresh();
  }, [refresh, isLoggedIn]);

  const markOpened = useCallback(
    async (id: number) => {
      if (isLoggedIn) setJustOpened((prev) => new Set(prev).add(id)); // cleared on screen at once, and kept cleared while the read is being saved
      let saved = false;
      try {
        saved = (await fetch(`/api/circulars/${id}/read`, { method: "POST" })).ok; // a 401 for someone who is logged out: nothing is saved, nothing changes
      } catch {
        saved = false;
      }
      if (saved) setServerUnread((prev) => prev.filter((x) => x !== id)); // the server now agrees: no flicker while we ask it again
      setJustOpened((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await refresh();
      return saved;
    },
    [isLoggedIn, refresh],
  );

  const unreadIds = useMemo<ReadonlySet<number>>(() => new Set(mergeUnread(serverUnread, justOpened)), [serverUnread, justOpened]);
  return { hasNewCircular: unreadIds.size > 0, newCircularCount: unreadIds.size, unreadIds, refresh, markOpened };
}

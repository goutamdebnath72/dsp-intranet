// src/components/usePeopleEvents.ts
"use client";

// THE DATA OF THE "PEOPLE & EVENTS" WIDGET (step 65a): one request for the three lists, and a fresh one at 12:00 AM India time (the lists change every day at midnight), also when a page that was
// left open comes back to the screen on a new day. The day is the day in India, whatever the zone of the visitor's own machine.

import { useCallback, useEffect, useRef, useState } from "react";
import { isoDay, msUntilNextMidnight, todayIST } from "@/lib/peopleEvents/rules";
import type { PeopleEvents } from "@/lib/peopleEvents/query";

/** A little after midnight, so the server is surely on the new day. */
export const MIDNIGHT_GRACE_MS = 5000;

export function usePeopleEvents() {
  const [data, setData] = useState<PeopleEvents | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedDay = useRef<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/people-events", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as Partial<PeopleEvents> & { error?: string };
      if (!alive.current) return;
      if (!res.ok) throw new Error(body.error || "The list could not be loaded.");
      setData(body as PeopleEvents);
      loadedDay.current = (body as PeopleEvents).today;
      setError(null);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "The list could not be loaded.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true; // StrictMode mounts, unmounts and mounts again: switch on at EVERY mount
    void load();
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => { void load(); arm(); }, msUntilNextMidnight() + MIDNIGHT_GRACE_MS);
    };
    arm();
    const onVisible = () => {
      if (document.visibilityState === "visible" && loadedDay.current !== null && loadedDay.current !== isoDay(todayIST())) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return { data, error, loading };
}

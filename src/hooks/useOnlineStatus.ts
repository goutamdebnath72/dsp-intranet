// src/hooks/useOnlineStatus.ts
//
// Whether this computer can reach the intranet, kept up to date while the search window is open: the browser's online/offline events, a real check (src/lib/net/online.ts) when the window opens,
// every 20 seconds while all is well, every 4 seconds while it is not (so the red message goes away by itself when the connection returns), and on demand (`recheck`, used after a failed search).
// It sends nothing but the empty ping and keeps nothing.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PING_EVERY_MS, PING_RETRY_MS, probeOnline } from "@/lib/net/online";

export interface OnlineStatus {
  online: boolean;
  /** the browser's own flag, for the wording of the advice */
  browserOnline: boolean;
  recheck: () => void;
}

export function useOnlineStatus(active: boolean): OnlineStatus {
  const [online, setOnline] = useState(true);
  const [browserOnline, setBrowserOnline] = useState(true);
  const seq = useRef(0);
  const onlineRef = useRef(true);

  const check = useCallback(async () => {
    const mine = ++seq.current;
    const flag = typeof navigator === "undefined" ? true : navigator.onLine !== false;
    const ok = await probeOnline((url, init) => fetch(url, init), flag);
    if (mine !== seq.current) return; // a newer check is on its way
    onlineRef.current = ok;
    setBrowserOnline(flag);
    setOnline(ok);
  }, []);

  useEffect(() => {
    if (!active) return;
    void check();
    const goOffline = () => { seq.current++; onlineRef.current = false; setBrowserOnline(false); setOnline(false); };
    const comeBack = () => void check();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", comeBack);
    window.addEventListener("focus", comeBack);
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      timer = setTimeout(() => { void check().finally(loop); }, onlineRef.current ? PING_EVERY_MS : PING_RETRY_MS);
    };
    loop();
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", comeBack);
      window.removeEventListener("focus", comeBack);
    };
  }, [active, check]);

  return { online, browserOnline, recheck: () => void check() };
}

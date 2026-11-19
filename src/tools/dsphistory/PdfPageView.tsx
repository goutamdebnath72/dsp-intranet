// src/tools/dsphistory/PdfPageView.tsx
//
// ONE PAGE OF A PLANT DOCUMENT, DRAWN WITH THE QUOTED WORDS MARKED: the page is drawn by pdf.js (the reader that Firefox uses; the browser's own PDF viewer cannot be told to mark words), fitted to the width of the room,
// and the words the card quotes are painted over in yellow, and scrolled into view, so the reader sees at once the sentence the card took from the manual instead of hunting for it. Only the page being looked at is
// fetched and drawn (pdf.js asks our route, GET /api/history-docs/<id>, for the parts of the file it needs; the rest of the manual is never sent). pdf.js is loaded only when a manual is opened.
// Where the quote is on the page is worked out in highlight.ts (checked against all 78 quotes the card takes from the two manuals: every one is found on its page). If the words are not found the page is still shown, with a line that says so.
"use client";

import React, { useEffect, useRef, useState } from "react";
import { docRoute } from "./docs";
import { findQuote, pieceOf, type Rect } from "./highlight";

/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js's own objects; only the few calls below are used */
let pdfjsReady: Promise<any> | null = null;
const loadPdfjs = (): Promise<any> => (pdfjsReady ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((m: any) => {
  m.GlobalWorkerOptions.workerSrc = new URL("../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  return m;
}));

/** the documents already opened (a page change reuses its document) */
const opened = new Map<string, Promise<any>>();
const openDocument = (id: string): Promise<any> => {
  let p = opened.get(id);
  if (!p) {
    p = loadPdfjs().then((m) => m.getDocument({ url: docRoute(id), withCredentials: true, isEvalSupported: false, disableAutoFetch: true }).promise);
    p.catch(() => opened.delete(id));
    opened.set(id, p);
  }
  return p;
};

/** the widest a page is drawn (CSS pixels): a page is read, not stretched across a wide screen; a sheet that is wider than it is high (the book prints two pages to a sheet) is drawn larger, so that each page of it can be read */
const MAX_WIDTH = 980;
const MAX_WIDTH_SPREAD = 1500;

export function PdfPageView({ doc, page, quotes, onLoaded }: { doc: string; page: number; quotes: readonly string[]; onLoaded?: (pages: number) => void }) {
  const room = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const asked = quotes.join("\n");

  useEffect(() => {
    let alive = true;
    let task: { cancel: () => void } | null = null;
    setStatus("loading");
    (async () => {
      const pdf = await openDocument(doc);
      if (alive && onLoaded) onLoaded(pdf.numPages);
      const p = await pdf.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const avail = Math.max(280, Math.min(base.width > base.height ? MAX_WIDTH_SPREAD : MAX_WIDTH, (room.current?.clientWidth ?? MAX_WIDTH) - 24));
      const scale = avail / base.width;
      const vp = p.getViewport({ scale });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const c = canvas.current;
      if (!c || !alive) return;
      c.width = Math.floor(vp.width * dpr);
      c.height = Math.floor(vp.height * dpr);
      c.style.width = `${vp.width}px`;
      c.style.height = `${vp.height}px`;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      task = p.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined, canvas: c });
      const [, tc] = await Promise.all([(task as any).promise, p.getTextContent()]);
      if (!alive) return;
      const pieces = tc.items.filter((i: any) => typeof i.str === "string").map((i: any) => pieceOf(i, vp.transform, vp.scale));
      // the share of a line that comes before and inside the quote is taken from the widths of those words in an ordinary sans-serif face (better than counting characters, which are not all as wide)
      const mctx = document.createElement("canvas").getContext("2d");
      if (mctx) mctx.font = "100px Arial, Helvetica, sans-serif";
      const measure = mctx ? (t: string) => mctx.measureText(t).width : undefined;
      const found = asked ? asked.split("\n").flatMap((q) => findQuote(pieces, q, measure)) : [];
      setSize({ w: vp.width, h: vp.height });
      setRects(found);
      setStatus("ready");
      if (found.length && room.current) {
        const top = Math.min(...found.map((r) => r.y));
        room.current.scrollTo({ top: Math.max(0, top - 120), behavior: "smooth" });
      } else room.current?.scrollTo({ top: 0 });
    })().catch((e) => { if (alive && !(e && e.name === "RenderingCancelledException")) setStatus("error"); });
    return () => { alive = false; try { task?.cancel(); } catch { /* already finished */ } };
  }, [doc, page, asked]);

  return (
    <div ref={room} data-doc-page-view data-doc-page={page} className="absolute inset-0 overflow-auto bg-[#282828] py-3">
      <div className="relative mx-auto bg-white shadow-2xl" style={size ? { width: size.w, height: size.h } : { width: "min(980px, 94%)", minHeight: 240 }}>
        <canvas ref={canvas} className="block" />
        {rects.map((r, i) => (
          <span key={i} data-doc-mark aria-hidden="true" className="pointer-events-none absolute rounded-[3px] bg-yellow-300/55 mix-blend-multiply ring-1 ring-yellow-500/40" style={{ left: r.x - 2, top: r.y - 1, width: r.w + 4, height: r.h + 2 }} />
        ))}
        {status === "loading" && <p role="status" className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-500">Opening page {page}...</p>}
        {status === "error" && <p role="alert" className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-semibold text-slate-700">This page could not be drawn just now. Use &ldquo;Open the whole document&rdquo; above, or try again.</p>}
      </div>
      {status === "ready" && asked && rects.length === 0 && <p data-doc-unmarked className="mx-auto mt-3 max-w-xl rounded-xl bg-white/90 px-3 py-2 text-center text-xs font-semibold text-slate-700">The quoted words could not be marked on this page; they are on it.</p>}
    </div>
  );
}

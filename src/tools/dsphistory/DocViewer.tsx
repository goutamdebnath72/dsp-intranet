// src/tools/dsphistory/DocViewer.tsx
//
// A PLANT DOCUMENT (a JO Manual) FULL SCREEN OVER THE CARD, AT THE CITED PAGE: the same layer as the announcement PDF (ViewerShell; closes with the cross and Escape; the page behind keeps its scroll position), with
//   * a strip above the PDF that names the manual, says "page 34 of 102" and has two buttons: "Title page" (the first page, as proof that it is the right manual) and "Cited page" (back to the page the card cited);
//   * the PDF itself below, opened at the page (the browser's own viewer takes #page=; the page numbers the card cites are the PDF's own, checked by script).
// An internal document (a JO Manual): the viewer first asks our route (?info=1): signed in -> the PDF; not signed in (401) -> "Sign in to read this document" with a Sign in button (it opens the intranet's sign-in
// window, and the document opens by itself once the reader is signed in); not uploaded yet (404) -> says so. Nothing is recorded about who opened what.
//
// `DocViewerContext` lets any source line of the card open it (SourceLine in DspHistoryCard.tsx); without the provider (a test, a page outside the card) a page link is an ordinary link to the route.
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import { BookOpen, LogIn } from "lucide-react";
import { ViewerShell } from "@/components/ViewerShell";
import { onEscape } from "@/components/ImageLightbox";
import { useVerifiedSession } from "@/components/SessionGuard";
import { useModal } from "@/context/ModalContext";
import { lockPageScroll } from "@/lib/ui/scrollLock";
import { DOCS, docRoute, wholeDocHref } from "./docs";
import { PdfPageView } from "./PdfPageView";

/** a document opened at a page, with the words the card quotes from it (they are marked on that page) */
export interface OpenDoc { doc: string; page: number; quotes?: readonly string[] }

/** opens a document at a page; null outside the card */
export const DocViewerContext = createContext<((d: OpenDoc) => void) | null>(null);

export type DocState = "checking" | "ready" | "signin" | "missing" | "error";

/** what the route's answer to ?info=1 means */
export const stateOfStatus = (status: number): DocState => (status === 200 ? "ready" : status === 401 ? "signin" : status === 404 ? "missing" : "error");

/** the browser's PDF viewer, opened on a page: thumbnail panel closed, a fixed 150% zoom (as the announcement viewer does) */
export const viewSrc = (doc: string, page: number): string => `${docRoute(doc)}#page=${Math.max(1, Math.trunc(page))}&navpanes=0&zoom=150`;

/** the layer itself, without the portal and the effects (so it can be drawn and tested on the server) */
export function DocViewerView({ open: o, state, page, total, onPage, onClose, onSignIn, onLoaded }: { open: OpenDoc; state: DocState; page: number; total?: number | null; onPage: (p: number) => void; onClose: () => void; onSignIn?: () => void; onLoaded?: (pages: number) => void }) {
  const d = DOCS[o.doc];
  /** the number of pages: the document's own count once it is open, else the one on file (a published PDF has none until it is read) */
  const last = total ?? d?.pages ?? null;
  const btn = "rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/20";
  return (
    <ViewerShell title={d?.title ?? "Document"} onClose={onClose} closeLabel="Close the document" zClass="z-[400]" escapeOwn>
      <div role="presentation" data-doc-viewer className="flex min-h-0 flex-1 flex-col" onClick={(e) => e.stopPropagation()}>
        {state === "ready" && d && (
          <div className="flex flex-wrap items-center gap-2 bg-black/60 px-4 py-2 text-xs text-white/90" data-doc-strip>
            <BookOpen size={14} aria-hidden="true" />
            <span className="font-semibold">{d.title}</span>
            <span data-doc-pageof>page {page}{last ? ` of ${last}` : ""}</span>
            <span className="ml-auto flex flex-wrap gap-2">
              {page > 1 && <button type="button" onClick={() => onPage(page - 1)} data-doc-prev className={btn}>Previous page</button>}
              {(last === null || page < last) && <button type="button" onClick={() => onPage(page + 1)} data-doc-next className={btn}>Next page</button>}
              {page !== 1 && <button type="button" onClick={() => onPage(1)} data-doc-title-page className={btn}>Title page</button>}
              {page !== o.page && <button type="button" onClick={() => onPage(o.page)} data-doc-cited-page className={btn}>Cited page</button>}
              <a href={wholeDocHref(o.doc, page)} target="_blank" rel="noopener noreferrer" data-doc-whole className={`${btn} inline-block`} style={{ color: "#fff" }}>Open the whole document</a>
            </span>
          </div>
        )}
        <div className="group relative min-h-0 flex-1">
          {state === "ready" && <PdfPageView doc={o.doc} page={page} quotes={page === o.page ? o.quotes ?? [] : []} onLoaded={onLoaded} />}
          {state !== "ready" && (
            <div className="flex h-full items-center justify-center p-6">
              <div role={state === "checking" ? "status" : "alert"} data-doc-state={state} className="max-w-md rounded-2xl bg-white p-6 text-center text-sm text-slate-700 shadow-2xl">
                {state === "checking" && <p className="font-semibold">Opening the document...</p>}
                {state === "signin" && (
                  <>
                    <p className="font-semibold text-slate-900">Sign in to read this document.</p>
                    <p className="mt-1 text-xs text-slate-500">The JO Manuals are internal to SAIL, so they open only for a signed-in reader. This page opens by itself once you are signed in.</p>
                    {onSignIn && <button type="button" onClick={onSignIn} data-doc-signin className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"><LogIn size={13} aria-hidden="true" />Sign in</button>}
                  </>
                )}
                {state === "missing" && (
                  <>
                    <p className="font-semibold">This document has not been uploaded yet.</p>
                    {d?.remote && <a href={wholeDocHref(o.doc, o.page)} target="_blank" rel="noopener noreferrer" data-doc-at-source className="mt-3 inline-block rounded-md border border-rose-300 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700" style={{ color: "#fff" }}>Open the publisher&apos;s file at page {o.page} meanwhile</a>}
                  </>
                )}
                {state === "error" && <p className="font-semibold">The document could not be opened just now. Please try again.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </ViewerShell>
  );
}

/** the sign-in window's opener and whether it is open, when the card is inside the app (they are not in a test) */
function useSignIn(): { openModal?: () => void; isModalOpen: boolean } {
  try { const m = useModal(); return { openModal: m.openModal, isModalOpen: m.isModalOpen }; } catch { return { isModalOpen: false }; }
}

/** the viewer's layer is drawn only while a document is open AND the reader is not away signing in: the sign-in window must be the topmost thing on the screen, and the layer (z-[400]) would cover it */
export const layerShown = (open: OpenDoc | null, away: boolean): boolean => !!open && !away;

export function DocViewer({ open, onClose }: { open: OpenDoc | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<DocState>("checking");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const { status: auth } = useVerifiedSession();
  const { openModal, isModalOpen } = useSignIn();
  // "Sign in" was pressed: the layer steps aside so that the sign-in window shows on top; it comes back when that window closes (and opens the document by itself if the reader signed in)
  const [away, setAway] = useState(false);
  const signIn = openModal ? () => { setAway(true); openModal(); } : undefined;
  useEffect(() => { if (away && !isModalOpen) setAway(false); }, [away, isModalOpen]);
  useEffect(() => setMounted(true), []);

  // each time a document is opened (or the reader signs in while the sign-in notice is up) the route is asked
  useEffect(() => {
    if (!open) return;
    setPage(open.page);
    setTotal(null);
    let alive = true;
    setState("checking");
    fetch(`${docRoute(open.doc)}?info=1`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => { if (alive) setState(stateOfStatus(r.status)); })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [open, auth === "authenticated"]);

  useEffect(() => {
    if (!layerShown(open, away)) return;
    const lock = lockPageScroll();
    const letGo = onEscape(window, onClose);
    return () => { lock.release(); letGo(); };
  }, [open, away, onClose]);

  if (!mounted) return null;
  return createPortal(
    <div onClick={(e) => e.stopPropagation()} data-doc-viewer-root>
      <AnimatePresence>{open && !away && <DocViewerView open={open} state={state} page={page} total={total} onPage={setPage} onClose={onClose} onSignIn={signIn} onLoaded={setTotal} />}</AnimatePresence>
    </div>,
    document.body,
  );
}

/** a hook for the card: where it keeps the open document, and the provider value to hand down */
export function useDocViewer(): { open: OpenDoc | null; show: (d: OpenDoc) => void; close: () => void } {
  const [open, setOpen] = useState<OpenDoc | null>(null);
  return { open, show: setOpen, close: () => setOpen(null) };
}

export const useOpenDoc = (): ((d: OpenDoc) => void) | null => useContext(DocViewerContext);

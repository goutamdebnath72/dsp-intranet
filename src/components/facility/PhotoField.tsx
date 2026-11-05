"use client";

// src/components/facility/PhotoField.tsx
//
// THE PHOTO FIELD of an employee (step 69d; owner, 2 Nov 2026): optional, in the Identity card. It only DRAWS the five states of a photo and calls what it is given (`onPick` with the file, `onRemove`):
// the checking of the picture (is there one face, the square around it) is done elsewhere, so this part stays simple and can be looked at on its own.
//   empty    nothing yet (or the person has no photo): the invitation, with the format asked for in words
//   checking the file is being looked at
//   ready    a new photo was chosen and made square: shown here and on the ID card, saved with the employee
//   saved    the photo he already has (in Modify)
//   error    the photo cannot be used, with the reason in words

import React, { useRef } from "react";
import { Camera, CheckCircle2, Loader2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";

export type PhotoUiState =
  | { kind: "empty" }
  | { kind: "checking"; fileName: string }
  | { kind: "ready"; previewUrl: string }
  | { kind: "saved"; url: string }
  | { kind: "error"; message: string };

export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const PHOTO_HINT = "Provide a coloured, high-resolution, passport-size photo of the face (JPG, JPEG, PNG or WebP; up to 8 MB; at least 400 × 400 pixels). It is made square around the face for you.";

/** The picture the ID card should show, if any. */
export const photoUrlOf = (s: PhotoUiState): string | null => (s.kind === "ready" ? s.previewUrl : s.kind === "saved" ? s.url : null);

const BTN = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-50";

export interface PhotoFieldProps { id: string; state: PhotoUiState; onPick: (file: File) => void; onRemove: () => void; disabled?: boolean }

export function PhotoField({ id, state, onPick, onRemove, disabled = false }: PhotoFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const choose = () => input.current?.click();
  const picked = (file: File | undefined | null) => { if (file) onPick(file); };
  const tile = "relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl";
  return (
    <div data-photo-field={state.kind} className="mt-1 sm:col-span-2">
      <p className="mb-1.5 text-xs font-semibold text-slate-700">Photo <span className="font-normal text-slate-500">(optional)</span></p>
      <div
        className={`flex flex-wrap items-center gap-4 rounded-2xl border border-dashed p-3 transition ${state.kind === "error" ? "border-rose-300 bg-rose-50/60" : "border-indigo-200 bg-indigo-50/40"}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (!disabled && state.kind !== "checking") picked(e.dataTransfer.files?.[0]); }}
      >
        {state.kind === "ready" || state.kind === "saved" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <div className={`${tile} ring-2 ring-emerald-300`}><img src={state.kind === "ready" ? state.previewUrl : state.url} alt="The employee" className="h-full w-full object-cover" /></div>
        ) : state.kind === "checking" ? (
          <div className={`${tile} bg-white ring-1 ring-indigo-200`}><Loader2 className="h-8 w-8 animate-spin text-indigo-500" aria-hidden="true" /></div>
        ) : state.kind === "error" ? (
          <div className={`${tile} bg-white ring-1 ring-rose-200`}><TriangleAlert className="h-8 w-8 text-rose-500" aria-hidden="true" /></div>
        ) : (
          <button type="button" onClick={choose} disabled={disabled} aria-label="Choose a photo" className={`${tile} bg-white text-indigo-400 ring-1 ring-indigo-200 transition hover:text-indigo-600 hover:ring-indigo-300 focus:outline-none focus:ring-4 focus:ring-indigo-100`}><Camera className="h-9 w-9" aria-hidden="true" /></button>
        )}

        <div className="min-w-[14rem] flex-1 space-y-2">
          {state.kind === "empty" && (
            <>
              <p className="text-sm text-slate-700">{PHOTO_HINT}</p>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" data-photo-choose="true" className={BTN} disabled={disabled} onClick={choose}><Camera className="h-4 w-4" aria-hidden="true" />Choose a photo</button>
                <span className="text-xs text-slate-500">or drop it here</span>
              </div>
            </>
          )}
          {state.kind === "checking" && (
            <>
              <p className="text-sm font-semibold text-indigo-700">Checking the photo…</p>
              <p className="text-xs text-slate-500">{state.fileName}: looking for the face and making it square.</p>
            </>
          )}
          {(state.kind === "ready" || state.kind === "saved") && (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{state.kind === "ready" ? "Face found · made square" : "Saved photo"}</span>
              <p className="text-sm text-slate-700">{state.kind === "ready" ? "It is on the ID card now and is saved when you save the employee." : "This is the photo on his record. To change it, choose another."}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" data-photo-replace="true" className={BTN} disabled={disabled} onClick={choose}><RefreshCw className="h-4 w-4" aria-hidden="true" />Replace</button>
                <button type="button" data-photo-remove="true" className={BTN} disabled={disabled} onClick={onRemove}><Trash2 className="h-4 w-4" aria-hidden="true" />Remove</button>
              </div>
            </>
          )}
          {state.kind === "error" && (
            <>
              <p role="alert" className="text-sm font-semibold text-rose-700">{state.message}</p>
              <button type="button" data-photo-choose="true" className={BTN} disabled={disabled} onClick={choose}><Camera className="h-4 w-4" aria-hidden="true" />Try another photo</button>
            </>
          )}
        </div>
      </div>
      <input ref={input} id={id} type="file" accept={PHOTO_ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => { picked(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

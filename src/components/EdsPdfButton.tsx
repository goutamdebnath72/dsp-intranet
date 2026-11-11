"use client";

// src/components/EdsPdfButton.tsx
//
// The "Download PDF" button of an Executive Deep Synthesis reply (and only of that: it is drawn inside ExecutiveBriefing, which only an EDS reply uses).
// The PDF is made on the person's own computer from the reply that is on the screen; nothing is sent anywhere. Success shows no message of ours (the browser's save window is the confirmation); only a failure does.
import React from "react";
import toast from "react-hot-toast";
import { FileDown, Loader2 } from "lucide-react";
import type { SynthesisResult } from "@/lib/search/executiveSynthesis";

export function EdsPdfButton({ data, question, abbreviations }: { data: SynthesisResult; question?: string | null; abbreviations: Array<[string, string]> }) {
  const [busy, setBusy] = React.useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { downloadEdsPdf } = await import("@/lib/pdf/downloadEdsPdf");
      // no success message here: the browser's own save window (or its download bar) already tells the person where the file goes, and a message here could say "saved" before it is
      await downloadEdsPdf(data, question, abbreviations);
    } catch (err) {
      console.error("[EDS PDF]", err);
      toast.error("The PDF could not be made. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      title="Download this reply as a PDF"
      className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-wait disabled:opacity-70"
    >
      {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <FileDown size={13} aria-hidden />}
      {busy ? "Preparing PDF…" : "Download PDF"}
    </button>
  );
}

export default EdsPdfButton;

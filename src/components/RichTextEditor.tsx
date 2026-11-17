// src/components/RichTextEditor.tsx
"use client";

import React, { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { TEXT_COLOURS } from "@/lib/announcements/palette";
import { stripPastedColours } from "@/lib/announcements/pasteClean";
import { PdfLink } from "@/lib/announcements/pdfLinkMark";
import {
  Bold as BoldIcon,
  FileText as PdfIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
} from "lucide-react";

const DEFAULT_EDITOR_MIN_HEIGHT = "160px";

type Props = {
  /** Current HTML value (controlled). */
  value: string;
  /** Fires with sanitized-on-save HTML whenever the doc changes. */
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  /** a PDF is attached (or chosen), so selected words may be made a link to it; without one the "PDF link" button is switched off */
  pdfLinkAvailable?: boolean;
};

// The toolbar's swatches: "Default" (clears the colour) and the palette (src/lib/announcements/palette.ts), which is also the only set of colours the saving code keeps.
const COLORS = [{ name: "Default", value: "" }, ...TEXT_COLOURS];

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      // onMouseDown + preventDefault keeps the editor selection intact
      // (a plain onClick blurs the selection before the command runs).
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
        active
          ? "bg-primary-600 text-white"
          : "text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, pdfLinkAvailable }: { editor: Editor; pdfLinkAvailable: boolean }) {
  const currentColor = editor.getAttributes("textStyle").color || "";
  const inPdfLink = editor.isActive("pdfLink");
  // pressed inside linked words it takes the link off those words; on selected words it makes them the link; with nothing selected it does nothing
  const togglePdfLink = () => {
    if (inPdfLink) editor.chain().focus().extendMarkRange("pdfLink").unsetMark("pdfLink").run();
    else if (!editor.state.selection.empty) editor.chain().focus().setMark("pdfLink").run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-t-md border-b border-slate-300 bg-slate-50 px-2 py-1.5">
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon size={16} />
      </ToolbarButton>

      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon size={16} />
      </ToolbarButton>

      <ToolbarButton
        label="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon size={16} />
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />

      {/* PDF link: the selected words open the announcement's PDF. Only when a PDF is attached. */}
      <button
        type="button"
        data-pdf-link-button
        aria-label="PDF link"
        aria-pressed={inPdfLink}
        disabled={!pdfLinkAvailable}
        title={pdfLinkAvailable ? "Select words, then press this to make them open the PDF (press again inside them to take the link off)" : "Attach a PDF below first; then selected words can be made to open it"}
        onMouseDown={(e) => {
          e.preventDefault();
          if (pdfLinkAvailable) togglePdfLink();
        }}
        className={`flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold transition-colors ${
          !pdfLinkAvailable
            ? "cursor-not-allowed text-slate-300"
            : inPdfLink
              ? "bg-primary-600 text-white"
              : "text-slate-600 hover:bg-slate-200"
        }`}
      >
        <PdfIcon size={15} aria-hidden="true" /> PDF link
      </button>

      <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />

      {/* Color swatches */}
      <div className="flex items-center gap-1">
        {COLORS.map((c) => {
          const isActive =
            c.value === ""
              ? !currentColor
              : currentColor.toLowerCase() === c.value.toLowerCase();
          return (
            <button
              key={c.name}
              type="button"
              aria-label={`Text color ${c.name}`}
              aria-pressed={isActive}
              onMouseDown={(e) => {
                e.preventDefault();
                if (c.value === "") {
                  editor.chain().focus().unsetColor().run();
                } else {
                  editor.chain().focus().setColor(c.value).run();
                }
              }}
              className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
                isActive
                  ? "border-slate-800 ring-2 ring-offset-1 ring-slate-400"
                  : "border-slate-300"
              }`}
              style={{
                backgroundColor: c.value || "#ffffff",
                backgroundImage:
                  c.value === ""
                    ? "linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%)"
                    : undefined,
                backgroundSize: c.value === "" ? "8px 8px" : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = DEFAULT_EDITOR_MIN_HEIGHT,
  pdfLinkAvailable = false,
}: Props) {
  const editor = useEditor({
    // SSR-safe: Tiptap renders immediately on the client only.
    immediatelyRender: false,
    extensions: [
      // StarterKit's own Link is off: it keeps an address and turns typed web addresses into links. The only link here is the PDF link.
      StarterKit.configure({ link: false }),
      Underline,
      TextStyle,
      Color,
      PdfLink,
    ],
    content: value || "",
    editorProps: {
      // pasted text arrives WITHOUT its own colour (a chat, a page or a document brings a pale grey that dimmed the body); colour is put on with the swatches
      transformPastedHTML: stripPastedColours,
      attributes: {
        class:
          "prose prose-sm max-w-none px-3 py-2 focus:outline-none text-slate-800",
        style: `min-height:${minHeight}`,
        "data-placeholder": placeholder || "",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Tiptap emits "<p></p>" for an empty doc; normalize that to "".
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  // Keep the editor in sync when the parent replaces `value` externally
  // (e.g. loading an existing announcement for editing). Guard against
  // clobbering the user's in-progress typing.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || "";
    const normalizedCurrent = current === "<p></p>" ? "" : current;
    if (incoming !== normalizedCurrent) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="rounded-md border border-slate-500 shadow-md">
        <div
          className="animate-pulse bg-slate-50"
          style={{ height: `calc(${minHeight} + 41px)` }}
        />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-500 shadow-md focus-within:ring-1 focus-within:ring-inset focus-within:ring-blue-500">
      <Toolbar editor={editor} pdfLinkAvailable={pdfLinkAvailable} />
      <EditorContent editor={editor} />
    </div>
  );
}

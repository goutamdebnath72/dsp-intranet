// src/components/RichTextEditor.tsx
"use client";

import React, { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
} from "lucide-react";

type Props = {
  /** Current HTML value (controlled). */
  value: string;
  /** Fires with sanitized-on-save HTML whenever the doc changes. */
  onChange: (html: string) => void;
  placeholder?: string;
};

// A small, fixed palette of readable text colors for the toolbar swatches.
const COLORS = [
  { name: "Default", value: "" }, // clears color -> inherits
  { name: "Red", value: "#dc2626" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Amber", value: "#d97706" },
  { name: "Purple", value: "#7c3aed" },
];

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

function Toolbar({ editor }: { editor: Editor }) {
  const currentColor = editor.getAttributes("textStyle").color || "";

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
}: Props) {
  const editor = useEditor({
    // SSR-safe: Tiptap renders immediately on the client only.
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[20vh] px-3 py-2 focus:outline-none text-slate-800",
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
        <div className="h-[calc(20vh+41px)] animate-pulse bg-slate-50" />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-500 shadow-md focus-within:ring-1 focus-within:ring-inset focus-within:ring-blue-500">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

"use client";

// src/components/facility/TypedConfirm.tsx
//
// THE "TYPE IT TO CONFIRM" BOX of a deletion, one for every tool (the employee manager and the PAX editor; the tools to come use it too).
// Owner, 2 Nov 2026: what has to be typed is NOT written anywhere on the confirmation card, and pasting or dropping into the box is switched off: the person has to KNOW it and type it, not copy it.
// (He still saw the value in the list he picked from; this only stops a confirmation that is a copy of what is on the screen.)

import React from "react";

export interface TypedConfirmProps {
  id: string;
  /** What to type, in words, WITHOUT the value itself: "Type his ticket number to confirm". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The look of the box (each tool has its own family of colours). */
  className: string;
  inputMode?: "numeric" | "text";
  maxLength?: number;
  /** A data attribute for the tests and the scripts of the tool: { name: "data-emp-field", value: "confirm" }. */
  mark?: { name: string; value: string };
}

export function TypedConfirm({ id, label, value, onChange, className, inputMode = "numeric", maxLength = 12, mark }: TypedConfirmProps) {
  const extra: Record<string, string> = mark ? { [mark.name]: mark.value } : {};
  const stop = (e: React.SyntheticEvent) => e.preventDefault();
  return (
    <div data-typed-confirm="true">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-rose-900">{label}</label>
      <input
        id={id}
        {...extra}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={stop}
        onDrop={stop}
        onDragOver={stop}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-rose-800">Type it from memory: pasting is switched off.</p>
    </div>
  );
}

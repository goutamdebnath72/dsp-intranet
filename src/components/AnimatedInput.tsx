// src/components/AnimatedInput.tsx
'use client';

// This is the correct simple input component to match the final approved UI.
export const AnimatedInput = ({ id, label, value, onChange, onKeyDown, type = "text", isReadOnly = false, autoFocus = false }: any) => {
    return (
        <div className="relative pt-4">
            <label htmlFor={id} className="absolute left-0 -top-1.5 text-sm text-primary-600 font-medium">
                {label}
            </label>
            <input
                id={id}
                type={type}
                value={value}
                onChange={onChange}
                onKeyDown={onKeyDown}
                readOnly={isReadOnly}
                autoFocus={autoFocus}
                className="w-full bg-transparent px-2 py-1 text-lg tracking-wide text-neutral-800 font-mono border-b-2 border-neutral-300 focus:outline-none focus:border-primary-600 focus:bg-primary-100/50 read-only:bg-neutral-100 read-only:border-neutral-200 read-only:cursor-not-allowed"
            />
        </div>
    );
};
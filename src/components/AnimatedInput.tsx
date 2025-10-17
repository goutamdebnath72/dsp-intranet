'use client';

import React from 'react';

type AnimatedInputProps = {
  id: string;
  label: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  type?: 'text' | 'password' | 'email' | 'number';
  disabled?: boolean; // Changed from isReadOnly
  autoFocus?: boolean;
};

export const AnimatedInput = ({ 
  id, 
  label, 
  value, 
  onChange, 
  onKeyDown, 
  type = "text", 
  disabled = false, // Changed from isReadOnly
  autoFocus = false 
}: AnimatedInputProps) => {
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
                disabled={disabled} // Changed from readOnly={isReadOnly}
                autoFocus={autoFocus}
                // Changed read-only:* styles to disabled:*
                className="w-full bg-transparent px-2 py-1 text-lg tracking-wide text-neutral-800 font-mono border-b-2 border-neutral-400 focus:outline-none focus:border-primary-600 focus:bg-primary-100/50 disabled:bg-neutral-100 disabled:border-neutral-200 disabled:cursor-not-allowed"
            />
        </div>
    );
};
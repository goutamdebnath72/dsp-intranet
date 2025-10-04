'use client';

import { useState, useEffect, useRef } from 'react';

export function useTypewriter(text: string, speed: number = 20) {
  const [displayText, setDisplayText] = useState('');
  const index = useRef(0);

  useEffect(() => {
    // Reset state and ref when the input text changes
    setDisplayText('');
    index.current = 0;

    if (!text) return;

    const intervalId = setInterval(() => {
      // Stop the interval if we've reached the end of the text
      if (index.current > text.length) {
        clearInterval(intervalId);
        return;
      }

      // Declaratively set the displayed text to the correct substring
      setDisplayText(text.substring(0, index.current));

      // Increment the index for the next interval tick
      index.current += 1;

    }, speed);

    // Cleanup function to clear the interval
    return () => clearInterval(intervalId);
  }, [text, speed]); // Re-run the effect if text or speed changes

  return displayText;
}
// src/components/AnswerHeadline.tsx
// The clean answer, first, big and bold (step 61a): the same look as the hospital card's headline (text-2xl, extra bold; green Yes, red No, dark value, amber not known). Plain text only (React escapes it).

import React from "react";
import { HEADLINE_CLASS, type AnswerHeadline as Headline } from "@/lib/ui/answerHeadline";

export function AnswerHeadline({ headline }: { headline?: Headline | null }) {
  if (!headline || !headline.text) return null;
  return (
    <p className={`text-2xl font-extrabold leading-tight tracking-tight ${HEADLINE_CLASS[headline.tone]}`} data-headline={headline.tone} data-answer-headline="true">
      {headline.text}
    </p>
  );
}

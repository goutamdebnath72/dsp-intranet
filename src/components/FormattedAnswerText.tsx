import React from "react";

interface FormattedAnswerTextProps {
  text: string | null | undefined;
}

interface MetricSegment {
  type: "metric";
  num: string;
  category: string;
}

interface TextSegment {
  type: "text";
  value: string;
}

export type Segment = MetricSegment | TextSegment;

const METRIC_RE = /(\b\d[\d,]*\b)\s+(non-executives?|executives?|doctors?|non-medical|workers?|officers?|staff)/gi;

export function parseSegments(body: string): Segment[] {
  const segments: Segment[] = [];
  METRIC_RE.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = METRIC_RE.exec(body)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: body.slice(lastIndex, match.index) });
    }
    const num = match[1];
    const category = match[2];
    segments.push({ type: "metric", num, category });
    lastIndex = METRIC_RE.lastIndex;
  }
  if (lastIndex < body.length) {
    segments.push({ type: "text", value: body.slice(lastIndex) });
  }
  return segments;
}

export function getBadgeStyle(category: string): { badge: string; label: string } {
  const lower = category.toLowerCase();
  if (lower.startsWith("non-exec") || lower === "workers" || lower === "staff") {
    return {
      badge: "bg-slate-200 text-slate-800 border-slate-300",
      label: "text-slate-800 font-semibold",
    };
  }
  if (lower.startsWith("exec") || lower === "officers") {
    return {
      badge: "bg-amber-100 text-amber-900 border-amber-300/80",
      label: "text-amber-950 font-semibold",
    };
  }
  if (lower.startsWith("doctor")) {
    return {
      badge: "bg-teal-100 text-teal-900 border-teal-300",
      label: "text-teal-950 font-semibold",
    };
  }
  return {
    badge: "bg-neutral-200 text-neutral-800 border-neutral-300",
    label: "text-neutral-800 font-semibold",
  };
}

/**
 * Highlights headcount breakdown figures (e.g. "18 executives and 7 non-executives")
 * with distinctive, eye-catching pill badges styled to match their SAIL DSP cadres.
 */
export function FormattedAnswerText({ text }: FormattedAnswerTextProps) {
  if (!text || typeof text !== "string") return null;

  const colonIdx = text.indexOf(":");
  if (colonIdx === -1) {
    return <>{text}</>;
  }

  const prefix = text.slice(0, colonIdx + 1);
  const remainder = text.slice(colonIdx + 1);

  const segments = parseSegments(remainder);
  const hasMetrics = segments.some((s) => s.type === "metric");
  if (!hasMetrics) {
    return <>{text}</>;
  }

  return (
    <span>
      <span className="font-normal text-neutral-700">{prefix}</span>
      {segments.map((seg, idx) => {
        if (seg.type === "text") {
          return <span key={idx}>{seg.value}</span>;
        }
        const style = getBadgeStyle(seg.category);
        return (
          <span key={idx} className="inline-flex items-center gap-1 mx-0.5">
            <span
              className={`inline-flex items-center justify-center font-bold px-2 py-0.5 rounded-full text-xs border shadow-xs tracking-tight leading-none ${style.badge}`}
            >
              <span className="translate-y-px">{seg.num}</span>
            </span>
            <span className={style.label}>{seg.category}</span>
          </span>
        );
      })}
    </span>
  );
}

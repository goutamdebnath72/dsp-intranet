// src/components/ExecutiveBriefing.tsx
"use client";

import { expansionFromPhrase } from "@/lib/search/abbreviations";
import { formatCircularTitle } from "@/lib/circularTitle";
import { EdsPdfButton } from "@/components/EdsPdfButton";
import { hasPdfContent } from "@/lib/pdf/edsPdfModel";
import React from "react";
import { motion } from "framer-motion";
import { DateTime } from "luxon";
import {
  Sparkles,
  FileText,
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
  GitCommitHorizontal,
  ScatterChart as ScatterIcon,
  Gauge,
  UserCheck,
  Info,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";
import type {
  SynthesisResult,
  SynthesisChart,
  SynthesisChartItem,
} from "@/lib/search/executiveSynthesis";

interface ExecutiveBriefingProps {
  data: SynthesisResult;
  onOpenCircular?: (id: number) => void;
  /** the question that was asked: printed in the PDF ("Question asked") */
  question?: string | null;
}

/* ---- palette: warm executive (amber/orange) with cool accents ---- */
const PALETTE = [
  "#f59e0b", // amber-500
  "#0ea5e9", // sky-500
  "#10b981", // emerald-500
  "#8b5cf6", // violet-500
  "#ef4444", // red-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
];
const SERIES_A = "#f59e0b";
const SERIES_B = "#0ea5e9";

const CHART_HEIGHT = 260;

/** 2 when any value of the chart has paise (so "₹1,720.30" is not printed as "₹1,720.3" beside "₹52.00"), otherwise undefined (whole numbers stay whole). */
export function chartDecimals(chart: { items: Array<{ value: number; secondaryValue?: number }> }): number | undefined {
  return chart.items.some((i) => !Number.isInteger(i.value) || (typeof i.secondaryValue === "number" && !Number.isInteger(i.secondaryValue))) ? 2 : undefined;
}

const fmtNum = (v: number, decimals?: number): string =>
  typeof decimals === "number"
    ? v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : Math.abs(v) >= 1000
      ? v.toLocaleString("en-IN")
      : `${v}`;

export function formatValue(v: number, unit?: string, decimals?: number): string {
  const num = fmtNum(v, decimals);
  if (!unit) return num;
  const u = unit.trim().toLowerCase();
  if (unit === "₹" || u === "rs" || u === "rs." || u === "inr") return `₹${num}`;
  if (unit === "%") return `${num}%`;
  { const m = /^x\s+(\S.*)$/i.exec(unit.trim()); if (m) return `${num}× ${m[1]}`; } // "x <base>": 2× <base>
  if (/^x\b/i.test(unit) || u === "multiplier" || u === "x" || u === "times" || /multiple/i.test(u)) return `${num}×`;
  return `${num} ${unit}`;
}

export function compactChartValue(v: number, unit?: string, decimals?: number): string {
  const num = fmtNum(v, decimals);
  if (!unit) return num;
  const u = unit.trim().toLowerCase();
  if (unit === "₹" || u === "rs" || u === "rs." || u === "inr") return `₹${num}`;
  if (unit === "%") return `${num}%`;
  { const m = /^x\s+(\S.*)$/i.exec(unit.trim()); if (m) return `${num}× ${m[1]}`; } // "x <base>": 2× <base>
  if (/^x\b/i.test(unit) || u === "multiplier" || u === "x" || u === "times" || /multiple/i.test(u)) return `${num}×`;
  if (/^day/i.test(u) || u === "d") return `${num}d`;
  if (/^month/i.test(u) || u === "mo" || u === "m") return `${num}m`;
  if (/^year/i.test(u) || u === "yr" || u === "y") return `${num}y`;
  if (unit.trim().length <= 5) return `${num} ${unit.trim()}`;
  return num;
}

export const DSP_ABBREVIATIONS: Record<string, string> = {
  HRR: "House Rent Recovery",
  "P&A": "Personnel & Administration",
  HRA: "House Rent Allowance",
  DA: "Dearness Allowance",
  NPA: "Non-Practicing Allowance",
  IIT: "Indian Institute of Technology",
  IIM: "Indian Institute of Management",
  VDA: "Variable Dearness Allowance",
  FDA: "Fixed Dearness Allowance",
  OPD: "Out Patient Department",
  IPD: "In Patient Department",
  "M&HS": "Medical & Health Services",
  HOD: "Head of Department",
  HoD: "Head of Department",
  "C&IT": "Computers & Information Technology",
  ED: "Executive Director",
  CGM: "Chief General Manager",
  GM: "General Manager",
  DGM: "Deputy General Manager",
  AGM: "Assistant General Manager",
  PF: "Provident Fund",
  CUG: "Closed User Group",
  LTC: "Leave Travel Concession",
  LTA: "Leave Travel Allowance",
  PL: "Privilege Leave",
  CL: "Casual Leave",
  HPL: "Half Pay Leave",
  EL: "Earned Leave",
  SIR: "Special Incentive Reward",
  NPS: "National Pension System",
  EPS: "Employees' Pension Scheme",
  TA: "Township Administration",
  RFID: "Radio Frequency Identification",
  CISF: "Central Industrial Security Force",
  GPAIS: "Group Personal Accident Insurance Scheme",
  BAMS: "Biometric Attendance Management System",
  SAP: "Systems, Applications & Products",
  ERP: "Enterprise Resource Planning",
  IMS: "Incident Management System",
  // SAIL units
  BSP: "Bhilai Steel Plant (Chhattisgarh)",
  DSP: "Durgapur Steel Plant (West Bengal)",
  RSP: "Rourkela Steel Plant (Odisha)",
  BSL: "Bokaro Steel Plant (Jharkhand)",
  ISP: "IISCO Steel Plant (Burnpur, West Bengal)",
  ASP: "Alloy Steels Plant (Durgapur, West Bengal)",
  SSP: "Salem Steel Plant (Tamil Nadu)",
  VISP: "Visvesvaraya Iron & Steel Plant (Bhadravati, Karnataka)",
  VISL: "Visvesvaraya Iron & Steel Plant (Bhadravati, Karnataka)",
  CFP: "Chandrapur Ferro Alloy Plant (Maharashtra)",
  SRU: "SAIL Refractory Unit",
  RDCIS: "Research & Development Centre for Iron & Steel (Ranchi)",
  CMO: "Central Marketing Organisation (Kolkata)",
  CET: "Centre for Engineering and Technology (Ranchi)",
  SSO: "Safety Organisation (Ranchi)",
  // SAP ERP projects of the SAIL units, and the SAP modules / tools named with them
  RACE: "Rapid Acceleration of Competitive Edge (SAP ERP project, DSP)",
  VIKRAM: "Value Integration through Information & Knowledge for Responsive & Agile Management (SAP ERP project, BSP)",
  SHAKTI: "Synergy and Harmony for Achieving Knowledge and Technological Integration (SAP ERP project, BSL)",
  SMART: "Systematic Management for Achieving Rapid Transformation (SAP ERP project, RSP)",
  PRAGATI: "Process Re-engineering and Automation for Growth and Agility Through Integration (SAP ERP project, CMO)",
  SRM: "SAP Supplier Relationship Management",
  ESS: "Employee Self Service",
  QCMS: "Quality Circle Management System",
  "REF ALLOW": "Refreshment Allowance",
  INC: "Incentive",
  AWA: "Additional Welfare Allowance",
  PMS: "Performance Management System",
  GST: "Goods and Services Tax",
  FY: "Financial Year",
  "w.e.f": "with effect from",
  "W.E.F": "with effect from",
  DARPAN: "Driving Advancement by Reimagining Performance Assessment and Nurturing (SAIL DARPAN)",
  SD: "Sales & Distribution",
  APO: "Assistant Personnel Officer", // in an SAP context: see ABBREVIATION_SENSE_BY_CONTEXT
  ISMS: "Information Security Management System",
  DPMS: "Digital Project Management Solution",
};


export { expansionFromPhrase };
import { KNOWN_SENSES } from "@/lib/search/abbreviationSenses";
import { isIdentifierLabel, isLongDigitRun } from "@/lib/ui/identifiers";

/**
 * One abbreviation, two meanings, chosen by what else the reply speaks of. "APO" is Assistant Personnel Officer in an ordinary circular, and the SAP
 * module Advanced Planner & Optimizer when the reply is about SAP / ERP (the module named with SD, SRM and the SAIL ERP project names).
 */
export const ABBREVIATION_SENSE_BY_CONTEXT: Record<string, { when: RegExp; expansion: string }> = {
  APO: { when: /\b(?:SAP|ERP|S\/4HANA|SRM|SD|DPMS|RACE|VIKRAM|SHAKTI|SMART|PRAGATI)\b|\bPlanner\b|\bSales & Distribution\b/, expansion: "Advanced Planner & Optimizer (SAP module)" },
};

export function extractRelevantAbbreviations(data: SynthesisResult): Array<[string, string]> {
  if (!data) return [];
  const corpusParts: string[] = [
    data.overview || "",
    ...(data.keyFindings || []).map((f) => f.text || ""),
    ...(data.table?.columns || []),
    ...((data.table?.rows || []).flat() || []),
    ...(data.extraTable?.columns || []),
    ...((data.extraTable?.rows || []).flat() || []),
    data.table?.title || "",
    data.extraTable?.title || "",
    ...(data.charts || []).flatMap((c) => [
      c.title || "",
      c.subtitle || "",
      c.unit || "",
      ...(c.items || []).map((it) => it.label || ""),
    ]),
  ];
  const corpus = corpusParts.join(" ");

  // The circulars' own sense comes first: a short form the circular defines ("financial assistance (FA)") or uses in a way the second reading
  // (edsVerify.ts) could settle ("as per TA rules": the travelling allowance, not the Township Administration) beats the list below.
  const own: Record<string, string> = data.abbreviations || {};
  const found: Array<[string, string]> = [];
  for (const [abbr, expansion] of Object.entries(DSP_ABBREVIATIONS)) {
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // case-sensitive: an abbreviation is written in capitals ("ED", "TA" must not match the words "ed" and "ta")
    const regex = new RegExp(`(?:^|[\\s(,./:;])(${escaped})s?(?:[\\s),./:;]|$)`); // "IITs" is the abbreviation IIT
    if (regex.test(corpus)) {
      const alt = ABBREVIATION_SENSE_BY_CONTEXT[abbr];
      // a short form with more than one confirmed sense that nothing has settled (no ruling from the second reading, no context rule) shows BOTH senses,
      // never the list's one alone: "TA" in "as per TA rules" is the travelling allowance, and showing "Township Administration" there was wrong (11 Nov 2026)
      const unsettled = !own[abbr] && !alt && (KNOWN_SENSES[abbr]?.length ?? 0) > 1;
      found.push([abbr, own[abbr] || (alt && alt.when.test(corpus) ? alt.expansion : unsettled ? KNOWN_SENSES[abbr].join(" or ") : expansion)]);
    }
  }
  for (const [abbr, expansion] of Object.entries(own)) {
    if (!found.some(([a]) => a === abbr)) found.push([abbr, expansion]);
  }

  // Also check for dynamic patterns in corpus: "Full Phrase (ABBR)"
  const dynamicMatch = corpus.matchAll(/\b([A-Za-z][A-Za-z\s&]{2,80})\s*\(([A-Z]{2,6})\)/g);
  for (const m of dynamicMatch) {
    const full = m[1].trim();
    const abbr = m[2].trim();
    const expansion = expansionFromPhrase(abbr, full);
    if (
      expansion &&
      !found.some(([a]) => a.toUpperCase() === abbr.toUpperCase()) &&
      !DSP_ABBREVIATIONS[abbr] &&
      expansion.length > abbr.length
    ) {
      found.push([abbr, expansion]);
    }
  }

  return found;
}

/** True when the bracketed text names who approves ("Head of P&A", "Concerned Functional Director", "CGM", "Chief Executive"), not a note ("Mandatory", "Phase-1 Enrolment"). */
export function looksLikeAuthority(text: string): boolean {
  return /\b(head|director|manager|chief|executive|authority|officer|hod|cgm|gm|dgm|agm|ed|chairman|committee|board|secretary|administrator|administration|p&a|incharge|in-charge|competent|approv\w*|sanction\w*)\b/i.test(text || "");
}

/** True when the bracket holds money ("officer Rs - 250/- and employees/CW-Rs- 100/-", "Officers: Rs.500/-"): that is the penalty or the rate itself, never a note and never an approver (the word "officer" in it does not make it one). */
export function bracketIsAmount(text: string): boolean {
  return /(?:₹|\bRs\b\.?)\s*[-:]?\s*\d|\d\s*\/-/i.test(text || "");
}

/**
 * Splits a cell of the "value (bracket) [condition]" shape, or returns null when it is not that shape. Not split: a bracket glued to the word before it ("Section no: 5(Xii)" is a clause
 * reference, one thing), and a bracket that holds money (it stays inside the value: the penalty is the answer, not a footnote).
 */
export function splitValueBracket(trimmed: string): { rate: string; bracket: string; condition: string } | null {
  const m = trimmed.match(/^(.+?)\s+\(([^()]+)\)\s*(?:\[([^\]]+)\])?$/);
  if (!m) return null;
  // a bracket that only finishes the phrase before it is part of the sentence, not a note or an approver: "... Projects & TS (Elec.)" (an abbreviation ending in a full stop, after "&", "and", "of"...)
  if (/^[^\s()]+\.$/.test(m[2].trim()) || /(?:&|\b(?:and|or|of|to|in|for|on|at))$/i.test(m[1].trim())) return null;
  // a bare title followed by its function ("Director (Personnel)", "Chief General Manager (HR)") is ONE designation: the bracket is part of the name, not a footnote
  if (m[1].trim().split(/\s+/).length <= 4 && /\b(?:director|manager|officer|executive|head|chairman|secretary|incharge|in-charge|chief)$/i.test(m[1].trim()) && m[2].trim().split(/\s+/).length <= 3 && !/\d/.test(m[2]) && !m[3]) return null;
  // a lead of nine or more words is a sentence of the circular ("Submit entry forms at ... by 15th January, 2026 (6:00 PM)"), not a value with a footnote: it stays one plain line, not a bold lead with a detached note;
  // an approver in the bracket still splits (the long rate before "(Head of P&A)" is a rate)
  if (m[1].trim().split(/\s+/).length >= 9 && !looksLikeAuthority(m[2]) && !m[3]) return null;
  if (bracketIsAmount(m[2])) {
    // the money stays in the value; only a trailing [condition] is split off
    return m[3] ? { rate: `${m[1].trim()} (${m[2].trim()})`, bracket: "", condition: m[3].trim() } : null;
  }
  return { rate: m[1].trim(), bracket: m[2].trim(), condition: (m[3] || "").trim() };
}

export function renderEnterpriseTableCell(cell: string, colIndex: number, colName: string) {
  const trimmed = (cell || "").replace(/\s*\[\s*\]/g, "").trim(); // an empty condition "[]" is nothing

  // 1. First column (Parameter / Period / Milestone)
  if (colIndex === 0) {
    return (
      <div className="flex items-start gap-2">
        <span className="mt-1 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-100 shrink-0" />
        <span className="font-bold text-slate-800 text-xs sm:text-sm tracking-tight leading-snug">
          {trimmed}
        </span>
      </div>
    );
  }

  // 2. Negative / Not applicable / Not permitted / N/A / Nil / None / Not stated
  const notAppPattern = /^(?:not\s+(?:applicable|permitted|allowed|stated)|n\/?a|nil|none|-)/i;
  if (notAppPattern.test(trimmed)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-slate-100/90 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 shadow-xs">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
        <span>{trimmed}</span>
      </span>
    );
  }

  // 3. Rate + Authority (+ condition) pattern: "4x Standard HRR (Head of P&A)", "Standard HRR (Head of Administration)", "4x Standard HRR (Head of P&A) [Mumbai: up to the 4th month only]"
  const authMatch = splitValueBracket(trimmed);
  if (authMatch) {
    const rate = authMatch.rate;
    const authority = authMatch.bracket;
    const condition = authMatch.condition;
    const isAuthority = !!authority && looksLikeAuthority(authority);
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight leading-snug">
          {rate}
        </span>
        {isAuthority ? (
          <div className="flex items-center gap-1 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50/90 px-2 py-0.5 text-[11px] font-semibold text-amber-900 border border-amber-200/80 shadow-xs">
              <UserCheck size={12} className="text-amber-700 shrink-0" />
              <span>{authority}</span>
            </span>
          </div>
        ) : authority ? (
          <div className="flex items-start gap-1 text-[11px] leading-snug text-slate-500">
            <Info size={12} className="mt-px shrink-0 text-slate-400" />
            <span>{authority}</span>
          </div>
        ) : null}
        {condition && (
          <div className="flex items-start gap-1 text-[11px] leading-snug text-slate-500">
            <Info size={12} className="mt-px shrink-0 text-slate-400" />
            <span>{condition}</span>
          </div>
        )}
      </div>
    );
  }

  // 3a. AN IDENTIFIER IS NOT AN AMOUNT (src/lib/ui/identifiers.ts): a cell that is only digits under an identifier heading (Account Number, IFSC, Policy No.), or a run of nine digits or more, is shown as
  // the circular prints it, digits unbroken: never grouped with commas and never turned into a number (a long account number would lose its last digits as one).
  {
    const idDigits = /^\d+(?:[,\s]\d{2,4}){0,6}$/.test(trimmed) ? trimmed.replace(/[,\s]/g, "") : "";
    if (idDigits && (isLongDigitRun(idDigits) || (isIdentifierLabel(colName) && /^\d+$/.test(idDigits) && idDigits.length >= 5))) {
      return <span className="text-xs sm:text-sm font-semibold tabular-nums tracking-wide text-slate-800 leading-relaxed">{idDigits}</span>;
    }
  }

  // 3b. A bare amount ("13478.00", "₹ 3350.00"): the same Indian digit grouping the findings use ("13,478.00"), the decimals as the circular prints them
  const bare = /^(₹|Rs\.?)?\s*(\d{1,3}(?:,\d{2,3})*|\d+)(\.\d+)?(\/-)?$/.exec(trimmed);
  const bareInt = bare ? Number(bare[2].replace(/,/g, "")) : NaN;
  // a whole number that reads as a YEAR (2024) is not an amount: it is left as it is
  if (bare && !(!bare[3] && !bare[1] && bareInt >= 1900 && bareInt <= 2100)) {
    const intPart = Number(bare[2].replace(/,/g, ""));
    const dec = bare[3] ? bare[3].length - 1 : 0;
    const shown = intPart.toLocaleString("en-IN") + (bare[3] ?? "");
    return (
      <span className="text-xs sm:text-sm font-semibold tabular-nums text-slate-800 leading-relaxed">
        {bare[1] ? `${bare[1] === "₹" ? "₹" : bare[1]} ` : ""}
        {dec > 0 ? shown : intPart.toLocaleString("en-IN")}
        {bare[4] ?? ""}
      </span>
    );
  }

  // 4. Default standard cell
  return (
    <span className="text-xs sm:text-sm font-semibold text-slate-800 leading-relaxed">
      {trimmed}
    </span>
  );
}

/* ---- shared tooltip ---- */
function ChartTooltip({
  active,
  payload,
  label,
  unit,
  decimals,
}: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="min-w-[190px] rounded-lg border border-amber-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm">
      {label != null && (
        <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
          {label}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((p: any, i: number) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 text-xs font-medium text-slate-700"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ background: p.color || p.fill }}
              />
              <span className="truncate text-slate-600">{p.name}:</span>
            </div>
            <span className="font-bold text-slate-900 tabular-nums shrink-0 text-right">
              {typeof p.value === "number"
                ? formatValue(p.value, unit, decimals)
                : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const iconFor: Record<string, React.ReactNode> = {
  pie: <PieIcon size={14} />,
  bar: <BarChart3 size={14} />,
  line: <TrendingUp size={14} />,
  timeline: <GitCommitHorizontal size={14} />,
  scatter: <ScatterIcon size={14} />,
  kpi: <Gauge size={14} />,
};

/* ================================================================== *
 * Individual chart renderers
 * ================================================================== */

function PieViz({ chart }: { chart: SynthesisChart }) {
  const data = chart.items.map((it) => ({
    name: it.label,
    value: it.value,
    detail: it.detail,
  }));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const share = (v: number) => (total > 0 ? (Math.round((v / total) * 1000) / 10).toFixed(1) : "0.0");
  // The ring shows the proportions; the list beside it gives every part its amount and its share (a ring alone hides the small parts), and the
  // centre gives the whole. (Our own list instead of the chart library's legend: it also keeps the chart free of the measuring loop of that legend.)
  return (
    <div className="flex w-full flex-col items-center gap-3 md:flex-row md:items-center">
      <div className="relative h-[240px] w-full md:w-[46%]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={CHART_HEIGHT - 20} debounce={50}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={100}
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              content={<ChartTooltip unit={chart.unit} decimals={chartDecimals(chart)} />}
              isAnimationActive={false}
              animationDuration={0}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</span>
          <span className="text-sm font-extrabold tabular-nums text-slate-900">{formatValue(total, chart.unit, chartDecimals({ items: [...chart.items, { value: total }] }))}</span>
        </div>
      </div>
      <ul className="w-full divide-y divide-slate-100 text-xs md:w-[54%]">
        {data.map((d, i) => (
          <li key={i} className="flex items-center justify-between gap-3 py-1.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="truncate font-semibold text-slate-700">{d.name}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
              <span className="font-bold text-slate-900">{formatValue(d.value, chart.unit, chartDecimals(chart))}</span>
              <span className="w-12 text-right text-slate-500">{share(d.value)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarViz({ chart }: { chart: SynthesisChart }) {
  const hasB = chart.items.some((it) => typeof it.secondaryValue === "number");
  const [aName, bName] = chart.entityLabels ?? ["Value", "Comparison"];
  const data = chart.items.map((it) => ({
    name: it.label,
    a: it.value,
    b: it.secondaryValue,
  }));
  return (
    <div className="w-full h-[260px] relative">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={CHART_HEIGHT} debounce={50}>
        <BarChart data={data} margin={{ top: 22, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            interval={0}
            angle={data.length > 4 ? -12 : 0}
            textAnchor={data.length > 4 ? "end" : "middle"}
            height={data.length > 4 ? 48 : 30}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v) => compactChartValue(v, chart.unit, chartDecimals(chart))}
          />
          <Tooltip
            cursor={{ fill: "rgba(245,158,11,0.06)" }}
            content={<ChartTooltip unit={chart.unit} decimals={chartDecimals(chart)} />}
            isAnimationActive={false}
            animationDuration={0}
          />
          {hasB && (
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              itemSorter={null}
              wrapperStyle={{ fontSize: 12, paddingTop: 6 }}
            />
          )}
          <Bar
            dataKey="a"
            name={aName}
            fill={SERIES_A}
            radius={[6, 6, 0, 0]}
            maxBarSize={54}
            isAnimationActive={false}
          >
            {!hasB &&
              data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            <LabelList
              dataKey="a"
              position="top"
              offset={6}
              formatter={(val: any) => (typeof val === "number" ? compactChartValue(val, chart.unit, chartDecimals(chart)) : val)}
              style={{ fontSize: 13.5, fill: "#0f172a", fontWeight: 800 }}
            />
          </Bar>
          {hasB && (
            <Bar
              dataKey="b"
              name={bName}
              fill={SERIES_B}
              radius={[6, 6, 0, 0]}
              maxBarSize={54}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="b"
                position="top"
                offset={6}
                formatter={(val: any) => (typeof val === "number" ? compactChartValue(val, chart.unit, chartDecimals(chart)) : val)}
                style={{ fontSize: 13.5, fill: "#0f172a", fontWeight: 800 }}
              />
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LineViz({ chart }: { chart: SynthesisChart }) {
  const data = chart.items.map((it) => ({
    name: it.label,
    value: it.value,
    detail: it.detail,
  }));
  return (
    <div className="w-full h-[260px] relative">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={CHART_HEIGHT} debounce={50}>
        <LineChart data={data} margin={{ top: 22, right: 18, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="name"
            padding={{ left: 40, right: 40 }}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.18)]}
            tickFormatter={(v) => compactChartValue(v, chart.unit, chartDecimals(chart))}
          />
          <Tooltip
            content={<ChartTooltip unit={chart.unit} decimals={chartDecimals(chart)} />}
            isAnimationActive={false}
            animationDuration={0}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={chart.title}
            stroke="url(#lineGrad)"
            strokeWidth={3}
            dot={{ r: 4, fill: "#f59e0b", strokeWidth: 2, stroke: "#fff" }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="value"
              position="top"
              offset={6}
              formatter={(val: any) => (typeof val === "number" ? compactChartValue(val, chart.unit, chartDecimals(chart)) : val)}
              style={{ fontSize: 13.5, fill: "#0f172a", fontWeight: 800 }}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScatterViz({ chart }: { chart: SynthesisChart }) {
  const [xName, yName] = chart.entityLabels ?? ["X", "Y"];
  const data = chart.items.map((it) => ({
    x: it.value,
    y: it.secondaryValue ?? 0,
    name: it.label,
  }));
  return (
    <div className="w-full h-[260px] relative">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={CHART_HEIGHT} debounce={50}>
        <ScatterChart margin={{ top: 16, right: 18, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            type="number"
            dataKey="x"
            name={xName}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            label={{
              value: xName,
              position: "insideBottom",
              offset: -4,
              style: { fontSize: 11, fill: "#94a3b8" },
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={yName}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            width={44}
            label={{
              value: yName,
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "#94a3b8" },
            }}
          />
          <ZAxis range={[80, 80]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={<ChartTooltip unit={chart.unit} decimals={chartDecimals(chart)} />}
            isAnimationActive={false}
            animationDuration={0}
          />
          <Scatter data={data} fill={SERIES_A} isAnimationActive={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function TimelineViz({ chart }: { chart: SynthesisChart }) {
  return (
    <div className="relative py-2 pl-2">
      <div className="absolute left-[13px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-amber-400 via-orange-400 to-amber-200" />
      <ol className="space-y-4">
        {chart.items.map((it, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="relative flex gap-4"
          >
            <span className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-amber-500 to-orange-500 text-[10px] font-black text-white shadow-md">
              {i + 1}
            </span>
            <div className="flex-1 pb-1">
              <div className="text-sm font-bold text-slate-900">{it.label}</div>
              {it.detail && (
                <div className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  {it.detail}
                </div>
              )}
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

function KpiViz({ chart }: { chart: SynthesisChart }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {chart.items.map((it, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50/50 p-3.5 shadow-sm"
        >
          <div className="text-2xl font-black tracking-tight text-amber-900">
            {formatValue(it.value, chart.unit, chartDecimals(chart))}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700/80">
            {it.label}
          </div>
          {it.detail && (
            <div className="mt-1 text-[11px] leading-snug text-slate-500">
              {it.detail}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function ChartCard({
  chart,
  citations = [],
  onOpenCircular,
}: {
  chart: SynthesisChart;
  citations?: SynthesisResult["citations"];
  onOpenCircular?: (id: number) => void;
}) {
  let body: React.ReactNode = null;
  switch (chart.type) {
    case "pie":
      body = <PieViz chart={chart} />;
      break;
    case "bar":
      body = <BarViz chart={chart} />;
      break;
    case "line":
      body = <LineViz chart={chart} />;
      break;
    case "scatter":
      body = <ScatterViz chart={chart} />;
      break;
    case "timeline":
      body = <TimelineViz chart={chart} />;
      break;
    case "kpi":
      body = <KpiViz chart={chart} />;
      break;
    default:
      return null;
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
            {iconFor[chart.type]}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight text-slate-900">
              {chart.title}
            </div>
            {chart.subtitle && (
              <div className="text-[11px] font-medium text-slate-500">
                {chart.subtitle}
              </div>
            )}
          </div>
        </div>
        {chart.unit && chart.type !== "timeline" && (
          <span className="shrink-0 rounded-md border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            Metric: {chart.unit}
          </span>
        )}
      </div>
      {body}
      <SourceRow ids={chart.sources} citations={citations} onOpenCircular={onOpenCircular} />
    </div>
  );
}

/** "Source: [Circular 046 (2022)]": which circular a chart or a table was read from. Nothing is drawn when the briefing names none. */
function SourceRow({
  ids,
  citations,
  onOpenCircular,
}: {
  ids?: number[];
  citations: SynthesisResult["citations"];
  onOpenCircular?: (id: number) => void;
}) {
  const known = (ids ?? []).filter((id) => citations.some((c) => c.id === id));
  if (known.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Source</span>
      <CitationChips ids={known} citations={citations} onOpenCircular={onOpenCircular} />
    </div>
  );
}

/* ================================================================== *
 * Citation chip
 * ================================================================== */

/* Inline markdown for a single finding line — renders **bold** etc. but keeps
 * everything inline (no block <p>) so the citation chip sits on the same line. */
/** Rupee amounts in running text get the same Indian digit grouping as the charts and tables ("₹ 2400/-" -> "₹ 2,400/-"); "/-" and decimals stay as written. */
export function groupRupees(text: string): string {
  // (an amount of more than fifteen digits is not an amount: it is an identifier and keeps its digits)
  return (text || "").replace(/(₹|Rs\.?)(\s*)(\d{4,})(\.\d+)?/g, (_m, sym: string, sp: string, int: string, dec?: string) => (int.length > 15 ? _m : `${sym}${sp}${Number(int).toLocaleString("en-IN")}${dec ?? ""}`));
}

function renderInlineMarkdown(input: unknown): React.ReactNode[] {
  const text = groupRupees(
    typeof input === "string" ? input : input == null ? "" : String(input),
  );
  if (!text) return [];
  // Split on **bold** and *italic*; render the rest as plain text. This avoids
  // react-markdown entirely (its v10 build asserts children must be a string
  // and was crashing the briefing), while covering the only inline markdown the
  // synthesis emits.
  const nodes: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-bold text-slate-950">
          {m[1]}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      nodes.push(
        <em key={key++} className="italic">
          {m[2]}
        </em>,
      );
    } else if (m[3] !== undefined) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em] font-medium text-slate-800"
        >
          {m[3]}
        </code>,
      );
    }
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function InlineMD({ text }: { text: unknown }) {
  const nodes = renderInlineMarkdown(text);
  if (nodes.length === 0) return null;
  return <>{nodes}</>;
}
function CitationChips({
  ids,
  citations,
  onOpenCircular,
}: {
  ids: number[];
  citations: SynthesisResult["citations"];
  onOpenCircular?: (id: number) => void;
}) {
  if (!ids || ids.length === 0) return null;
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => {
        const c = citations.find((x) => x.id === id);
        if (!c) return null;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onOpenCircular?.(id)}
            title={formatCircularTitle(c.headline)}
            className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 transition-colors hover:border-amber-400 hover:bg-amber-100 hover:text-amber-900"
          >
            <FileText size={10} />
            {c.label
              ? c.label
              : c.publishedAt
                ? DateTime.fromISO(c.publishedAt).toFormat("yyyy")
                : "Source"}
          </button>
        );
      })}
    </span>
  );
}

/* ================================================================== *
 * Main component
 * ================================================================== */

/** One comparison table, with its caption (when it has one) and the circular(s) it was read from. */
function TableBlock({
  table,
  citations,
  onOpenCircular,
}: {
  table: NonNullable<SynthesisResult["table"]>;
  citations: SynthesisResult["citations"];
  onOpenCircular?: (id: number) => void;
}) {
  if (!table || table.rows.length === 0) return null;
  return (
    <div>
      {table.title && (
        <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
          {table.title}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="border-b border-slate-200 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100">
              <tr>
                {table.columns.map((c, i) => (
                  <th
                    key={i}
                    // first column 28%; the others share the rest equally (2 value columns = 36% each, 3 = 24% each)
                    style={{ width: i === 0 ? "28%" : `${72 / Math.max(1, table.columns.length - 1)}%` }}
                    className={`px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider ${
                      i === 0 ? "text-slate-600" : "text-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {i > 0 && <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />}
                      <span>{c}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {table.rows.map((row, ri) => (
                <tr
                  key={ri}
                  className={`transition-colors hover:bg-amber-50/30 ${
                    ri % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                  }`}
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-4 py-3 align-top"
                    >
                      {renderEnterpriseTableCell(cell, ci, table.columns[ci] || "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-1">
          <SourceRow ids={table.sources} citations={citations} onOpenCircular={onOpenCircular} />
        </div>
      </div>
    </div>
  );
}

export function ExecutiveBriefing({
  data,
  onOpenCircular,
  question,
}: ExecutiveBriefingProps) {
  const {
    overview,
    headline,
    keyFindings = [],
    table,
    extraTable,
    charts = [],
    citations = [],
  } = data;

  const abbreviations = React.useMemo(
    () => extractRelevantAbbreviations(data),
    [data],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6 overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/70 via-white to-orange-50/40 shadow-[0_8px_30px_rgba(245,158,11,0.10)]"
    >
      {/* Header band */}
      <div className="flex items-center gap-2.5 border-b border-amber-100 bg-gradient-to-r from-amber-500/10 via-orange-400/5 to-transparent px-5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm">
          <Sparkles size={15} />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">
            Executive Deep Synthesis
          </div>
          {headline && (
            <div className="truncate text-sm font-bold tracking-tight text-slate-900">
              {headline}
            </div>
          )}
        </div>
        {/* only an Executive Deep Synthesis reply is drawn by this component, so only it has the PDF button */}
        {hasPdfContent(data) && <EdsPdfButton data={data} question={question} abbreviations={abbreviations} />}
      </div>

      <div className="space-y-5 p-5">
        {/* Overview */}
        {overview && String(overview).trim() && (
          <div className="text-sm leading-relaxed text-slate-800">
            {String(overview)
              .split(/\n\n+/)
              .map((para, i) => (
                <p key={i} className="mb-2 last:mb-0">
                  {renderInlineMarkdown(para)}
                </p>
              ))}
          </div>
        )}

        {/* Key findings */}
        {keyFindings.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Key Findings
            </div>
            <ul className="space-y-2">
              {keyFindings.map((f, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex gap-2.5 text-sm leading-relaxed text-slate-700"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>
                    <InlineMD text={f.text} />
                    <CitationChips
                      ids={f.sources}
                      citations={citations}
                      onOpenCircular={onOpenCircular}
                    />
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>
        )}

        {/* Charts */}
        {charts.length > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {charts.map((c, i) => (
              <div
                key={i}
                className={
                  charts.length % 2 === 1 && i === charts.length - 1
                    ? "lg:col-span-2"
                    : ""
                }
              >
                <ChartCard chart={c} citations={citations} onOpenCircular={onOpenCircular} />
              </div>
            ))}
          </div>
        )}

        {/* Comparison table */}
        {table && table.rows.length > 0 && <TableBlock table={table} citations={citations} onOpenCircular={onOpenCircular} />}
        {extraTable && extraTable.rows.length > 0 && <TableBlock table={extraTable} citations={citations} onOpenCircular={onOpenCircular} />}

        {/* Source and Abbreviations strip */}
        {(citations.length > 0 || abbreviations.length > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-100 pt-3">
            {citations.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Sources
                </span>
                {citations.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onOpenCircular?.(c.id)}
                    title={formatCircularTitle(c.headline)}
                    className="inline-flex max-w-[340px] items-start gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-left text-[11px] font-medium text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:text-primary-600 hover:shadow"
                  >
                    <FileText size={11} className="mt-0.5 shrink-0 text-amber-500" />
                    <span className="line-clamp-2 leading-snug">
                      {c.label && <span className="font-bold text-slate-800">{c.label} · </span>}
                      {formatCircularTitle(c.headline)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div />
            )}

            {abbreviations.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">
                  Abbreviations:
                </span>
                {abbreviations.map(([abbr, full]) => (
                  <span
                    key={abbr}
                    className="inline-flex items-center gap-1 rounded border border-slate-200/90 bg-slate-50/90 px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-2xs"
                  >
                    <span className="font-bold text-slate-800">{abbr}</span>
                    <span className="text-slate-400">:</span>
                    <span>{full}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default ExecutiveBriefing;

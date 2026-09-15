// src/components/ExecutiveBriefing.tsx
"use client";

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

function formatValue(v: number, unit?: string): string {
  const num =
    Math.abs(v) >= 1000 ? v.toLocaleString("en-IN") : `${v}`;
  if (!unit) return num;
  if (unit === "₹") return `₹${num}`;
  if (unit === "%") return `${num}%`;
  return `${num} ${unit}`;
}

/* ---- shared tooltip ---- */
function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm">
      {label != null && (
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {label}
        </div>
      )}
      {payload.map((p: any, i: number) => (
        <div
          key={i}
          className="flex items-center gap-2 text-xs font-medium text-slate-700"
        >
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: p.color || p.fill }}
          />
          <span>{p.name}:</span>
          <span className="font-bold text-slate-900">
            {typeof p.value === "number"
              ? formatValue(p.value, unit)
              : p.value}
          </span>
        </div>
      ))}
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
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          stroke="#fff"
          strokeWidth={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip unit={chart.unit} />} />
        <Legend
          verticalAlign="bottom"
          height={36}
          iconType="circle"
          wrapperStyle={{ fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
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
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
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
          width={44}
        />
        <Tooltip
          cursor={{ fill: "rgba(245,158,11,0.06)" }}
          content={<ChartTooltip unit={chart.unit} />}
        />
        {hasB && <Legend wrapperStyle={{ fontSize: 12 }} />}
        <Bar dataKey="a" name={aName} fill={SERIES_A} radius={[6, 6, 0, 0]} maxBarSize={54}>
          {!hasB &&
            data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          {!hasB && (
            <LabelList
              dataKey="a"
              position="top"
              style={{ fontSize: 11, fill: "#475569", fontWeight: 600 }}
            />
          )}
        </Bar>
        {hasB && (
          <Bar
            dataKey="b"
            name={bName}
            fill={SERIES_B}
            radius={[6, 6, 0, 0]}
            maxBarSize={54}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineViz({ chart }: { chart: SynthesisChart }) {
  const data = chart.items.map((it) => ({
    name: it.label,
    value: it.value,
    detail: it.detail,
  }));
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={data} margin={{ top: 16, right: 18, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip content={<ChartTooltip unit={chart.unit} />} />
        <Line
          type="monotone"
          dataKey="value"
          name={chart.title}
          stroke="url(#lineGrad)"
          strokeWidth={3}
          dot={{ r: 4, fill: "#f59e0b", strokeWidth: 2, stroke: "#fff" }}
          activeDot={{ r: 6 }}
        >
          <LabelList
            dataKey="value"
            position="top"
            style={{ fontSize: 11, fill: "#475569", fontWeight: 600 }}
          />
        </Line>
      </LineChart>
    </ResponsiveContainer>
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
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
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
          content={<ChartTooltip unit={chart.unit} />}
        />
        <Scatter data={data} fill={SERIES_A}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
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
            {formatValue(it.value, chart.unit)}
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

function ChartCard({ chart }: { chart: SynthesisChart }) {
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
      <div className="mb-3 flex items-start gap-2">
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
      {body}
    </div>
  );
}

/* ================================================================== *
 * Citation chip
 * ================================================================== */

/* Inline markdown for a single finding line — renders **bold** etc. but keeps
 * everything inline (no block <p>) so the citation chip sits on the same line. */
function renderInlineMarkdown(input: unknown): React.ReactNode[] {
  const text =
    typeof input === "string" ? input : input == null ? "" : String(input);
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
            title={c.headline}
            className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 transition-colors hover:border-amber-400 hover:bg-amber-100 hover:text-amber-900"
          >
            <FileText size={10} />
            {c.publishedAt
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

export function ExecutiveBriefing({
  data,
  onOpenCircular,
}: ExecutiveBriefingProps) {
  const {
    overview,
    headline,
    keyFindings = [],
    table,
    charts = [],
    citations = [],
  } = data;

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
                <ChartCard chart={c} />
              </div>
            ))}
          </div>
        )}

        {/* Comparison table */}
        {table && table.rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-sm">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead className="bg-slate-100/80 text-slate-800">
                <tr>
                  {table.columns.map((c, i) => (
                    <th
                      key={i}
                      className="px-4 py-2.5 font-bold tracking-tight"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className="transition-colors hover:bg-amber-50/40"
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`px-4 py-2.5 align-top ${
                          ci === 0
                            ? "font-semibold text-slate-800"
                            : "text-slate-700"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Source strip */}
        {citations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-amber-100 pt-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Sources
            </span>
            {citations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpenCircular?.(c.id)}
                title={c.headline}
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:text-amber-800 hover:shadow"
              >
                <FileText size={11} className="shrink-0 text-amber-500" />
                <span className="truncate">{c.headline}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default ExecutiveBriefing;

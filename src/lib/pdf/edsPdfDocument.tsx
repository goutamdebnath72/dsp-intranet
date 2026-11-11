// src/lib/pdf/edsPdfDocument.tsx
//
// THE PAINTER of the EDS PDF: takes the document model (edsPdfModel.ts) and lays it out on A4 pages with @react-pdf/renderer. It decides nothing about the content.
// Loaded only when someone clicks "Download PDF" (the library is large). Every block that must stay whole (a finding, a chart card, a table row) is unbreakable, so a page
// never cuts one in half; a long table continues on the next page.
import React from "react";
import { Circle, Document, G, Line, Page, Path, StyleSheet, Svg, Text as PdfText, View } from "@react-pdf/renderer";
import { splitScripts, tableFitsOnePage, type BarModel, type CellModel, type ChartModel, type KpiModel, type LineModel, type PdfModel, type PieModel, type Run, type ScatterModel, type TableModel, type TimelineModel } from "./edsPdfModel";
import { FAMILY, runStyle } from "./edsPdfFonts";

// The body line height (1.45) is set on EVERY text, not on the page and not on a wrapper: a page-level line height makes the library drop the footer's "Page x of y" (and the whole
// footer), and a line height inherited through a wrapper View is applied wider than 1.45 (the question, the table headings and the sources came out spaced out, and the section bars sat
// below their headings). A style given to a text overrides this one. EXCEPT the footer's page number: a text with a `render` function and ANY line height is dropped by the library, so it uses the library's own Text, with none.
const BODY_LINE_HEIGHT = 1.45;
const Text = ({ style, ...rest }: any) => <PdfText style={[{ lineHeight: BODY_LINE_HEIGHT }, style]} {...rest} />;

const C = {
  ink: "#0f172a",
  text: "#1e293b",
  body: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  rule: "#e2e8f0",
  soft: "#f1f5f9",
  amber: "#f59e0b",
  amberDark: "#b45309",
  amberDeep: "#78350f",
  amberTint: "#fffbeb",
  amberLine: "#fde68a",
  white: "#ffffff",
};

const NO_LIFT = 1.65; // pt: lifts the digit in the numbered circles to the exact centre

const s = StyleSheet.create({
  page: { paddingTop: 66, paddingBottom: 58, paddingHorizontal: 42, fontFamily: FAMILY.body, fontSize: 10, color: C.body },
  // fixed header / footer (on every page)
  header: { position: "absolute", top: 22, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 6, borderBottomWidth: 1.2, borderBottomColor: C.amber, borderBottomStyle: "solid" },
  headerLeft: { fontFamily: FAMILY.heading, fontWeight: 600, fontSize: 7.5, letterSpacing: 1.2, color: C.ink },
  headerRight: { fontSize: 7.5, letterSpacing: 0.8, color: C.amberDark, fontWeight: 600 },
  footer: { position: "absolute", bottom: 20, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingTop: 6, borderTopWidth: 0.6, borderTopColor: C.rule, borderTopStyle: "solid" },
  footerLeft: { width: "82%", fontSize: 7, color: C.muted, lineHeight: 1.35 },
  footerRight: { fontSize: 7.5, color: C.muted, fontWeight: 600 },
  // title block
  titleBlock: { backgroundColor: C.amberTint, borderLeftWidth: 4, borderLeftColor: C.amber, borderLeftStyle: "solid", paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12 },
  eyebrow: { fontSize: 7.5, fontWeight: 700, letterSpacing: 1.6, color: C.amberDark, marginBottom: 5 },
  title: { fontSize: 20, lineHeight: 1.22, color: C.ink },
  meta: { marginTop: 8, fontSize: 8.5, color: C.muted },
  question: { marginBottom: 14, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 0.8, borderColor: C.rule, borderStyle: "solid", borderRadius: 4, backgroundColor: C.soft },
  questionLabel: { fontSize: 7, fontWeight: 700, letterSpacing: 1.2, color: C.muted, marginBottom: 2 },
  questionText: { fontSize: 10, color: C.text, fontStyle: "italic" },
  // sections
  sectionHead: { flexDirection: "row", alignItems: "center", marginTop: 14, marginBottom: 7 },
  sectionBar: { width: 3, height: 11, backgroundColor: C.amber, marginRight: 6, borderRadius: 1 },
  sectionTitle: { fontSize: 9, letterSpacing: 1.3, color: C.ink },
  para: { marginBottom: 6, fontSize: 10.4, lineHeight: 1.5, color: C.text },
  finding: { flexDirection: "row", marginBottom: 6 },
  noBox: { width: 15, height: 15, borderRadius: 7.5, backgroundColor: C.amber, alignItems: "center", justifyContent: "center", marginRight: 8, marginTop: 1 },
  // the digit's ink sits 1.65pt below the centre of its line box (measured on the rendered page at 600 dpi: the font's ascent is larger than its descent), so the digit is lifted by that much
  noText: { fontSize: 8, fontWeight: 700, color: C.white, lineHeight: 1, position: "relative", top: -NO_LIFT, left: 0.12 },
  findingBody: { flex: 1, fontSize: 10.2, lineHeight: 1.5, color: C.text },
  ref: { fontSize: 7.5, fontWeight: 700, color: C.amberDark },
  // card (charts)
  card: { borderWidth: 0.8, borderColor: C.rule, borderStyle: "solid", borderRadius: 5, padding: 10, marginBottom: 10 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 },
  cardTitle: { fontSize: 10, color: C.ink },
  cardSub: { fontSize: 8, color: C.muted, marginTop: 1 },
  chip: { fontSize: 7.5, fontWeight: 600, color: C.amberDark, backgroundColor: C.amberTint, borderWidth: 0.6, borderColor: C.amberLine, borderStyle: "solid", borderRadius: 3, paddingVertical: 1.5, paddingHorizontal: 5 },
  cardSource: { marginTop: 7, paddingTop: 5, borderTopWidth: 0.6, borderTopColor: C.soft, borderTopStyle: "solid", flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  srcLabel: { fontSize: 6.8, fontWeight: 700, letterSpacing: 1, color: C.faint, marginRight: 5 },
  // tables
  tableTitle: { fontSize: 8.5, letterSpacing: 1, color: C.muted, marginBottom: 4 },
  tableHead: { flexDirection: "row", backgroundColor: C.soft, borderWidth: 0.8, borderColor: C.rule, borderStyle: "solid" },
  th: { paddingVertical: 6, paddingHorizontal: 7, fontSize: 7.8, fontWeight: 700, letterSpacing: 0.7, color: C.ink },
  tr: { flexDirection: "row", borderLeftWidth: 0.8, borderRightWidth: 0.8, borderBottomWidth: 0.6, borderColor: C.rule, borderStyle: "solid" },
  td: { paddingVertical: 6, paddingHorizontal: 7, fontSize: 9.2, lineHeight: 1.4 },
  // bar rows
  barRow: { marginBottom: 6 },
  barLabel: { fontSize: 8.6, color: C.text, marginBottom: 1.5 },
  barLine: { flexDirection: "row", alignItems: "center", marginBottom: 1.5 },
  barTrack: { flex: 1, height: 9, backgroundColor: C.soft, borderRadius: 2 },
  barValue: { width: 104, fontSize: 8.2, fontWeight: 600, color: C.ink, textAlign: "right" },
  // kpi + timeline
  kpiGrid: { flexDirection: "row", flexWrap: "wrap" },
  kpi: { width: "31.5%", marginRight: "1.8%", marginBottom: 7, padding: 8, backgroundColor: C.amberTint, borderWidth: 0.6, borderColor: C.amberLine, borderStyle: "solid", borderRadius: 4 },
  kpiValue: { fontSize: 15, fontWeight: 700, color: C.amberDeep },
  kpiLabel: { fontSize: 7.2, fontWeight: 700, letterSpacing: 0.6, color: C.amberDark, marginTop: 2 },
  kpiDetail: { fontSize: 7.8, color: C.muted, marginTop: 2, lineHeight: 1.3 },
  tlRow: { flexDirection: "row", marginBottom: 7 },
  // sources / abbreviations / note
  srcRow: { flexDirection: "row", marginBottom: 5 },
  srcNo: { width: 18, fontSize: 8.5, fontWeight: 700, color: C.amberDark },
  srcBody: { flex: 1, fontSize: 9, color: C.text, lineHeight: 1.4 },
  srcDate: { fontSize: 8, color: C.muted },
  abbrGrid: { flexDirection: "row", flexWrap: "wrap" },
  abbr: { width: "50%", fontSize: 8.6, marginBottom: 2.5, paddingRight: 8 },
});

/* ---------- text runs ---------- */

function Runs({ runs, style, heading = false, color, ...rest }: { runs: Run[]; style?: any; heading?: boolean; color?: string; [k: string]: any }) {
  return (
    <Text style={style} {...rest}>
      {runs.map((r, i) => (
        <PdfText key={i} style={{ ...runStyle(r, heading), ...(color ? { color } : {}), ...(r.code ? { color: C.amberDeep } : {}) }}>
          {r.text}
        </PdfText>
      ))}
    </Text>
  );
}

/** A plain string drawn with the right font for each script in it (a rupee sign, Hindi or Bengali words): the same as Runs, for text that is not markdown. */
function T({ children, style, heading = false, bold = false, color, ...rest }: { children: string; style?: any; heading?: boolean; bold?: boolean; color?: string; [k: string]: any }) {
  return <Runs runs={splitScripts(String(children ?? "")).map((r) => ({ ...r, bold }))} style={style} heading={heading} color={color} {...rest} />;
}

const Section = ({ title, ahead = 70 }: { title: string; ahead?: number }) => (
  <View style={s.sectionHead} minPresenceAhead={ahead}>
    <View style={s.sectionBar} />
    <T style={s.sectionTitle} heading bold>{title.toUpperCase()}</T>
  </View>
);

const SourceLine = ({ names }: { names: string[] }) =>
  names.length ? (
    <View style={s.cardSource}>
      <Text style={s.srcLabel}>SOURCE</Text>
      {names.map((n, i) => (
        <Text key={i} style={[s.ref, { marginRight: 7 }]}>{n}</Text>
      ))}
    </View>
  ) : null;

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/* ---------- charts ---------- */

/** Text inside a drawing: position, size, weight, colour and anchor in one place (the library reads the size and font from `style`). A drawing cannot mix fonts, so a rupee sign is written "Rs " there. */
function SvgText({ x, y, size = 7, color = C.muted, weight = 400, anchor = "start", children }: { x: number; y: number; size?: number; color?: string; weight?: number; anchor?: "start" | "middle" | "end"; children: string }) {
  return (
    <PdfText x={x} y={y} textAnchor={anchor} fill={color} style={{ fontFamily: FAMILY.body, fontSize: size, fontWeight: weight }}>
      {children.replace(/₹\s*/g, "Rs ")}
    </PdfText>
  );
}

function PieChart({ m }: { m: PieModel }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Svg width={140} height={140} viewBox="0 0 140 140">
        {m.slices.map((sl, i) => (sl.path ? <Path key={i} d={sl.path} fill={sl.color} stroke="#ffffff" strokeWidth={1.2} /> : null))}
        <SvgText x={70} y={68} anchor="middle" color={C.faint} size={7}>TOTAL</SvgText>
        <SvgText x={70} y={80} anchor="middle" color={C.ink} size={10} weight={700}>{clip(m.total, 14)}</SvgText>
      </Svg>
      <View style={{ flex: 1, marginLeft: 14 }}>
        {m.slices.map((sl, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 4 }} wrap={false}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: sl.color, marginRight: 6, marginTop: 2.5 }} />
            <T style={{ flex: 1, fontSize: 8.8 }} color={C.text}>{sl.label}</T>
            <T style={{ fontSize: 8.8, marginLeft: 6 }} color={C.ink} bold>{sl.value}</T>
            <Text style={{ width: 38, fontSize: 8.3, color: C.muted, textAlign: "right" }}>{sl.percent}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function BarChart({ m }: { m: BarModel }) {
  return (
    <View>
      {m.series.length > 0 && (
        <View style={{ flexDirection: "row", marginBottom: 6 }}>
          {m.series.map((sr, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: sr.color, marginRight: 4 }} />
              <T style={{ fontSize: 8 }} color={C.body}>{sr.name}</T>
            </View>
          ))}
        </View>
      )}
      {m.rows.map((r, i) => (
        <View key={i} style={s.barRow} wrap={false}>
          <T style={s.barLabel} color={C.text}>{r.label}</T>
          {r.bars.map((b, j) => (
            <View key={j} style={s.barLine}>
              <View style={s.barTrack}>
                <View style={{ width: `${b.widthPct}%`, height: 9, backgroundColor: b.color, borderRadius: 2 }} />
              </View>
              <T style={s.barValue} color={C.ink} bold>{b.value}</T>
            </View>
          ))}
          {r.detail ? <T style={{ fontSize: 7.8 }} color={C.muted}>{r.detail}</T> : null}
        </View>
      ))}
    </View>
  );
}

function LineChart({ m }: { m: LineModel }) {
  return (
    <Svg width={m.width} height={m.height} viewBox={`0 0 ${m.width} ${m.height}`}>
      {m.yTicks.map((t, i) => (
        <G key={i}>
          <Line x1={46} y1={t.y} x2={m.width - 14} y2={t.y} stroke={C.soft} strokeWidth={0.8} />
          <SvgText x={40} y={t.y + 2.6} anchor="end">{t.label}</SvgText>
        </G>
      ))}
      <Path d={m.path} stroke={C.amber} strokeWidth={2} fill="none" />
      {m.points.map((p, i) => (
        <G key={i}>
          <Circle cx={p.x} cy={p.y} r={3.2} fill={C.white} stroke={C.amber} strokeWidth={1.6} />
          <SvgText x={p.x} y={p.y - 7} anchor="middle" color={C.ink} size={7.2} weight={600}>{p.value}</SvgText>
          <SvgText x={p.x} y={m.height - 12} anchor="middle">{clip(p.label, 16)}</SvgText>
        </G>
      ))}
    </Svg>
  );
}

function ScatterChart({ m }: { m: ScatterModel }) {
  return (
    <Svg width={m.width} height={m.height} viewBox={`0 0 ${m.width} ${m.height}`}>
      {m.yTicks.map((t, i) => (
        <G key={`y${i}`}>
          <Line x1={46} y1={t.y} x2={m.width - 14} y2={t.y} stroke={C.soft} strokeWidth={0.8} />
          <SvgText x={40} y={t.y + 2.6} anchor="end">{t.label}</SvgText>
        </G>
      ))}
      {m.xTicks.map((t, i) => (
        <SvgText key={`x${i}`} x={t.x} y={m.height - 14} anchor="middle">{t.label}</SvgText>
      ))}
      {m.points.map((p, i) => (
        <G key={i}>
          <Circle cx={p.x} cy={p.y} r={3.6} fill={C.amber} stroke={C.white} strokeWidth={0.8} />
          <SvgText x={p.x + 6} y={p.y + 2.5} color={C.body}>{clip(p.label, 22)}</SvgText>
        </G>
      ))}
      <SvgText x={m.width / 2} y={m.height - 2} anchor="middle" size={7.4} weight={600}>{`${m.xName}  (horizontal)   |   ${m.yName}  (vertical)`}</SvgText>
    </Svg>
  );
}

function Timeline({ m }: { m: TimelineModel }) {
  return (
    <View>
      {m.items.map((it) => (
        <View key={it.n} style={s.tlRow} wrap={false}>
          <View style={s.noBox}><Text style={s.noText}>{it.n}</Text></View>
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 9.4 }} color={C.ink} bold>{it.label}</T>
            {it.detail ? <T style={{ fontSize: 8.6, marginTop: 1 }} color={C.body}>{it.detail}</T> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function Kpis({ m }: { m: KpiModel }) {
  return (
    <View style={s.kpiGrid}>
      {m.items.map((it, i) => (
        <View key={i} style={s.kpi} wrap={false}>
          <T style={s.kpiValue} color={C.amberDeep} bold>{it.value}</T>
          <T style={s.kpiLabel} color={C.amberDark} bold>{it.label.toUpperCase()}</T>
          {it.detail ? <T style={s.kpiDetail} color={C.muted}>{it.detail}</T> : null}
        </View>
      ))}
    </View>
  );
}

const ICON: Record<ChartModel["type"], string> = { pie: "SHARE OF WHOLE", bar: "COMPARISON", line: "TREND", scatter: "CORRELATION", timeline: "TIMELINE", kpi: "KEY NUMBERS" };

function ChartCard({ m }: { m: ChartModel }) {
  const long = (m.type === "bar" && m.rows.length > 10) || (m.type === "timeline" && m.items.length > 8) || (m.type === "kpi" && m.items.length > 12);
  return (
    <View style={s.card} wrap={long}>
      <View style={s.cardHead} wrap={false}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ fontSize: 6.8, fontWeight: 700, letterSpacing: 1, color: C.amberDark, marginBottom: 2 }}>{ICON[m.type]}</Text>
          <T style={s.cardTitle} heading color={C.ink}>{m.title}</T>
          {m.subtitle ? <T style={s.cardSub} color={C.muted}>{m.subtitle}</T> : null}
        </View>
        {m.metric ? <T style={s.chip} color={C.amberDark} bold>{m.metric}</T> : null}
      </View>
      {m.type === "pie" && <PieChart m={m} />}
      {m.type === "bar" && <BarChart m={m} />}
      {m.type === "line" && <LineChart m={m} />}
      {m.type === "scatter" && <ScatterChart m={m} />}
      {m.type === "timeline" && <Timeline m={m} />}
      {m.type === "kpi" && <Kpis m={m} />}
      <SourceLine names={m.sources} />
    </View>
  );
}

/* ---------- tables ---------- */

const bold = (runs: Run[]): Run[] => runs.map((r) => ({ ...r, bold: true }));

function Cell({ cell }: { cell: CellModel }) {
  switch (cell.kind) {
    case "label":
      return <Runs runs={bold(cell.main)} style={{ fontSize: 9.2 }} color={C.ink} />;
    case "none":
      return <Runs runs={cell.main.map((r) => ({ ...r, italic: true }))} style={{ fontSize: 8.6 }} color={C.faint} />;
    case "amount":
      return <Runs runs={bold(cell.main)} style={{ fontSize: 9.4 }} color={C.ink} />;
    case "rate":
      return (
        <View>
          <Runs runs={bold(cell.main)} style={{ fontSize: 9.4 }} color={C.ink} />
          {cell.authority ? (
            <View style={{ marginTop: 2.5, flexDirection: "row" }}>
              <Runs runs={bold(cell.authority)} style={{ fontSize: 7.9, color: C.amberDeep, backgroundColor: C.amberTint, borderWidth: 0.5, borderColor: C.amberLine, borderStyle: "solid", borderRadius: 2, paddingVertical: 1, paddingHorizontal: 4 }} color={C.amberDeep} />
            </View>
          ) : null}
          {cell.notes.map((n, i) => (
            <Runs key={i} runs={n} style={{ fontSize: 7.9, color: C.muted, marginTop: 2 }} color={C.muted} />
          ))}
        </View>
      );
    default:
      return <Runs runs={cell.main} style={{ fontSize: 9.2 }} color={C.text} />;
  }
}


function Table({ t, heading }: { t: TableModel; heading?: string }) {
  const whole = tableFitsOnePage(t);
  const [first, ...rest] = t.rows;
  const row = (r: CellModel[], ri: number) => (
    <View key={ri} style={[s.tr, { backgroundColor: ri % 2 === 1 ? "#f8fafc" : C.white }]} wrap={false}>
      {r.map((cell, ci) => (
        <View key={ci} style={[s.td, { width: `${t.widths[ci] ?? 100 / r.length}%` }]}>
          <Cell cell={cell} />
        </View>
      ))}
    </View>
  );
  return (
    // a table that FITS a page (by its estimated height, not by its row count) is one block (it moves to the next page whole, with its heading). A taller one STARTS ON A NEW PAGE and runs on, repeating its heading row on every page it continues onto: started lower on a page, the library leaves the (repeated) heading row alone at the foot of that page and puts the first row on the next one (found on the Zero Tolerance answer, 11 Nov 2026)
    <View style={{ marginBottom: 12 }} wrap={!whole} break={!whole}>
      {heading ? <Section title={heading} ahead={0} /> : null}
      {t.title ? <T style={s.tableTitle} heading color={C.muted}>{t.title.toUpperCase()}</T> : null}
      {/* in a long table the heading row is `fixed`: it is drawn again at the top of every page the table continues onto */}
      <View style={s.tableHead} fixed={!whole}>
        {t.columns.map((c, ci) => (
          <View key={ci} style={[s.th, { width: `${t.widths[ci] ?? 100 / t.columns.length}%` }]}>
            <Runs runs={c.map((x) => ({ ...x, text: x.text.toUpperCase(), bold: true }))} style={{ fontSize: 7.8, letterSpacing: 0.7 }} color={ci === 0 ? C.muted : C.ink} />
          </View>
        ))}
      </View>
      {first ? row(first, 0) : null}
      {rest.map((r, i) => row(r, i + 1))}
      {t.sources.length ? (
        <View style={[s.cardSource, { borderTopWidth: 0.6, borderTopColor: C.rule, marginTop: 0, paddingHorizontal: 7, paddingTop: 5, paddingBottom: 3, borderLeftWidth: 0.8, borderRightWidth: 0.8, borderBottomWidth: 0.8, borderColor: C.rule, borderStyle: "solid" }]} wrap={false}>
          <Text style={s.srcLabel}>SOURCE</Text>
          {t.sources.map((n, i) => (
            <Text key={i} style={[s.ref, { marginRight: 7 }]}>{n}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ---------- the document ---------- */

export function EdsPdfDocument({ model }: { model: PdfModel }) {
  return (
    <Document title={model.title} author="DSP Intranet" subject="Executive Deep Synthesis" creator="DSP Intranet" producer="DSP Intranet" language="en" keywords="executive briefing, circulars, DSP">
      <Page size="A4" style={s.page} wrap>
        <View style={s.header} fixed>
          <Text style={s.headerLeft}>DURGAPUR STEEL PLANT  ·  INTRANET</Text>
          <Text style={s.headerRight}>EXECUTIVE DEEP SYNTHESIS</Text>
        </View>
        <View style={s.footer} fixed>
          <Text style={s.footerLeft}>Summarised for convenience by the language model behind the Executive Deep Synthesis search, from the circulars listed under Sources; every figure is matched to their text. This is not a substitute for the circular: please verify against it before acting.</Text>
          <PdfText style={s.footerRight} render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

        <View style={s.titleBlock} wrap={false}>
          <Text style={s.eyebrow}>EXECUTIVE DEEP SYNTHESIS</Text>
          <T style={s.title} heading bold color={C.ink}>{model.title}</T>
          <T style={s.meta} color={C.muted}>{`Prepared ${model.generatedAt}   ·   ${model.sources.length} source circular${model.sources.length === 1 ? "" : "s"}`}</T>
        </View>

        {model.question ? (
          <View style={s.question} wrap={false}>
            <Text style={s.questionLabel}>QUESTION ASKED</Text>
            <T style={s.questionText} color={C.text}>{model.question}</T>
          </View>
        ) : null}

        {model.overview.length > 0 && (
          <View>
            <View wrap={false}>
              <Section title="Overview" />
              <Runs runs={model.overview[0]} style={s.para} />
            </View>
            {model.overview.slice(1).map((p, i) => (
              <Runs key={i} runs={p} style={s.para} />
            ))}
          </View>
        )}

        {model.findings.length > 0 && (
          <View>
            {model.findings.map((f, i) => {
              const row = (
                <View key={i} style={s.finding} wrap={false}>
                  <View style={s.noBox}><Text style={s.noText}>{i + 1}</Text></View>
                  <Text style={s.findingBody}>
                    {f.runs.map((r, j) => (
                      <PdfText key={j} style={runStyle(r)}>{r.text}</PdfText>
                    ))}
                    {f.refs.map((n, j) => (
                      <PdfText key={`r${j}`} style={s.ref}>{` [${n}]`}</PdfText>
                    ))}
                  </Text>
                </View>
              );
              // the heading travels with the first finding
              return i === 0 ? <View key={i} wrap={false}><Section title="Key findings" ahead={0} />{row}</View> : row;
            })}
          </View>
        )}

        {model.charts.map((c, i) =>
          i === 0 ? (
            // the heading travels with the first card
            <View key={i} wrap={false}>
              <Section title="Charts" ahead={0} />
              <ChartCard m={c} />
            </View>
          ) : (
            <ChartCard key={i} m={c} />
          ),
        )}

        {model.tables.map((t, i) => (
          <Table key={i} t={t} heading={i === 0 ? (model.tables.length > 1 ? "Comparison tables" : "Comparison table") : undefined} />
        ))}

        {model.sources.length > 0 && (
          <View>
            {model.sources.map((src, i) => {
              const row = (
                <View key={src.n} style={s.srcRow} wrap={false}>
                  <Text style={s.srcNo}>{src.n}.</Text>
                  <View style={{ flex: 1 }}>
                    <T style={s.srcBody} color={C.text}>{`${src.label}  ·  ${src.title}${src.date ? `   (${src.date})` : ""}`}</T>
                  </View>
                </View>
              );
              // the heading travels with the first source (before, the heading could stand alone at the foot of a page)
              return i === 0 ? <View key={src.n} wrap={false}><Section title="Sources" ahead={0} />{row}</View> : row;
            })}
          </View>
        )}

        {model.abbreviations.length > 0 && (
          <View wrap={false}>
            <Section title="Abbreviations" ahead={0} />
            <View style={s.abbrGrid}>
              {model.abbreviations.map((a) => (
                <T key={a.abbr} style={s.abbr} color={C.text}>{`${a.abbr}  —  ${a.full}`}</T>
              ))}
            </View>
          </View>
        )}

      </Page>
    </Document>
  );
}


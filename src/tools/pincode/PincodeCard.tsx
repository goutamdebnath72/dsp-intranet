// src/tools/pincode/PincodeCard.tsx
//
// THE DURGAPUR AREAS CARD, seen through the lens of the Steel Plant: its township's PIN codes first, then the 43 wards of the Durgapur Municipal Corporation with the areas of each, then the two legislative seats.
// Tab 1 "PIN codes": the 19 codes of the city (713201 to 713219), each with its post offices and the wards that use it, in ITS OWN COLOUR; the Steel Plant's own post offices are marked. Tab 2 "DMC wards": every ward,
// its seat, its PINs and its areas (in English), with a search. Tab 3 "Assembly seats": Durgapur Purba and Durgapur Paschim, the wards of each, and the three gram panchayats
// of Kanksa that Durgapur Purba adds. The colour of a PIN is the same on every tab, and a PIN's number is always written too: colour is never the only sign.
// Nothing is fetched: the data is a reviewed file with its sources and date (data.ts, which also says how the English spellings were made).
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ExternalLink, Factory, Info, Landmark, Mailbox, MapPinned, Search, Vote, X } from "lucide-react";
import { Pills } from "@/components/tools/Pills";
import { DATA_DATE, PANCHAYATS, ROLL_NOTE, WARDS } from "./data";
import {
  DURGAPUR_PINS, KANKSA_PINS, KIND_TEXT, LOK_SABHA, ORDER_WARDS, SEATS, groupByPin, isDspPin, isSailPin, panchayatsOfPin, pinStyle, rangesText, searchAreas, searchPins, searchWards, wardsOfPin, withAliases, wardsOfSeat,
  type Area, type Panchayat, type PostOffice, type Seat, type Ward,
} from "./pincode";

export type PincodeTab = "pins" | "wards" | "seats";

const TABS: Array<{ id: PincodeTab; text: string }> = [
  { id: "pins", text: "PIN codes" },
  { id: "wards", text: "DMC wards" },
  { id: "seats", text: "Assembly seats" },
];
const PILL = "from-violet-600 to-indigo-600 shadow-violet-600/30";

/* ---------- small pieces ---------- */

/** a PIN code in its own colour; a button when it can be pressed (it then filters the wards to that PIN) */
function PinChip({ pin, count, onClick, big = false, hint }: { pin: string; count?: number; onClick?: () => void; big?: boolean; hint?: string }) {
  const st = pinStyle(pin);
  const body = (
    <>
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: st.dot }} />
      <span className={`tabular-nums ${big ? "text-sm font-extrabold" : "text-xs font-bold"}`}>{pin}</span>
      {count !== undefined && <span className="text-[10px] font-semibold opacity-70">×{count}</span>}
    </>
  );
  const cls = "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5";
  const style = { background: st.soft, borderColor: st.border, color: st.ink };
  return onClick ? (
    <button type="button" onClick={onClick} data-pin={pin} title={hint ?? `Show the wards of PIN ${pin}`} className={`${cls} transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400`} style={style}>{body}</button>
  ) : (
    <span data-pin={pin} className={cls} style={style}>{body}</span>
  );
}

function SeatTag({ seat }: { seat: Seat }) {
  const s = SEATS[seat];
  return <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ background: s.soft, borderColor: `${s.color}55`, color: s.ink }} data-seat={seat}><span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.name}</span>;
}

/** the search box. The browser draws its own cross (blue, on hover) inside a search input; it is switched off, so the card's one cross is the only one: it shows when something is typed, turns red on hover and on keyboard focus, and after a click the cursor is back in the box. */
function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <label className="relative block min-w-0 basis-full sm:basis-0 sm:flex-1">
      <span className="sr-only">{label}</span>
      <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input ref={input} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" spellCheck={false}
        className="h-10 w-full rounded-2xl border border-slate-200 bg-white/90 pl-9 pr-10 text-sm [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200" />
      {value && <button type="button" onClick={() => { onChange(""); input.current?.focus(); }} aria-label="Clear the search" title="Clear" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition hover:bg-rose-100 hover:text-rose-600 focus-visible:bg-rose-100 focus-visible:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"><X size={14} strokeWidth={2.5} /></button>}
    </label>
  );
}

/** the English name of an area, with the other name of a place written after the word it belongs to */
function AreaRow({ a }: { a: Area }) {
  return (
    <li className="min-w-0 rounded-xl bg-white/80 px-2.5 py-1.5 ring-1 ring-slate-100" data-area>
      <span className="block text-sm font-semibold leading-snug text-slate-800">
        {withAliases(a[1]).map((p, k) => typeof p === "string" ? p : <React.Fragment key={k}>{p.word} <span className="mx-0.5 inline-block rounded-md bg-violet-100 px-1.5 align-middle text-[10px] font-bold text-violet-800" data-alias>also {p.alias}</span></React.Fragment>)}
      </span>
    </li>
  );
}

function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  const calm = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={calm ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }} className="overflow-hidden">
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- tab 1: PIN codes ---------- */

const OFFICE_KIND_STYLE: Record<PostOffice["kind"], string> = { H: "bg-rose-100 text-rose-800", S: "bg-sky-100 text-sky-800", B: "bg-slate-100 text-slate-600" };
const SHORT_KIND: Record<PostOffice["kind"], string> = { H: "HO", S: "SO", B: "BO" };

function PinCard({ pin, offices, all, go }: { pin: string; offices: PostOffice[]; all: boolean; go: (tab: PincodeTab, query?: string) => void }) {
  const st = pinStyle(pin);
  const [more, setMore] = useState(false);
  const shown = more || offices.length <= 6 ? offices : offices.slice(0, 5);
  const wards = wardsOfPin(pin);
  const gps = panchayatsOfPin(pin);
  const dsp = isDspPin(pin);
  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm" data-pin-card={pin} data-dsp={dsp ? "true" : "false"}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: st.rail }} />
      <div className="py-3 pl-5 pr-3.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span aria-hidden="true" className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: st.dot, boxShadow: `0 0 0 1px ${st.border}` }} />
          <h4 className="text-xl font-extrabold tabular-nums leading-none" style={{ color: st.ink }}>{pin}</h4>
          {dsp && <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm" title="A post office of this PIN is named for the Durgapur Steel Plant"><Factory size={11} aria-hidden="true" /> DSP</span>}
          {isSailPin(pin) && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white" title="A post office of this PIN is named for the Alloy Steel Project (SAIL's Alloy Steels Plant)">SAIL ASP</span>}
          <span className="ml-auto text-[11px] font-semibold text-slate-500">{all ? `${offices.length} post office${offices.length === 1 ? "" : "s"}` : `${offices.length} matching`}</span>
        </div>
        <ul className="mt-2 space-y-1">
          {shown.map((o) => (
            <li key={o.name} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm leading-snug text-slate-800">
              <span className={`font-semibold ${o.dsp ? "text-amber-700" : ""}`}>{o.name}</span>
              <span className={`rounded px-1.5 py-px text-[10px] font-extrabold ${OFFICE_KIND_STYLE[o.kind]}`} title={KIND_TEXT[o.kind]}>{SHORT_KIND[o.kind]}</span>
              {!o.delivers && <span className="rounded px-1.5 py-px text-[10px] font-bold text-slate-500 ring-1 ring-slate-200" title="This office does not deliver post">no delivery</span>}
              {o.block && o.block !== "Durgapur Municipal Corporation" && <span className="text-[11px] text-slate-500">{o.block} block</span>}
            </li>
          ))}
        </ul>
        {offices.length > 6 && <button type="button" onClick={() => setMore((v) => !v)} className="mt-1.5 text-xs font-bold text-violet-700 hover:underline">{more ? "Show fewer" : `Show all ${offices.length} post offices`}</button>}
        {(wards.length > 0 || gps.length > 0) && (
          <div className="mt-2.5 border-t border-slate-100 pt-2">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{wards.length > 0 ? "Wards that use this PIN" : "Gram panchayats of Kanksa block"}</p>
            <div className="flex flex-wrap gap-1.5">
              {wards.map((w) => { const s = SEATS[w.seat]; return (
                <button key={w.ward} type="button" onClick={() => go("wards", `ward ${w.ward}`)} data-ward-chip={w.ward} title={`Ward ${w.ward}, ${s.name}: ${w.parts} polling area${w.parts === 1 ? "" : "s"} of the roll carry this PIN`}
                  className="rounded-lg border px-2 py-0.5 text-xs font-bold transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" style={{ background: s.soft, borderColor: `${s.color}55`, color: s.ink }}>
                  Ward {w.ward}
                </button>
              ); })}
              {gps.map((g) => (
                <button key={g.id} type="button" onClick={() => go("seats")} className="rounded-lg border px-2 py-0.5 text-xs font-bold transition hover:brightness-95" style={{ background: SEATS.purba.soft, borderColor: `${SEATS.purba.color}55`, color: SEATS.purba.ink }} title={`${g.parts} polling areas`}>{g.en}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function PinsTab({ go, initialQuery = "" }: { go: (tab: PincodeTab, query?: string) => void; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const found = useMemo(() => searchPins(DURGAPUR_PINS, q), [q]);
  const kanksa = useMemo(() => searchPins(KANKSA_PINS, q), [q]);
  return (
    <div role="tabpanel" id="pincode-panel-pins" aria-labelledby="pincode-tabs" className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-900 p-4 text-white shadow-lg" data-dsp-lens>
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-amber-400/20 blur-2xl" />
        <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-300"><Factory size={14} aria-hidden="true" /> Through the lens of the Steel Plant</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-lg font-extrabold leading-tight">Durgapur Steel Plant</p>
          <span className="rounded-full bg-white px-3 py-0.5 text-lg font-extrabold tabular-nums text-indigo-950 shadow" data-dsp-pin>713203</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-indigo-100">
          The plant&apos;s own address (Ispat Bhawan, Durgapur Steel Plant, Durgapur) carries PIN <strong className="text-white">713203</strong>, as in SAIL&apos;s filing with the environment ministry
          {" "}<a href="https://environmentclearance.nic.in/auth/ECGeneral_Report.aspx?pid=41953" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-bold text-amber-300 hover:underline">source<ExternalLink size={11} aria-hidden="true" /></a>.
          Three PIN codes have a post office named for the plant, marked <span className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-1.5 py-px text-[10px] font-extrabold text-white">DSP</span> below: Durgapur Steel Project (713203), Steel Town West (713204) and Steel Town East (713205).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} label="Find a PIN code or a post office" placeholder="Find a PIN code or a post office: 713204, steel town, benachity" />
      </div>
      <p className="text-xs text-slate-500" aria-live="polite">{found.length + kanksa.length === 0 ? "No PIN code or post office matches that." : q.trim() ? `${found.length + kanksa.length} PIN code${found.length + kanksa.length === 1 ? "" : "s"} found` : `${DURGAPUR_PINS.length} PIN codes, ${DURGAPUR_PINS[0]} to ${DURGAPUR_PINS[DURGAPUR_PINS.length - 1]}. Each has its own colour, the same on every tab.`}</p>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500" data-legend>Ward buttons are coloured by seat:
        {(["purba", "paschim"] as Seat[]).map((k) => <span key={k} className="inline-flex items-center gap-1"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: SEATS[k].color }} />{SEATS[k].name}</span>)}
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {found.map((f) => <PinCard key={f.pin} pin={f.pin} offices={f.offices} all={f.all} go={go} />)}
      </div>

      {kanksa.length > 0 && (
        <>
          <h4 className="flex items-center gap-2 pt-1 text-sm font-extrabold text-slate-800"><MapPinned size={15} className="text-violet-600" aria-hidden="true" /> Outside the 7132 series: villages of Kanksa block in the Durgapur Purba seat</h4>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {kanksa.map((f) => <PinCard key={f.pin} pin={f.pin} offices={f.offices} all={f.all} go={go} />)}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- tab 2: DMC wards ---------- */

/** PRESSING A PIN ON A WARD (OR PANCHAYAT) CARD takes you to that PIN's areas in the long list: the list is opened if it is closed, the window scrolls to the PIN's group, and the group is lit for a moment. */
function usePinJump(open: boolean, openIt: () => void) {
  const root = useRef<HTMLDivElement & HTMLElement>(null);
  const calm = useReducedMotion();
  const [want, setWant] = useState<{ pin: string; wait: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!want || !open) return;
    const t = setTimeout(() => {
      root.current?.querySelector<HTMLElement>(`[data-pin-group="${want.pin}"]`)?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
      setFlash(want.pin);
      setWant(null);
    }, calm ? 0 : want.wait);
    return () => clearTimeout(t);
  }, [want, open, calm]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);
  /* a closed list takes a moment to open (0.22 s) and the window can only scroll as far as the list has grown, so the scroll waits until it has opened */
  const jump = (pin: string) => { if (!open) openIt(); setWant({ pin, wait: open ? 0 : 450 }); };
  const lit = (pin: string): React.CSSProperties | undefined => (flash === pin ? { boxShadow: `0 0 0 3px ${pinStyle(pin).border}`, background: pinStyle(pin).soft } : undefined);
  return { root, jump, lit };
}

function WardCard({ w, areas, filtered, open, onToggle }: { w: Ward; areas: readonly Area[]; filtered: boolean; open: boolean; onToggle: () => void }) {
  const s = SEATS[w.seat];
  const { root, jump, lit } = usePinJump(open, onToggle);
  const groups = useMemo(() => groupByPin(areas, w.pins), [areas, w.pins]);
  const preview = areas.slice(0, 3).map((a) => a[1]);
  return (
    <article ref={root} className="overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm" data-ward-card={w.ward} data-seat={w.seat}>
      <div className="flex flex-wrap items-start gap-3 p-3">
        <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md ${s.gradient}`} aria-label={`Ward ${w.ward}`}>
          <span className="text-[9px] font-extrabold uppercase tracking-widest opacity-80">Ward</span>
          <span className="text-2xl font-extrabold tabular-nums leading-none">{w.ward}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeatTag seat={w.seat} />
            {w.pins.map(([pin, n]) => <PinChip key={pin} pin={pin} count={w.pins.length > 1 ? n : undefined} onClick={() => jump(pin)} hint={`Jump to the areas with PIN ${pin}`} />)}
          </div>
        </div>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} the ${areas.length} areas of ward ${w.ward}`}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
          {areas.length} area{areas.length === 1 ? "" : "s"}{filtered ? " found" : ""}
          <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {!open && <p className="-mt-1 px-3 pb-3 text-sm leading-snug text-slate-600">{preview.join(" · ")}{areas.length > 3 ? ` · and ${areas.length - 3} more` : ""}</p>}
      <Collapse open={open}>
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 p-3">
          {groups.map((g) => (
            <section key={g.pin} aria-label={`Areas with PIN ${g.pin}`} data-pin-group={g.pin} style={lit(g.pin)} className="-m-1.5 scroll-mt-2 rounded-xl p-1.5 transition-shadow duration-500">
              <div className="mb-1.5 flex items-center gap-2"><PinChip pin={g.pin} /><span className="text-[11px] font-semibold text-slate-500">{g.areas.length} area{g.areas.length === 1 ? "" : "s"}</span></div>
              <ul className="grid gap-1.5 sm:grid-cols-2">{g.areas.map((a) => <AreaRow key={a[0] + a[2]} a={a} />)}</ul>
            </section>
          ))}
        </div>
      </Collapse>
    </article>
  );
}

function WardsTab({ query, setQuery, seat, setSeat, open, setOpen }: { query: string; setQuery: (q: string) => void; seat: "all" | Seat; setSeat: (s: "all" | Seat) => void; open: Set<number>; setOpen: (f: (o: Set<number>) => Set<number>) => void }) {
  const pool = useMemo(() => (seat === "all" ? WARDS : WARDS.filter((w) => w.seat === seat)), [seat]);
  const found = useMemo(() => searchWards(pool, query), [pool, query]);
  const toggle = (n: number) => setOpen((o) => { const x = new Set(o); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  return (
    <div role="tabpanel" id="pincode-panel-wards" aria-labelledby="pincode-tabs" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={query} onChange={setQuery} label="Find a ward or an area" placeholder="Find a ward or an area: ward 22, sagarbhanga, 713204, benachity" />
        <Pills<"all" | Seat> id="pincode-seat" label="Show the wards of" gradient={PILL} value={seat} onChange={setSeat}
          tabs={[{ id: "all", text: "All wards" }, { id: "purba", text: "Purba", swatch: SEATS.purba.color }, { id: "paschim", text: "Paschim", swatch: SEATS.paschim.color }]} />
      </div>
      <p className="text-xs text-slate-500" aria-live="polite">
        {found.length === 0 ? "No ward or area matches that." : `${found.length} of ${pool.length} ward${pool.length === 1 ? "" : "s"}${query.trim() ? " found" : ""}. Press a PIN of a ward to jump to its areas.`}
      </p>
      <div className="space-y-2.5">
        {found.map((r) => <WardCard key={r.ward.ward} w={r.ward} areas={r.areas} filtered={r.filtered} open={r.filtered || open.has(r.ward.ward)} onToggle={() => toggle(r.ward.ward)} />)}
      </div>
      <p className="flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900"><Info size={14} className="mt-px shrink-0" aria-hidden="true" />
        <span>The English spellings are written out from the Election Commission&apos;s roll. A ward can use more than one PIN: each area is listed under the PIN its polling area carries.</span></p>
    </div>
  );
}

/* ---------- tab 3: assembly seats ---------- */

function PanchayatBox({ g, open, onToggle }: { g: Panchayat; open: boolean; onToggle: () => void }) {
  const groups = useMemo(() => groupByPin(g.areas, g.pins), [g]);
  const { root, jump, lit } = usePinJump(open, onToggle);
  return (
    <div ref={root} className="overflow-hidden rounded-xl border border-violet-100 bg-white/90" data-panchayat={g.id}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-violet-50/60">
        <button type="button" onClick={onToggle} aria-expanded={open} className="min-w-0 text-left"><span className="block text-sm font-extrabold text-slate-800">{g.en}</span></button>
        <span className="flex flex-wrap gap-1">{g.pins.map(([pin]) => <PinChip key={pin} pin={pin} onClick={() => jump(pin)} hint={`Jump to the areas with PIN ${pin}`} />)}</span>
        <button type="button" onClick={onToggle} aria-expanded={open} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-slate-600">{g.areas.length} areas<ChevronDown size={14} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} /></button>
      </div>
      <Collapse open={open}>
        <div className="space-y-2.5 border-t border-violet-100 bg-violet-50/40 p-3">
          {groups.map((x) => (
            <section key={x.pin} aria-label={`Areas with PIN ${x.pin}`} data-pin-group={x.pin} style={lit(x.pin)} className="-m-1.5 scroll-mt-2 rounded-xl p-1.5 transition-shadow duration-500">
              <div className="mb-1.5"><PinChip pin={x.pin} /></div>
              <ul className="grid gap-1.5 sm:grid-cols-2">{x.areas.map((a) => <AreaRow key={a[0] + a[2]} a={a} />)}</ul>
            </section>
          ))}
        </div>
      </Collapse>
    </div>
  );
}

function SeatPanel({ seat, go }: { seat: Seat; go: (tab: PincodeTab, query?: string) => void }) {
  const s = SEATS[seat];
  const wards = wardsOfSeat(seat);
  const parts = wards.reduce((a, w) => a + w.parts, 0) + (seat === "purba" ? PANCHAYATS.reduce((a, g) => a + g.parts, 0) : 0);
  const pins = useMemo(() => {
    const c = new Map<string, number>();
    for (const w of wards) for (const [p, n] of w.pins) c.set(p, (c.get(p) ?? 0) + n);
    if (seat === "purba") for (const g of PANCHAYATS) for (const [p, n] of g.pins) c.set(p, (c.get(p) ?? 0) + n);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [wards, seat]);
  const [openGp, setOpenGp] = useState<string | null>(null);
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm" data-seat-panel={seat} aria-label={s.name}>
      <header className={`relative bg-gradient-to-br px-4 py-3.5 text-white ${s.gradient}`}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/15 blur-xl" />
        <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/80"><Vote size={13} aria-hidden="true" /> Assembly constituency No. {s.no}</p>
        <h4 className="text-xl font-extrabold leading-tight">{s.name}</h4>
      </header>
      <div className="space-y-3 p-3.5">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[{ n: wards.length, t: wards.length === 1 ? "ward" : "wards" }, { n: parts, t: "polling areas" }, { n: pins.length, t: "PIN codes" }].map((x) => (
            <div key={x.t} className="rounded-xl px-2 py-1.5" style={{ background: s.soft }}><p className="text-2xl font-extrabold tabular-nums leading-none" style={{ color: s.ink }}>{x.n}</p><p className="mt-0.5 text-[11px] font-semibold text-slate-600">{x.t}</p></div>
          ))}
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Wards {rangesText(ORDER_WARDS[seat])} of the Durgapur Municipal Corporation</p>
          <div className="flex flex-wrap gap-1.5">
            {wards.map((w) => (
              <button key={w.ward} type="button" onClick={() => go("wards", `ward ${w.ward}`)} data-ward-chip={w.ward} title={`Ward ${w.ward}: ${w.areas.length} areas`}
                className="h-8 min-w-[2.25rem] rounded-lg border px-2 text-sm font-extrabold tabular-nums transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" style={{ background: s.soft, borderColor: `${s.color}55`, color: s.ink }}>{w.ward}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">PIN codes, by number of polling areas</p>
          <div className="flex flex-wrap gap-1.5">{pins.map(([pin, n]) => <PinChip key={pin} pin={pin} count={n} onClick={() => go("wards", pin)} />)}</div>
        </div>
        {seat === "purba" && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">And three gram panchayats of Kanksa block</p>
            <div className="space-y-1.5">{PANCHAYATS.map((g) => <PanchayatBox key={g.id} g={g} open={openGp === g.id} onToggle={() => setOpenGp((v) => (v === g.id ? null : g.id))} />)}</div>
          </div>
        )}
      </div>
    </section>
  );
}

function SeatsTab({ go }: { go: (tab: PincodeTab, query?: string) => void }) {
  return (
    <div role="tabpanel" id="pincode-panel-seats" aria-labelledby="pincode-tabs" className="space-y-3">
      <p className="flex items-start gap-2 rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-xs leading-relaxed text-slate-700"><Landmark size={15} className="mt-px shrink-0 text-violet-700" aria-hidden="true" />
        <span>The city is split into <strong>two assembly seats</strong>, both part of the <strong>No. {LOK_SABHA.no} {LOK_SABHA.name}</strong> Lok Sabha seat. The split is by ward number, as in the Delimitation Commission&apos;s order; the ward numbers on the roll pages agree with it exactly. Press a ward to see its areas.</span></p>
      <div className="grid gap-3 lg:grid-cols-2">
        <SeatPanel seat="purba" go={go} />
        <SeatPanel seat="paschim" go={go} />
      </div>
    </div>
  );
}

/* ---------- the card ---------- */

/** `initialQuery` is what the search line asked for: "ward 22" on the wards tab, or a PIN or a post office's name on the PIN tab */
export function PincodeCard({ initialTab = "pins", initialQuery = "" }: { initialTab?: PincodeTab; initialQuery?: string }) {
  const [tab, setTab] = useState<PincodeTab>(initialTab);
  const [query, setQuery] = useState(initialTab === "wards" ? initialQuery : "");
  const [seat, setSeat] = useState<"all" | Seat>("all");
  const [open, setOpen] = useState<Set<number>>(() => { const m = initialTab === "wards" ? initialQuery.match(/^ward (\d+)$/) : null; return new Set(m ? [Number(m[1])] : []); });
  const go = (to: PincodeTab, q?: string) => {
    if (q !== undefined) { setQuery(q); setSeat("all"); const m = q.match(/^ward (\d+)$/); if (m) setOpen((o) => new Set(o).add(Number(m[1]))); }
    setTab(to);
  };
  return (
    <div data-pincode-card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Pills<PincodeTab> id="pincode-tabs" label="Durgapur areas" gradient={PILL} value={tab} onChange={setTab} tabs={TABS} />
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Mailbox size={13} aria-hidden="true" /> {ROLL_NOTE}</p>
      </div>
      <div id="pincode-tabs" className="sr-only">Durgapur areas</div>
      {tab === "pins" && <PinsTab go={go} initialQuery={initialTab === "pins" ? initialQuery : ""} />}
      {tab === "wards" && <WardsTab query={query} setQuery={setQuery} seat={seat} setSeat={setSeat} open={open} setOpen={setOpen} />}
      {tab === "seats" && <SeatsTab go={go} />}
      <p className="mt-4 text-xs leading-relaxed text-slate-500" data-sources>
        Sources: <a className="font-semibold text-slate-700 hover:underline" href="https://www.indiapost.gov.in" target="_blank" rel="noopener noreferrer">India Post</a>&apos;s PIN directory (read through <a className="font-semibold text-slate-700 hover:underline" href="https://api.postalpincode.in" target="_blank" rel="noopener noreferrer">api.postalpincode.in</a>);
        the Election Commission of India&apos;s draft electoral roll 2026 for West Bengal (<a className="font-semibold text-slate-700 hover:underline" href="https://ceowestbengal.wb.gov.in" target="_blank" rel="noopener noreferrer">CEO West Bengal</a>), page 1 of each of its 597 parts for Durgapur Purba and Durgapur Paschim, which gives each part&apos;s ward, PIN and areas;
        and the Delimitation Commission&apos;s order for the seats (<a className="font-semibold text-slate-700 hover:underline" href="https://en.wikipedia.org/wiki/Durgapur_Purba_Assembly_constituency" target="_blank" rel="noopener noreferrer">Purba</a>, <a className="font-semibold text-slate-700 hover:underline" href="https://en.wikipedia.org/wiki/Durgapur_Paschim_Assembly_constituency" target="_blank" rel="noopener noreferrer">Paschim</a>).
        Prepared {DATA_DATE}. The wards may be re-drawn: a change from 43 to 53 wards has been reported, not confirmed. Nothing here is fetched live.
      </p>
    </div>
  );
}

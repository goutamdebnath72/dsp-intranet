// src/tools/dsphistory/DspHistoryCard.tsx
//
// THE DSP STORY CARD: how the Durgapur Steel Plant came to be, in five tabs.
//  1 "Story": the five dates, the plant in a few facts, and the whole timeline from 1954 to today, with SAIL's photographs and the source of every entry.
//  2 "Who made it": the idea (Nehru), the British technology, Dr B C Roy, Pandit Nehru, the Queen's visit, the President, the site and the city.
//  3 "First products": what the plant made at the very start, and what nobody wrote down.
//  4 "Heads of DSP": the chronological list of the heads, by the title each bore (General Manager, Director-in-Charge, Managing Director, CEO, Director In-charge), with a picture where SAIL has one.
//  5 "SAIL & units": the foundation of Hindustan Steel and of SAIL, its plants (with the country each came from) and its other bodies.
// All of it is a reviewed file with its sources (history.ts): nothing is fetched. Where two sources differ the card shows both; where nothing is known it says so.
"use client";

import React, { useState } from "react";
import { ExternalLink, Info, Landmark, Users } from "lucide-react";
import { Pills } from "@/components/tools/Pills";
import {
  EVENTS, FACTS, FIRST_ITEMS, FIRST_UNKNOWN, HEADS, HEADS_BASIS_NOTE, HEAD_GAPS, KEY_DATES, MAKERS, OTHER_BODIES, PHOTOS, SAIL_NOW, SAIL_STORY, UNITS, eraOf, headsByEra, initials, photoSrc,
  type Basis, type Head, type PhotoId, type Source,
} from "./history";

export type DspHistoryTab = "story" | "makers" | "first" | "heads" | "sail";
const TABS: Array<{ id: DspHistoryTab; text: string }> = [
  { id: "story", text: "The story" },
  { id: "makers", text: "Who made it" },
  { id: "first", text: "First products" },
  { id: "heads", text: "Heads of DSP" },
  { id: "sail", text: "SAIL & units" },
];
const PILL = "from-rose-600 to-orange-600 shadow-rose-600/30";

/* ---------- small pieces ---------- */

function Band({ icon, tone, children }: { icon: React.ReactNode; tone: "rose" | "amber" | "sky"; children: React.ReactNode }) {
  const c = tone === "rose" ? "border-rose-100 bg-rose-50/70 text-slate-700 [&>svg]:text-rose-700" : tone === "sky" ? "border-sky-100 bg-sky-50/70 text-slate-700 [&>svg]:text-sky-700" : "border-amber-200 bg-amber-50 text-amber-900";
  return <p className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs leading-relaxed ${c}`}>{icon}<span>{children}</span></p>;
}
function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="inline-flex items-center gap-0.5 font-semibold underline-offset-2 hover:underline" href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={11} aria-hidden="true" /></a>;
}

/** one of SAIL's photographs, with its caption, its date and its credit; the picture opens full size in a new tab */
function Photo({ id, className = "" }: { id: PhotoId; className?: string }) {
  const p = PHOTOS[id];
  return (
    <figure className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`} data-photo={id}>
      <a href={photoSrc(id)} target="_blank" rel="noopener noreferrer" aria-label={`${p.caption}: open the picture full size`} className="block bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoSrc(id)} alt={p.caption} loading="lazy" decoding="async" className={p.portrait ? "mx-auto h-72 w-auto max-w-full object-contain" : "aspect-[4/3] w-full object-cover"} />
      </a>
      <figcaption className="px-3 py-2 text-xs leading-snug text-slate-600">
        {p.date && <span className="mr-1.5 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-extrabold text-rose-800">{p.date}</span>}
        {p.caption}
        <span className="mt-1 block text-[11px] text-slate-400">{p.credit}</span>
      </figcaption>
    </figure>
  );
}

/** the sources of a part of the card, each once, linked where the source has a page */
function Sources({ sources, label = "Sources" }: { sources: Source[]; label?: string }) {
  const seen = new Set<string>();
  const list = sources.filter((s) => { const k = `${s.name}|${s.page ?? ""}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return (
    <p className="text-[11px] leading-relaxed text-slate-500" data-sources>
      {label}: {list.map((s, i) => (
        <React.Fragment key={`${s.name}|${s.page ?? ""}`}>{i > 0 && "; "}{s.url ? <ExtLink href={s.url}>{s.name}</ExtLink> : s.name}{s.page ? `, ${s.page}` : ""}</React.Fragment>
      ))}
    </p>
  );
}

const BASIS_STYLE: Record<Basis, string> = {
  "SAIL record": "bg-emerald-100 text-emerald-800",
  "SAIL report": "bg-sky-100 text-sky-800",
  "Annual report": "bg-sky-100 text-sky-800",
  "Press report": "bg-amber-100 text-amber-900",
  "Memoir": "bg-violet-100 text-violet-800",
};

/* ---------- tab 1: the story ---------- */

function StoryTab() {
  const [picturesOnly, setPicturesOnly] = useState(false);
  const events = picturesOnly ? EVENTS.filter((e) => e.photo) : EVENTS;
  const grads = ["from-rose-600 to-orange-600", "from-orange-500 to-amber-600", "from-amber-500 to-yellow-600", "from-teal-600 to-emerald-600", "from-sky-600 to-indigo-600"];
  return (
    <div role="tabpanel" id="dsphistory-panel-story" aria-labelledby="dsphistory-tabs" className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-600 via-orange-600 to-amber-600 p-5 text-white shadow-md" data-dsp-hero>
        <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/25 blur-3xl" />
        <div className="relative text-xs font-extrabold uppercase tracking-widest opacity-90">Durgapur Steel Plant</div>
        <div className="relative mt-1 text-2xl font-extrabold leading-tight">A jungle between two rivers, a British-built plant, India&apos;s third public-sector steel mill</div>
        <p className="relative mt-2 text-sm font-semibold opacity-95">It began with Pandit Nehru&apos;s dream and Dr B C Roy&apos;s determination. Britain supplied the technology; the plant lit its first blast furnace on December 26, 1959, and became a unit of SAIL in 1973.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-5" data-key-dates>
        {KEY_DATES.map((d, i) => (
          <div key={d.when} className={`relative overflow-hidden rounded-3xl bg-gradient-to-br p-3 text-white shadow-md ${grads[i % grads.length]}`}>
            <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-white/30 blur-2xl" />
            <div className="relative text-xs font-extrabold uppercase tracking-widest opacity-90">{d.when}</div>
            <div className="relative mt-0.5 text-[15px] font-extrabold leading-tight">{d.what}</div>
            <div className="relative mt-1 text-[11px] font-semibold leading-snug opacity-90">{d.note}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2" data-facts>
        {FACTS.map((f) => (
          <div key={f.label} className="rounded-2xl border border-rose-100 bg-white/80 px-3 py-2">
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-rose-700">{f.label}</div>
            <div className="text-sm font-semibold text-slate-800">{f.value}</div>
            <div className="text-[11px] text-slate-400">{f.source.name}{f.source.page ? `, ${f.source.page}` : ""}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <h3 className="text-base font-extrabold text-slate-900">The timeline <span className="text-sm font-semibold text-slate-500">({events.length} of {EVENTS.length} entries)</span></h3>
        <button type="button" aria-pressed={picturesOnly} onClick={() => setPicturesOnly((v) => !v)} data-pictures-only
          className={`rounded-full border px-3 py-1 text-xs font-bold transition ${picturesOnly ? "border-rose-600 bg-rose-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:text-rose-700"}`}>
          {picturesOnly ? "Showing only entries with a picture" : "Show only entries with a picture"}
        </button>
      </div>
      <ol className="relative space-y-3 border-l-2 border-rose-200 pl-4" data-timeline>
        {events.map((e) => (
          <li key={e.id} data-event={e.id} className="relative">
            <span aria-hidden="true" className="absolute -left-[25px] top-3 h-3 w-3 rounded-full border-2 border-white bg-gradient-to-br from-rose-600 to-orange-600 shadow" />
            <div className="rounded-3xl border border-slate-200 bg-white/85 p-3 shadow-sm">
              <div className={`grid gap-3 ${e.photo ? "sm:grid-cols-[1fr,240px]" : ""}`}>
                <div>
                  <span className="rounded-full bg-gradient-to-r from-rose-600 to-orange-600 px-2.5 py-0.5 text-xs font-extrabold text-white">{e.when}</span>
                  <h4 className="mt-1.5 text-[15px] font-extrabold leading-snug text-slate-900">{e.title}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">{e.text}</p>
                  {e.note && <p className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900" data-differ>{e.note}</p>}
                  <div className="mt-1.5"><Sources sources={e.sources} /></div>
                </div>
                {e.photo && <Photo id={e.photo} />}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- tab 2: who made it ---------- */

function MakersTab() {
  const accent = ["from-sky-600 to-indigo-600", "from-rose-600 to-orange-600", "from-amber-500 to-orange-600", "from-teal-600 to-emerald-600", "from-violet-600 to-purple-600", "from-sky-600 to-cyan-600", "from-orange-500 to-amber-600"];
  return (
    <div role="tabpanel" id="dsphistory-panel-makers" aria-labelledby="dsphistory-tabs" className="space-y-3">
      <Band icon={<Landmark size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="rose">
        Why Durgapur was built, who built it, and the people who made it happen: a Prime Minister&apos;s dream, a Chief Minister&apos;s persistence, a British consortium, and the visits that marked each step.
      </Band>
      {MAKERS.map((m, i) => (
        <section key={m.id} data-maker={m.id} aria-label={m.title} className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/85 p-4 pt-5 shadow-sm">
          <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${accent[i % accent.length]}`} />
          <h4 className="text-base font-extrabold text-slate-900">{m.title}</h4>
          <p className="mt-1 text-sm font-semibold text-slate-700">{m.lead}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">{m.points.map((p) => <li key={p}>{p}</li>)}</ul>
          {m.photos.length > 0 && <div className={`mt-3 grid gap-3 ${m.photos.length > 1 ? "sm:grid-cols-2" : "sm:max-w-md"}`}>{m.photos.map((id) => <Photo key={id} id={id} />)}</div>}
          {m.note && <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900" data-differ>{m.note}</p>}
          <div className="mt-2"><Sources sources={m.sources} /></div>
        </section>
      ))}
    </div>
  );
}

/* ---------- tab 3: the first products ---------- */

function FirstTab() {
  const chip = ["from-rose-600 to-orange-600", "from-orange-500 to-amber-600", "from-teal-600 to-emerald-600", "from-sky-600 to-indigo-600", "from-violet-600 to-purple-600", "from-slate-500 to-slate-600"];
  return (
    <div role="tabpanel" id="dsphistory-panel-first" aria-labelledby="dsphistory-tabs" className="space-y-3">
      <Band icon={<Info size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="rose">
        What Durgapur made in its first years, in the order it came: iron, steel, structurals, bars, and the railway wheels and axles that no other plant in India makes.
      </Band>
      <ol className="space-y-3" data-first>
        {FIRST_ITEMS.map((f, i) => (
          <li key={f.what} data-first-item className="rounded-3xl border border-slate-200 bg-white/85 p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full bg-gradient-to-r px-2.5 py-0.5 text-xs font-extrabold text-white ${chip[i % chip.length]}`}>{f.when}</span>
              <h4 className="text-base font-extrabold text-slate-900">{f.what}</h4>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{f.detail}</p>
            {f.note && <p className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900" data-differ>{f.note}</p>}
            <div className="mt-1.5"><Sources sources={f.source} /></div>
          </li>
        ))}
      </ol>
      <Band icon={<Info size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="amber"><span data-first-unknown>{FIRST_UNKNOWN}</span></Band>
    </div>
  );
}

/* ---------- tab 4: the heads ---------- */

function Avatar({ head }: { head: Head }) {
  if (head.photo) {
    const p = PHOTOS[head.photo];
    return (
      <a href={photoSrc(head.photo)} target="_blank" rel="noopener noreferrer" aria-label={`${p.caption}: open the picture full size`} className="block shrink-0" data-head-photo={head.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoSrc(head.photo)} alt={p.caption} loading="lazy" decoding="async" className={`h-24 rounded-2xl border border-slate-200 shadow-sm ${p.portrait ? "w-[72px] object-cover object-top" : "w-32 object-cover"}`} />
      </a>
    );
  }
  return <span aria-hidden="true" data-head-initials className="flex h-24 w-[72px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 text-3xl font-extrabold tracking-wide text-slate-500">{initials(head.name)}</span>;
}

function HeadsTab() {
  const erasColor: Record<string, string> = { gm: "from-orange-500 to-amber-600", dic: "from-rose-600 to-pink-600", md: "from-violet-600 to-purple-600", ceo: "from-sky-600 to-indigo-600", dic2: "from-teal-600 to-emerald-600" };
  const withPhoto = HEADS.filter((h) => h.photo).length;
  return (
    <div role="tabpanel" id="dsphistory-panel-heads" aria-labelledby="dsphistory-tabs" className="space-y-3">
      <Band icon={<Users size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="rose">
        <strong>The heads of the plant, in order.</strong> The post has had five names: <strong>General Manager</strong> in the Hindustan Steel years, <strong>Director-in-Charge</strong> from about 1970, <strong>Managing Director</strong>, <strong>Chief Executive Officer</strong>, and today <strong>Director In-charge</strong>.
        {` ${HEADS.length} entries; ${withPhoto} with a picture from SAIL (the others show initials because no picture was found).`}
      </Band>
      <Band icon={<Info size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="amber"><span data-heads-basis>{HEADS_BASIS_NOTE}</span></Band>
      {headsByEra().map(({ era, heads }) => (
        <section key={era.id} data-era={era.id} aria-label={era.title} className="space-y-2">
          <div className={`rounded-2xl bg-gradient-to-r px-4 py-2 text-white shadow-md ${erasColor[era.id]}`}>
            <div className="text-base font-extrabold">{era.title} <span className="text-sm font-semibold opacity-90">· {era.span}</span></div>
            <div className="text-xs font-semibold opacity-95">{era.text}</div>
          </div>
          {heads.map((h) => (
            <React.Fragment key={h.id}>
              <article data-head={h.id} className="flex gap-3 rounded-3xl border border-slate-200 bg-white/85 p-3 shadow-sm">
                <Avatar head={h} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h4 className="text-base font-extrabold text-slate-900">{h.name}</h4>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${BASIS_STYLE[h.basis]}`} data-basis>{h.basis}</span>
                  </div>
                  <div className="text-xs font-bold text-slate-600">{h.title} · <span className="text-rose-700">{h.when}</span></div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">{h.note}</p>
                  {h.photo && <p className="mt-1 text-[11px] text-slate-500">Picture: {PHOTOS[h.photo].caption}{PHOTOS[h.photo].date ? ` (${PHOTOS[h.photo].date})` : ""}. {PHOTOS[h.photo].credit}.</p>}
                  <div className="mt-1"><Sources sources={h.sources} /></div>
                </div>
              </article>
              {HEAD_GAPS.filter((g) => g.after === h.id).map((g) => (
                <p key={g.text} data-head-gap className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">{g.text}</p>
              ))}
            </React.Fragment>
          ))}
        </section>
      ))}
      <Band icon={<Info size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="sky">Spellings are as the source prints them (SAIL prints P C Niyogi and K K Sen; the memoir prints P C Neogi and K Sen). A change in title does not always mean a change of person: for some years one CEO held charge of two or three plants.</Band>
    </div>
  );
}

/* ---------- tab 5: SAIL and its units ---------- */

function SailTab() {
  const kindColor: Record<string, string> = { "Integrated steel plant": "from-sky-600 to-indigo-600", "Special steel plant": "from-violet-600 to-purple-600", "Ferro alloy plant": "from-amber-500 to-orange-600", "Other unit": "from-slate-500 to-slate-600" };
  return (
    <div role="tabpanel" id="dsphistory-panel-sail" aria-labelledby="dsphistory-tabs" className="space-y-3">
      <Band icon={<Landmark size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="rose">
        How Hindustan Steel became SAIL, and the plants of the family Durgapur belongs to. Three of the first plants, three countries: Rourkela with German help, Bhilai with Soviet help, Durgapur with British help.
      </Band>
      <section aria-label="The foundation of SAIL" className="rounded-3xl border border-slate-200 bg-white/85 p-4 shadow-sm" data-sail-story>
        <h4 className="text-base font-extrabold text-slate-900">From Hindustan Steel to SAIL</h4>
        <ol className="relative mt-2 space-y-2 border-l-2 border-emerald-200 pl-4">
          {SAIL_STORY.map((s) => (
            <li key={s.when} className="relative">
              <span aria-hidden="true" className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-extrabold text-emerald-800">{s.when}</span>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-700">{s.what}</p>
              <Sources sources={s.source} />
            </li>
          ))}
        </ol>
      </section>
      <div className="grid gap-3 lg:grid-cols-2" data-units>
        {UNITS.map((u) => (
          <article key={u.id} data-unit={u.id} className={`relative overflow-hidden rounded-3xl border bg-white/85 p-4 pt-5 shadow-sm ${u.dsp ? "border-rose-300 ring-2 ring-rose-200" : "border-slate-200"}`}>
            <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${kindColor[u.kind]}`} />
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <h4 className="text-base font-extrabold text-slate-900">{u.name}{u.dsp && <span className="ml-2 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-extrabold text-white">this plant</span>}</h4>
              <span className="text-xs font-bold text-slate-500">{u.where}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold text-slate-700">{u.kind}</span>
              {u.partner && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-900" data-partner>{u.partner}</span>}
            </div>
            <dl className="mt-2 space-y-1 text-xs text-slate-600">
              <div><dt className="inline font-extrabold uppercase tracking-widest text-slate-500">Began </dt><dd className="inline">{u.began}</dd></div>
              <div><dt className="inline font-extrabold uppercase tracking-widest text-slate-500">Today </dt><dd className="inline">{u.today}</dd></div>
            </dl>
            <div className="mt-1.5"><Sources sources={u.source} /></div>
          </article>
        ))}
      </div>
      <section aria-label="SAIL's other bodies" className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4" data-other-bodies>
        <h4 className="text-base font-extrabold text-slate-900">SAIL&apos;s other bodies</h4>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {OTHER_BODIES.map((b) => <li key={b.name}><strong className="text-slate-900">{b.name}</strong>: {b.detail} <span className="text-[11px] text-slate-400">(SAIL JO Manual, {b.page})</span></li>)}
        </ul>
        <p className="mt-2 text-xs text-slate-600">{SAIL_NOW}</p>
      </section>
    </div>
  );
}

/* ---------- the card ---------- */

/** `initialTab` is the tab the search line asked for ("dsp heads" opens Heads, "queen elizabeth durgapur" Who made it) */
export function DspHistoryCard({ initialTab = "story" }: { initialTab?: DspHistoryTab }) {
  const [tab, setTab] = useState<DspHistoryTab>(initialTab);
  return (
    <div data-dsphistory-card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Pills<DspHistoryTab> id="dsphistory-tabs" label="Durgapur Steel Plant" gradient={PILL} value={tab} onChange={setTab} tabs={TABS} />
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Info size={13} aria-hidden="true" /> SAIL&apos;s own history, with its photographs · saved, not live</p>
      </div>
      <div id="dsphistory-tabs" className="sr-only">Durgapur Steel Plant</div>
      {tab === "story" && <StoryTab />}
      {tab === "makers" && <MakersTab />}
      {tab === "first" && <FirstTab />}
      {tab === "heads" && <HeadsTab />}
      {tab === "sail" && <SailTab />}
      <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-snug text-slate-600"><strong>History as published.</strong> Dates and names are as SAIL, the Ministry of Steel, the plant&apos;s manuals and the press give them; where they differ the card shows both, and where nothing is published it leaves a gap. The pictures are SAIL&apos;s own. The plant&apos;s own records may hold more.</p>
    </div>
  );
}

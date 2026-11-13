// src/tools/vin/VinGuide.tsx
//
// THE LITERATURE OF THE VIN, under the reader: what a VIN is and the full forms of its words, its three sections, why I, O and Q are never used, the model-year codes, the check digit, how the numbers of
// Indian makers differ, and what a VIN cannot tell. A panel of its own (violet and indigo, so that it is not mistaken for the reading above it). All from src/tools/vin/vin.ts; nothing is stored or sent.
"use client";

import React, { useState } from "react";
import { BookOpenText, CalendarDays, ChevronDown, Factory, Fingerprint, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { FULL_FORMS, MONTH_CODES, SECTIONS, WMIS, YEAR_CODES, yearsFor } from "./vin";

const SECTION_TONE: Record<string, string> = { WMI: "from-sky-500 to-cyan-500", VDS: "from-amber-500 to-orange-500", VIS: "from-violet-500 to-fuchsia-500" };

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-3.5 shadow-sm">
      <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow">{icon}</span>{title}</h4>
      <div className="mt-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

export function VinGuide({ yearCode }: { yearCode: string | null }) {
  const [showMakers, setShowMakers] = useState(false);
  const makers = Object.entries(WMIS).filter(([, v]) => v.country === "India");
  return (
    <section aria-label="About the VIN" className="relative mt-8 overflow-hidden rounded-3xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-4 shadow-lg ring-1 ring-white/70 sm:p-5">
      <span aria-hidden="true" className="pointer-events-none absolute -left-12 -top-14 h-44 w-44 rounded-full bg-violet-300/25 blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-16 -right-10 h-44 w-44 rounded-full bg-indigo-300/25 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-600/30 ring-2 ring-white/70"><BookOpenText size={22} /></span>
        <div className="min-w-0">
          <h3 className="text-base font-extrabold leading-tight text-slate-900">Understanding the Vehicle Identification Number</h3>
          <p className="text-xs text-slate-600">What the 17 characters are, how they are built, and what they can and cannot tell.</p>
        </div>
      </div>

      <div className="relative mt-4 grid gap-3">
        <Block icon={<Fingerprint size={16} />} title="What a VIN is">
          <p>A <b>Vehicle Identification Number (VIN)</b> is a code of <b>17 letters and digits</b> that belongs to one vehicle only, like a fingerprint. Since 1981 nearly every road vehicle in the world carries one in the format of the international standard <b>ISO 3779</b> (before 1981 makers used their own shorter numbers, often 11 characters, with no common rule). It is stamped on the chassis and on a plate, and it is printed on the invoice and on the registration certificate. In India it is also called the <b>chassis number</b>.</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {FULL_FORMS.map((f) => (
              <div key={f.abbr} className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-sm font-extrabold text-slate-900"><span className="mr-1.5 rounded-md bg-violet-100 px-1.5 py-0.5 text-xs text-violet-800">{f.abbr}</span>{f.full}</dt>
                <dd className="mt-1 text-xs leading-snug text-slate-600">{f.meaning}</dd>
              </div>
            ))}
          </dl>
        </Block>

        <Block icon={<Factory size={16} />} title="The three sections">
          <div className="grid gap-2 sm:grid-cols-3">
            {SECTIONS.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className={`bg-gradient-to-r px-3 py-1.5 text-white ${SECTION_TONE[s.id]}`}>
                  <span className="text-sm font-extrabold">{s.id}</span> <span className="text-xs font-semibold text-white/90">positions {s.from}–{s.to}</span>
                </div>
                <div className="px-3 py-2"><div className="text-xs font-bold text-slate-900">{s.name}</div><div className="mt-0.5 text-xs leading-snug text-slate-600">{s.purpose}</div></div>
              </div>
            ))}
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            <li><b>Position 1</b> is where the manufacturer is based (A–H Africa, J–R Asia, S–Z Europe, 1–5 North America, 6–7 Oceania, 8–9 South America); <b>MA to ME is India</b>. With positions 2 and 3 it makes the <b>WMI</b>, which SAE International assigns to each maker.</li>
            <li><b>Positions 4 to 8</b> are the maker's own description of the vehicle (model, body, engine, restraint system). Each maker has its own codes.</li>
            <li><b>Position 9</b> is a <b>check digit</b> (0–9 or X) in North America, where the law requires it. Makers in India and Europe usually use the place for a code of their own.</li>
            <li><b>Position 10</b> is the <b>model year</b>, <b>position 11</b> the <b>assembly plant</b>, and <b>positions 12 to 17</b> the vehicle's own <b>serial number</b>.</li>
          </ul>
        </Block>

        <Block icon={<ShieldCheck size={16} />} title="Why I, O and Q are never used">
          <p>An <b>I</b> looks like the digit <b>1</b>, and an <b>O</b> or a <b>Q</b> like the digit <b>0</b>. So that a VIN cannot be misread when it is stamped, copied or typed, those three letters are left out altogether: a VIN with an I, an O or a Q in it has been mistyped (the reader above tells you which digit it probably should be).</p>
        </Block>

        <Block icon={<CalendarDays size={16} />} title="The model-year code (position 10)">
          <p>The year is one letter or digit, and the list repeats every <b>30 years</b>, so a code stands for two years: the letter <b>K</b> is 2019 and also 1989. The vehicle itself (its look, its papers) settles which. The letters I, O, Q, U and Z, and the digit 0, are never year codes.</p>
          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
            {Array.from(YEAR_CODES).map((c) => {
              const y = yearsFor(c)!;
              const on = yearCode === c;
              return (
                <div key={c} className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-xs ${on ? "border-violet-400 bg-violet-100 font-bold text-violet-900 shadow" : "border-slate-200 bg-white text-slate-700"}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm font-extrabold ${on ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-900"}`}>{c}</span>
                  <span className="leading-tight">{y[1]}<span className="text-slate-400"> · {y[0]}</span></span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">In North America the 7th character settles it for cars: a letter means the later cycle (2010 onward), a digit the earlier one. That rule is not followed everywhere (Indian numbers do not), so the reader above gives the more recent year and shows the other as well.</p>
        </Block>

        <Block icon={<ShieldCheck size={16} />} title="The check digit (position 9)">
          <p>In North America position 9 is calculated from the other sixteen characters, so that a single wrong character is caught. Each character is turned into a number (a digit is itself; A is 1, B is 2 ... H is 8; J is 1 ... N is 5; P is 7; R is 9; S is 2 ... Z is 9), multiplied by the <b>weight</b> of its position (8 7 6 5 4 3 2 10 0 9 8 7 6 5 4 3 2), and the products are added. The sum divided by 11 leaves a remainder: that remainder is the check digit, and a remainder of 10 is written <b>X</b>.</p>
          <p className="mt-2">Indian makers are not required to do this, and many put a letter or a code of their own in position 9 (the Hyundai sample above has an <b>L</b> there). So a number without a check digit is not a wrong number. Use <i>Show how the check digit is worked out</i> above to see the calculation for any number you type.</p>
        </Block>

        <Block icon={<Factory size={16} />} title="Indian numbers, and the month">
          <p>Indian makers follow the same 17-character layout, with a WMI that starts <b>MA</b> to <b>ME</b>. The ISO standard does not put the <b>month</b> of manufacture in the VIN; some makers record it themselves. <b>Hyundai</b> stamps it after the VIN on the chassis plate as <b>*</b> and a letter, so that the full stamped chassis number is 19 characters (for example <b>…*L</b>). Its letters run A January, B February, C March, D April, E May, F June, G July, H August, J September, K October, L November, M December (there is no I). The reader decodes that suffix for Hyundai only; for the other makers it makes no guess, because their month codes are their own.</p>
          <button type="button" onClick={() => setShowMakers((v) => !v)} aria-expanded={showMakers} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3.5 py-1.5 text-xs font-bold text-violet-800 shadow-sm transition hover:bg-violet-50">
            <ChevronDown size={14} className={`transition-transform ${showMakers ? "rotate-180" : ""}`} />{showMakers ? "Hide" : "Show"} the manufacturer codes of India
          </button>
          <AnimatePresence initial={false}>
            {showMakers && (
              <motion.div key="makers" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {makers.map(([code, v]) => (
                    <div key={code} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
                      <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-sm font-extrabold tracking-wider text-sky-800">{code}</span>
                      <span className="font-semibold text-slate-800">{v.maker}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">Only well-established codes are listed; a maker can hold more than one. A code that is not here is not necessarily wrong.</p>
              </motion.div>
            )}
          </AnimatePresence>
          <p className="sr-only">{Object.values(MONTH_CODES).join(", ")}</p>
        </Block>

        <Block icon={<Fingerprint size={16} />} title="What a VIN cannot tell you">
          <p>A VIN says <i>which</i> vehicle, not who owns it, where it is, or whether it is sound: the owner and the registration come from the registration certificate. Parts of it (positions 4 to 8, the plant letter) are the maker's own code, which only the maker or its parts catalogue can read. Check the stamped number on the chassis against the invoice and the registration certificate before you buy or insure a vehicle; if they differ, ask the maker or the registering office.</p>
        </Block>
      </div>
    </section>
  );
}

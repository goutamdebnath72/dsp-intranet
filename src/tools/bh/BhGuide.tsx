// src/tools/bh/BhGuide.tsx
//
// THE LITERATURE OF THE BHARAT (BH) SERIES, under the reader: what it is and why it exists, how the mark is built, who can have it (with a check), how to get it for a new and for an existing vehicle,
// the road tax (with an estimate), moving, selling and losing eligibility, whether it suits you, common doubts, and where the sources differ. A panel of its own (emerald and amber, not the
// colours of the reading above it). The facts are in src/tools/bh/bh.ts; nothing typed or picked here is stored or sent.
"use client";

import React from "react";
import { BookOpenText, CheckCircle2, ClipboardCheck, Flag, IdCard, ListChecks, MapPinned, Receipt, Route, Scale, ShieldAlert, Stamp, Users } from "lucide-react";
import { BH_BANDS, BH_START } from "./bh";
import { BhEligibility, BhTaxEstimate } from "./BhTools";

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-3.5 shadow-sm">
      <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow">{icon}</span>{title}</h4>
      <div className="mt-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

function Steps({ items }: { items: Array<{ head: string; text: string }> }) {
  return (
    <ol className="mt-1 grid gap-2">
      {items.map((s, i) => (
        <li key={s.head} className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-extrabold text-white shadow">{i + 1}</span>
          <div className="min-w-0"><div className="text-sm font-extrabold text-slate-900">{s.head}</div><div className="text-sm leading-snug text-slate-600">{s.text}</div></div>
        </li>
      ))}
    </ol>
  );
}

const COMPARE: Array<[string, string, string]> = [
  ["How it looks", "A State code, an RTO number, letters and a number, for example WB 74 AB 1234", "26 BH 1234 AA: year, BH, a number, letters"],
  ["Moving to another State", "After 12 months there a new mark has to be applied for (section 47 of the Motor Vehicles Act)", "No new mark is needed; the owner only intimates the new place (Form 33, within 30 days)"],
  ["Choosing the number", "In many States a number can be chosen or bid for", "Never: the portal gives it at random"],
  ["Road tax", "In most States a private car pays once, at purchase (the amount and rules differ by State)", "Every two years, worked out on the invoice price"],
  ["Who can have it", "Anyone who owns a vehicle", "Only the groups the Ministry named, and only for non-transport vehicles"],
];

const FAQ: Array<[string, string]> = [
  ["Is it compulsory?", "No. It is voluntary: an ordinary State mark remains available to everyone."],
  ["Are the last two letters a code for the kind of vehicle?", "No. Some summaries say so, but the rule describes them as a counter: A to Z, then AA to ZZ, leaving out I and O. The owner cannot choose them."],
  ["Can I pick a fancy number?", "No. The rule says the mark is generated randomly through the portal after the papers have been checked."],
  ["Does it work for a taxi or a truck?", "No. The tax rule speaks of fully built non-transport vehicles, and published guides say the series is for private vehicles."],
  ["Is it for cars only?", "Published guides say cars and two-wheelers, with the same price bands for the tax. Check with the RTO for any other kind of vehicle."],
  ["Does the year in the mark tell the model year of the car?", "No. It is the year of registration, that is, when the mark was given."],
  ["Is it always cheaper?", "No. It spreads the tax over two-year payments, but the total over the years depends on what your own State would have charged. Work it out for your own vehicle, with the estimate above."],
];

export function BhGuide() {
  return (
    <section aria-label="About the BH series" className="relative mt-8 overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-4 shadow-lg ring-1 ring-white/70 sm:p-5">
      <span aria-hidden="true" className="pointer-events-none absolute -left-12 -top-14 h-44 w-44 rounded-full bg-emerald-300/25 blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-16 -right-10 h-44 w-44 rounded-full bg-amber-300/25 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-white/70"><BookOpenText size={22} /></span>
        <div className="min-w-0">
          <h3 className="text-base font-extrabold leading-tight text-slate-900">Understanding the Bharat (BH) series</h3>
          <p className="text-xs text-slate-600">The one registration mark that is valid in every State and Union Territory: what it is, who can have it, how to get it, and what it costs.</p>
        </div>
      </div>

      <div className="relative mt-4 grid gap-3">
        <Block icon={<Flag size={16} />} title="What it is, in a minute">
          <p>The <b>Bharat series (BH series)</b> is a registration mark for private vehicles that <b>stays valid when the owner moves from one State to another</b>. An ordinary mark belongs to the State that gave it; a BH mark belongs to no State. It was brought in by the Ministry of Road Transport and Highways for people whose jobs move them between States, and it came into force on <b>{BH_START.day}</b>.</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              ["Voluntary", "Nobody has to take it."],
              ["Non-transport vehicles", "Private vehicles only, not taxis or goods vehicles."],
              ["Listed employers only", "Defence, government, public sector, and private firms with offices in four or more States/UTs."],
              ["Tax every two years", "Instead of one payment at purchase."],
            ].map(([a, b]) => (
              <div key={a} className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-sm font-extrabold text-slate-900">{a}</dt><dd className="mt-0.5 text-xs leading-snug text-slate-600">{b}</dd></div>
            ))}
          </dl>
        </Block>

        <Block icon={<Route size={16} />} title="Why it exists">
          <p>Under the Motor Vehicles Act a vehicle kept in another State for more than 12 months has to be given a new mark there: a No Objection Certificate from the old RTO, a visit to the new one, and tax again. For a person who is posted from State to State every few years that happens again and again. The BH series removes the step: the mark moves with the owner, and only a short intimation is needed.</p>
        </Block>

        <Block icon={<IdCard size={16} />} title="How the mark is built">
          <p>The mark is written <b>YY BH #### XX</b>, in black letters on a white plate. The reader above shows each part for any mark you type. In short:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><b>YY</b>: the last two digits of the year of registration.</li>
            <li><b>BH</b>: the Bharat series.</li>
            <li><b>####</b>: four digits, 0001 to 9999, given at random.</li>
            <li><b>XX</b>: one or two letters, A to Z and then AA to ZZ, never I or O (they look like 1 and 0).</li>
          </ul>
          <div className="mt-3 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600"><tr><th className="px-2.5 py-1.5 font-semibold" /><th className="px-2.5 py-1.5 font-semibold">Ordinary State mark</th><th className="px-2.5 py-1.5 font-semibold">BH series</th></tr></thead>
              <tbody>
                {COMPARE.map(([a, b, c]) => <tr key={a} className="border-t border-slate-100 align-top"><th className="px-2.5 py-1.5 font-bold text-slate-800">{a}</th><td className="px-2.5 py-1.5 text-slate-600">{b}</td><td className="px-2.5 py-1.5 font-medium text-emerald-900">{c}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Block>

        <Block icon={<Users size={16} />} title="Who can have it">
          <p>The Ministry named these groups: <b>Defence personnel</b>; employees of the <b>Central Government</b> or a <b>State or UT Government</b>; employees of <b>Central or State public sector undertakings</b>; and employees of <b>private companies or organisations that have offices in four or more States/UTs</b>. Pick where you work:</p>
          <div className="mt-3"><BhEligibility /></div>
          <p className="mt-3"><b>Form 60</b> is the private employer's <b>working certificate</b>. (It is not the income-tax form of the same number.) It says that the applicant works in the company or organisation, and since when, and that the organisation has offices in four States/UTs or more; the applicant and the employer's authorised signatory both sign, and it carries the employer's seal. The registering authority checks it before the mark is given.</p>
          <p className="mt-2 text-xs text-slate-500">Whether a particular body (a public sector bank, an autonomous body, a society) counts as a public sector undertaking is for the registering authority to say; ask the RTO before you spend money on it.</p>
        </Block>

        <Block icon={<ClipboardCheck size={16} />} title="Getting it for a new vehicle">
          <Steps items={[
            { head: "Tell the dealer before you book", text: "The application is made through the dealer, so say at the start that you want the BH series, and get the proof ready." },
            { head: "Get your proof", text: "An official identity card for government and public sector staff, or Form 60 on your employer's letter, signed and sealed, for a private firm." },
            { head: "The dealer applies on the Vahan portal", text: "With the invoice, your identity and address proofs and the proof of eligibility, as for any new registration." },
            { head: "The registering authority checks the proof", text: "The mark is not given until the identity card or Form 60 has been verified." },
            { head: "Pay the tax and the registration charges online", text: "The portal works out the tax for the first two years from the invoice price without GST. The charges for the registration itself are extra." },
            { head: "The mark is generated", text: "The portal gives the number and the letters at random, and the registration certificate carries the BH mark." },
          ]} />
        </Block>

        <Block icon={<Stamp size={16} />} title="Converting a vehicle you already have">
          <p>Since the change of December 2022 a vehicle with an ordinary mark can be converted to the BH series, <b>subject to payment of the tax</b> for it. As published guides describe it:</p>
          <Steps items={[
            { head: "Apply to the registering authority", text: "The guides name Form 27A, with the existing registration certificate and the proof of eligibility (identity card or Form 60). Confirm the form with your RTO or on the portal." },
            { head: "Settle any loan", text: "If the vehicle is under hire-purchase or hypothecation, the financier's consent is needed." },
            { head: "The tax is worked out and paid", text: "On the invoice price of the vehicle (the same bands as below). Whether a part of the State tax you paid earlier can be refunded is for your old RTO to say, and differs between States." },
            { head: "The authority approves", text: "The BH mark is allotted and the certificate changed." },
          ]} />
        </Block>

        <Block icon={<ListChecks size={16} />} title="Papers to keep ready">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {["Official identity card (government, defence or public sector) or Form 60 (private firm)", "Dealer's invoice (the price without GST decides the tax)", "Identity proof and address proof", "Insurance and pollution certificate, as for any registration", "For a converted vehicle: the existing registration certificate", "For a financed vehicle: the financier's consent"].map((t) => (
              <li key={t} className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm leading-snug"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">The forms that every new registration needs (the application, the sale certificate, the roadworthiness certificate) are handled by the dealer.</p>
        </Block>

        <Block icon={<Receipt size={16} />} title="The road tax, and how it is worked out">
          <p>The tax is on the <b>invoice price without GST</b>, for <b>two years or a multiple of two</b>. The rate depends on the price band and the fuel:</p>
          <div className="mt-3 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[26rem] text-center text-sm">
              <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600"><tr><th className="px-2.5 py-1.5 text-left font-semibold">Invoice price (without GST)</th><th className="px-2.5 py-1.5 font-semibold">Petrol, CNG, hybrid</th><th className="px-2.5 py-1.5 font-semibold">Diesel</th><th className="px-2.5 py-1.5 font-semibold">Electric</th></tr></thead>
              <tbody>
                {BH_BANDS.map((b) => <tr key={b.label} className="border-t border-slate-100"><th className="px-2.5 py-1.5 text-left font-bold text-slate-800">{b.label[0].toUpperCase() + b.label.slice(1)}</th><td className="font-extrabold text-slate-900">{b.base}%</td><td className="font-extrabold text-amber-700">{b.base + 2}%</td><td className="font-extrabold text-emerald-700">{b.base - 2}%</td></tr>)}
              </tbody>
            </table>
          </div>
          <p className="mt-3"><b>Two-year tax = invoice price × rate × 1.25 × 2 ÷ 15</b>, rounded up to the next rupee. The 1.25 is a surcharge of 25%; the 2 ÷ 15 takes two years out of fifteen. Together they make one-sixth. From the <b>fourteenth year</b> the tax is paid <b>every year</b>, at <b>half</b> of the two-year amount.</p>
          <p className="mt-2"><b>Late payment:</b> after seven days from the due date an extra fee of <b>₹100 for each day</b> is charged. Tax can be paid for several two-year periods in advance.</p>
          <div className="mt-3"><BhTaxEstimate /></div>
          <p className="mt-2 text-xs text-slate-500">Try ₹8,00,000 in petrol: the tax comes to ₹10,667 for two years. At ₹12,00,000 it is ₹20,000.</p>
        </Block>

        <Block icon={<MapPinned size={16} />} title="Moving, selling, and leaving the job">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><b>You move to another State:</b> the mark stays. If the vehicle is kept in a State other than the one where it was registered, tell the registering authority of the place where you live, in <b>Form 33</b>, within <b>30 days</b>, through the portal.</li>
            <li><b>You sell to an eligible person:</b> the BH mark can stay while the new owner remains eligible.</li>
            <li><b>You sell to someone who is not eligible:</b> published guides say the vehicle is then given an ordinary mark and taxed under the rules of that State.</li>
            <li><b>You stop being eligible</b> (you leave the employer): the guides say the vehicle can stay in the BH series for the period for which the tax has been paid. Ask the RTO what is to be done after that.</li>
          </ul>
        </Block>

        <Block icon={<Scale size={16} />} title="Is it right for you?">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2"><div className="text-sm font-extrabold text-emerald-900">It suits you if</div><ul className="mt-1 list-disc space-y-1 pl-5 text-sm"><li>you are likely to be posted to another State;</li><li>you would rather not go through a new registration each time;</li><li>you are happy to pay the tax every two years.</li></ul></div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2"><div className="text-sm font-extrabold text-amber-900">Think again if</div><ul className="mt-1 list-disc space-y-1 pl-5 text-sm"><li>you expect to stay in one State: the ordinary mark may cost less over the years;</li><li>you want a number of your own choice;</li><li>you may leave the employer soon.</li></ul></div>
          </div>
        </Block>

        <Block icon={<ShieldAlert size={16} />} title="Common doubts">
          <div className="grid gap-1.5">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group rounded-xl border border-slate-200 bg-white px-3 py-2 open:bg-slate-50">
                <summary className="cursor-pointer text-sm font-bold text-slate-900">{q}</summary>
                <p className="mt-1.5 text-sm leading-snug text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </Block>

        <Block icon={<BookOpenText size={16} />} title="Where this comes from, and what to confirm">
          <p>The rules are in the <b>Central Motor Vehicles (Twentieth Amendment) Rules, 2021</b> (G.S.R. 594(E), 26 August 2021; the draft was G.S.R. 276(E), 6 April 2021), under section 64 of the Motor Vehicles Act, 1988. They add the working certificate (Form 60), the form of the mark, the tax (rule 51B) and the exemption from the 12-month rule (rule 54(3), with Form 33). The conversion of existing vehicles came with the amendment of December 2022. This page was written in November 2026 from the rule text and from published guides; rules and portal procedures change.</p>
          <p className="mt-2"><b>Confirm with the RTO or on the Parivahan portal</b> (parivahan.gov.in) before you act on any of these, because the sources I read are silent or differ on them:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            <li>the form and papers for a conversion (guides name Form 27A) and the refund of State tax already paid;</li>
            <li>what happens on a sale to an ineligible buyer, and after the owner stops being eligible;</li>
            <li>the band for a price of exactly ₹10 lakh or ₹20 lakh (the words of the rule put them in the middle band);</li>
            <li>whether a body such as a public sector bank counts as a public sector undertaking;</li>
            <li>the registration charges, which this page does not give.</li>
          </ul>
        </Block>
      </div>
    </section>
  );
}

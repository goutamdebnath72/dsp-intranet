#!/usr/bin/env python3
# scripts/steel/refresh-mos.py: REFRESH THE STEEL CARD'S MONTHLY FIGURES from the Ministry of Steel's "Monthly Economic Report" PDFs (https://steel.gov.in/monthly-summary) and rewrite src/tools/steel/mos.ts.
#   python3 scripts/steel/refresh-mos.py              download every report the page lists, read them, write src/tools/steel/mos.ts
#   python3 scripts/steel/refresh-mos.py --dry        the same, but print what would change and write nothing
# Needs `pdftotext` (poppler) and `curl`. Each report gives its month, the month before and the same month a year earlier; where a month is in two reports the NEWER report's figure is kept (it is the revised one).
# It stops and says so if a report's layout has changed (a price sentence or a table it cannot read) rather than writing a guess. After it runs: `npx tsx --tsconfig tsconfig.selftest.json src/tools/steel/steel.selftest.ts`.
# NOT done here (kept by hand in src/tools/steel/mosAnnual.ts): the yearly tables of the Overview, the cumulative April-to-date figures, and the companies' quarterly figures (companies.ts: read from each company's own results).
import html, json, os, re, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "src/tools/steel/mos.ts")
BASE = "https://steel.gov.in"
MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
DRY = "--dry" in sys.argv

def sh(*a): return subprocess.run(a, check=True, capture_output=True, text=True).stdout
def shift(ym, k):
    y, m = map(int, ym.split("-")); t = y * 12 + (m - 1) + k
    return f"{t // 12:04d}-{t % 12 + 1:02d}"
def month_of(title):
    m = re.search(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s*(?:’|')?\s*(20\d\d)", title, re.I)
    return f"{m.group(2)}-{MONTHS[m.group(1).lower()[:3]]:02d}" if m else None
def num(s): return float(s.replace(",", ""))

work = tempfile.mkdtemp(prefix="steel-mos-")
idx = os.path.join(work, "idx.html")
sh("curl", "-sS", "-m", "30", "-L", "-A", "Mozilla/5.0", "-o", idx, f"{BASE}/monthly-summary")
page = open(idx, encoding="utf-8", errors="replace").read()
links = [(l, html.unescape(n).strip()) for l, n in re.findall(r'href="(/sites/default/files/[^"]+\.pdf)"[^>]*>([^<]{0,100})', page, flags=re.I) if "itizen" not in n and "Economic" in html.unescape(n) or "Ecomnomic" in n]
reports = {}
for l, n in links:
    ym = month_of(n)
    if ym and ym not in reports: reports[ym] = l
if len(reports) < 3: sys.exit("fewer than three monthly reports found on the page: the page has changed, nothing written")
out = {"price": {}, "iron": {}, "cpse": {}, "wsa": {}}
numrow = lambda l: ([num(x) for x in re.findall(r"(?<![\w.])-?\d[\d,]*\.?\d*(?![\w])", l)] if len(re.findall(r"(?<![\w.])-?\d[\d,]*\.?\d*(?![\w])", l)) >= 6 else None)
names = [("SAIL","hot_metal"),("SAIL","crude_steel"),("SAIL","saleable_steel"),("SAIL","iron_ore"),("SAIL","sales_saleable"),("RINL","liquid_steel"),("RINL","hot_metal"),("RINL","crude_steel"),("RINL","saleable_steel"),("NSL","hot_metal"),("NSL","liquid_steel"),("NSL","crude_steel"),("NSL","hrc")]
countries = ["China", "India", "United States", "Japan", "Russia", "South Korea", "World"]
for ym in sorted(reports):                      # oldest first, so that a newer report overwrites
    pdf = os.path.join(work, f"{ym}.pdf"); sh("curl", "-sS", "-m", "120", "-L", "-A", "Mozilla/5.0", "-o", pdf, BASE + reports[ym])
    t = sh("pdftotext", "-layout", pdf, "-"); flat = re.sub(r"\s+", " ", t)
    m = re.search(r"Mumbai market stood at Rs\. ?([\d,]+) per tonne, Rs\. ?([\d,]+) per tonne and Rs\. ?([\d,]+) per tonne", flat)
    if not m: sys.exit(f"{ym}: the retail price sentence was not found: the report's wording has changed, nothing written")
    out["price"][ym] = [int(x.replace(",", "")) for x in m.groups()]
    mi = re.search(r"prices of iron ore lumps stood at Rs\. ?([\d,]+)/ ?tonne", flat); out["iron"][ym] = int(mi.group(1).replace(",", "")) if mi else None
    if "Annexure-III" not in t or "Annexure-II" not in t: sys.exit(f"{ym}: Annexure II or III not found, nothing written")
    rows = [r for r in (numrow(l) for l in t[t.rindex("Annexure-III"):].split("\n")) if r]
    if len(rows) < 13: sys.exit(f"{ym}: the CPSE table has {len(rows)} readable rows, expected 13 or more: nothing written")
    for (co, item), r in zip(names, rows[:5] + rows[-8:]):
        d = out["cpse"].setdefault(co, {}).setdefault(item, {})
        for key, v in ((shift(ym, -12), r[0]), (shift(ym, -1), r[1]), (ym, r[2])): d[key] = v
    a2 = t[t.index("Annexure-II"):t.rindex("Annexure-III")]
    vals = [[num(x) for x in re.findall(r"(?<![\w.])-?\d[\d,]*\.?\d*(?![\w])", l)] for l in a2.split("\n")]
    vals = [v for v in vals if len(v) == 8 or len(v) == 7 and False]
    vals = [v for v in (re.search(r"(?:^|\s)((?:-?[\d,]*\.?\d+\s+){7}-?[\d,]*\.?\d+)\s*$", l) for l in a2.split("\n")) if v]
    vals = [[num(x) for x in v.group(1).split()] for v in vals]
    if len(vals) != 7: sys.exit(f"{ym}: Annexure II has {len(vals)} country rows, expected 7: nothing written")
    wcur = shift(ym, -1)                          # the world figures are a month behind the report
    for c, r in zip(countries, vals):
        d = out["wsa"].setdefault(c, {})
        for key, v in ((shift(wcur, -12), r[0]), (shift(wcur, -1), r[1]), (wcur, r[2])): d[key] = v
months = sorted(out["price"])
# the Ministry's CPSE table is in lakh tonnes; the steel trade speaks in million tonnes (MT), so the file keeps MT (1 lakh tonne = 0.1 MT, exact to three decimals)
r3 = lambda v: "null" if v is None else repr(round(v / 10, 3))
L = []
L.append(open(OUT, encoding="utf-8").read().split("export interface Report")[0].rstrip("\n").split("\n// The reports are provisional")[0] + "\n// The reports are provisional (\"P\") and are revised: the card says so. THIS FILE IS WRITTEN BY scripts/steel/refresh-mos.py: do not edit it by hand.\n\nexport interface Report { month: string; url: string }\nexport const MOS_REPORTS: Report[] = [\n")
for ym in months: L.append(f'  {{ month: "{ym}", url: "{BASE}{reports[ym]}" }},\n')
L.append('];\nexport const MOS_SITE = "https://steel.gov.in/monthly-summary";\nexport const MOS_OVERVIEW = "https://steel.gov.in/overview-steel-sector";\n\n')
L.append("/** month-end retail prices in Mumbai, Rs per tonne including GST: TMT 10 mm, HR coil 2.50 mm, CR coil 0.63 mm */\nexport interface RetailPoint { month: string; tmt: number; hrc: number; crc: number }\nexport const RETAIL: readonly RetailPoint[] = [\n")
for ym in months: p = out["price"][ym]; L.append(f'  {{ month: "{ym}", tmt: {p[0]}, hrc: {p[1]}, crc: {p[2]} }},\n')
L.append("];\n\n/** NMDC lump iron ore (Chhattisgarh, 6-40 mm, Fe 65.5%), Rs per tonne; null where the report does not say it in words */\nexport const IRON_ORE: ReadonlyArray<{ month: string; lumps: number | null }> = [\n")
for ym in months: L.append(f'  {{ month: "{ym}", lumps: {out["iron"][ym] if out["iron"][ym] is not None else "null"} }},\n')
L.append("];\n\n/** the steel CPSEs, in million tonnes (MT), month by month */\nexport interface CpseMonth { month: string; crude: number | null; saleable: number | null; sales: number | null; hotMetal: number | null }\n")
sail = out["cpse"]["SAIL"]
ks = sorted({k for it in ("crude_steel", "saleable_steel", "sales_saleable", "hot_metal") for k in sail[it]})
L.append("export const SAIL_MONTHLY: readonly CpseMonth[] = [\n")
for k in ks: L.append(f'  {{ month: "{k}", crude: {r3(sail["crude_steel"].get(k))}, saleable: {r3(sail["saleable_steel"].get(k))}, sales: {r3(sail["sales_saleable"].get(k))}, hotMetal: {r3(sail["hot_metal"].get(k))} }},\n')
L.append("];\n")
def other(co, crude, sec):
    dd = out["cpse"][co]; s = f"export const {co}_MONTHLY: ReadonlyArray<{{ month: string; crude: number | null; second: number | null }}> = [\n"
    for k in sorted(dd[crude]): s += f'  {{ month: "{k}", crude: {r3(dd[crude].get(k))}, second: {r3(dd[sec].get(k))} }},\n'
    return s + "];\n"
L.append("/** RINL: crude steel and saleable steel */\n" + other("RINL", "crude_steel", "saleable_steel") + "/** NMDC Steel (NSL): crude steel and hot-rolled coil */\n" + other("NSL", "crude_steel", "hrc"))
L.append("\n/** crude steel production by country, million tonnes, month by month (World Steel Association) */\nexport const WSA_MONTHLY: Readonly<Record<string, ReadonlyArray<readonly [month: string, mt: number]>>> = {\n")
for c in countries: L.append(f'  "{c}": [' + ", ".join(f'["{k}", {out["wsa"][c][k]}]' for k in sorted(out["wsa"][c])) + "],\n")
L.append("};\n")
new = "".join(L)
old = open(OUT, encoding="utf-8").read()
print(f"{len(reports)} reports ({months[0]} to {months[-1]}); {'no change' if new == old else 'the file would change'}")
if DRY or new == old: sys.exit(0)
open(OUT, "w", encoding="utf-8").write(new); print("written", OUT)

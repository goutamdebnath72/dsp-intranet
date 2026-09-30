// src/lib/employees/analytics.ts
//
// Deterministic employee analytics. Every number comes from the DB via
// parameterized SQL -- never from AI.
//
// STAGE 8 OVERHAUL (28 Sep 2026): the people-layer below is entirely
// rebuilt on `employee_roster`/`designation_grade`/`sail_department`
// (rosterQuery.ts / designationGrades.ts / sailDepartments.ts). The old
// queryPeople()/countByTerm()/etc that queried public."user" directly and
// sorted by parsed ticket number are gone -- every list here is
// `ORDER BY global_seniority_rank`, no exceptions. The holiday section below
// (Stage 2, untouched) is unaffected by this and unchanged.

import { DateTime } from "luxon";
import { getDb } from "@/lib/db";
import { queryRoster, listByGrades, type RosterFilters } from "./rosterQuery";
import { parseAnalytics, type AnalyticsIntent } from "./parser";
import type { EmployeeResult } from "@/lib/search/employeeSearch";
import { queryHolidays, type HolidayRow } from "@/lib/holidays/analytics";
import { HolidayType } from "@/lib/db/models/holiday-master.model";
import { TYPE_LABEL as HOLIDAY_TYPE_LABEL, CATEGORY_LABEL, MONTH_LABEL } from "@/lib/holidays/terms";

// ============================================================================
// Headcount / list helpers -- thin wrappers over rosterQuery for the cases
// answerAnalytics needs directly.
// ============================================================================

export async function totalHeadcount(): Promise<number> {
  return (await queryRoster({ op: "count", filters: {} })).count;
}

export async function deptHeadcount(deptIds: number[]): Promise<number> {
  if (!deptIds.length) return 0;
  return (await queryRoster({ op: "count", filters: { sailDeptIds: deptIds } })).count;
}

export interface BreakdownRow {
  designation: string; // designation_grade.title
  count: number;
  short: string;
  class: "managerial" | "medical" | "nonexec" | "unknown";
}

async function buildBreakdown(sailDeptIds?: number[]): Promise<BreakdownRow[]> {
  const d = await getDb();
  const params: any[] = [];
  let where = "TRUE";
  if (sailDeptIds && sailDeptIds.length) {
    params.push(sailDeptIds);
    where = `er.sail_department_id = ANY($1::smallint[])`;
  }
  const rows: any[] = await d.query(
    `SELECT dg.title AS title, dg.track AS track, dg.rank_order AS "rankOrder", count(*)::int AS n
       FROM public.employee_roster er
       JOIN public.designation_grade dg ON dg.id = er.designation_grade_id
      WHERE ${where}
      GROUP BY dg.id, dg.title, dg.track, dg.rank_order
      ORDER BY dg.rank_order`,
    params,
  );
  return rows.map((r: any) => ({
    designation: r.title,
    count: Number(r.n) || 0,
    short: r.title,
    class: (r.track as BreakdownRow["class"]) ?? "unknown",
  }));
}

/** Full designation-wise breakdown across DSP, senior-most first. */
export async function designationBreakdown(): Promise<BreakdownRow[]> {
  return buildBreakdown();
}

/** Designation-wise breakdown scoped to a set of sail_department ids. */
export async function deptBreakdown(deptIds: number[]): Promise<BreakdownRow[]> {
  if (!deptIds.length) return [];
  return buildBreakdown(deptIds);
}

export interface AnalyticsPayload {
  kind: "count" | "total" | "breakdown" | "pending" | "error" | "clarify";
  answer: string;
  label?: string;
  count?: number;
  rows?: BreakdownRow[];
  people?: EmployeeResult[];
  listTruncated?: boolean;
  /** Stage 2: holiday rows for a holiday list query (rendered like People). */
  holidays?: HolidayRow[];
  typeBreakdown?: { type: string; label: string; count: number }[];
  rawEntryCount?: number;
  rhQuotaByCategory?: { category: string; quota: number }[];
  categoryLabels?: Record<string, string>;
  /**
   * Added 29 Sep 2026 for the hybrid LLM router's feedback loop (see
   * queryOrchestrator.ts / patternCache.ts): present ONLY when this answer
   * came from a fresh LLM classification that generalized to a new,
   * not-yet-trusted pattern. The frontend should show a tick/cross on any
   * payload carrying this id, and call the pattern-feedback endpoint with
   * it on an explicit click. Nothing is inferred from behaviour -- no click,
   * no signal. Absent for every
   * other answer (deterministic parser, or an already-confirmed cache hit)
   * -- those never need feedback UI at all.
   */
  pendingPatternId?: number;
  /**
   * Added 29 Sep 2026: a plain-language statement of how an LLM-derived
   * query was understood (e.g. `Name has the word "kumar" and "kumar" is not
   * the first word ...`). Present only on answers that came from the LLM
   * tier or a learned-pattern hit, never on deterministic-parser answers.
   * The verifier proves rows match the interpreted condition; this line lets
   * the person check the condition itself matches what they meant.
   */
  interpretation?: string;
}

/**
 * Original public entry point: parse a raw query with the deterministic
 * regex/pattern parser, then execute it. Kept exactly as before for any
 * existing caller -- this is now also the FALLBACK path the new LLM
 * orchestrator (queryOrchestrator.ts) calls when LLM classification fails
 * or declines to handle a query.
 */
export async function answerAnalytics(q: string): Promise<AnalyticsPayload | null> {
  const intent = await parseAnalytics(q);
  if (!intent) return null;
  return runAnalyticsIntent(intent);
}

/**
 * Execute an already-parsed intent and produce the final display payload.
 * Split out from answerAnalytics() on 29 Sep 2026 so the new LLM-based
 * intent orchestrator (queryOrchestrator.ts) can supply its OWN grounded
 * intent directly, without going through the regex/pattern parser at all --
 * that parser (parseAnalytics, below) is now the FALLBACK path only, used
 * when the LLM classification fails or is low-confidence. Every existing
 * intent kind and its formatting is unchanged.
 *
 * Return type stays NULLABLE (not a plain AnalyticsPayload): a weak,
 * unquoted peopleByName search that finds nothing signals null on purpose,
 * meaning "let the caller fall through to semantic/circular search" rather
 * than assert "no employees found" -- this must survive the split, not get
 * papered over into a forced non-null return.
 */
export async function runAnalyticsIntent(intent: AnalyticsIntent): Promise<AnalyticsPayload | null> {
  const holidayYearNotLoaded = (year: number): AnalyticsPayload => ({
    kind: "pending",
    answer: `I don't have holiday data loaded for ${year} yet.`,
  });

  const monthsLabel = (months: number[] | null, year?: number): string => {
    if (!months || months.length === 0) return year != null ? ` in ${year}` : "";
    const names = months.map((m) => MONTH_LABEL[m]);
    const joined =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    return ` in ${joined}${year != null ? ` ${year}` : ""}`;
  };

  const formatIsoDate = (iso: string | null): string => {
    if (!iso) return "";
    const d = DateTime.fromISO(iso);
    return d.isValid ? d.toFormat("d LLL yyyy") : iso;
  };

  const holidayBadQuery = (message: string): AnalyticsPayload => ({
    kind: "error",
    answer: message,
  });

  switch (intent.kind) {
    case "deptTotal": {
      const n = await deptHeadcount(intent.deptIds);
      return {
        kind: "count",
        count: n,
        answer: `${intent.deptName} has ${n.toLocaleString()} employees.`,
      };
    }

    case "deptBreakdown": {
      const rows = await deptBreakdown(intent.deptIds);
      return {
        kind: "breakdown",
        rows,
        answer: `Designation-wise breakdown for ${intent.deptName} (${rows.length} designations).`,
      };
    }

    case "people": {
      const filters: RosterFilters = {
        gradeIds: intent.gradeIds ?? undefined,
        cohort: intent.cohort ?? undefined,
        sailDeptIds: intent.deptIds ?? undefined,
      };
      const res = await queryRoster({ op: intent.list ? "list" : "count", filters, limit: 100 });
      const scope = intent.scopeName;
      const noun =
        intent.cohort === "executive"
          ? "executives"
          : intent.cohort === "nonexecutive"
            ? "non-executives"
            : intent.label === "Employees"
              ? "employees"
              : intent.label;
      const answer = scope
        ? `${scope} has ${res.count.toLocaleString()} ${noun}.`
        : `DSP currently has ${res.count.toLocaleString()} ${noun}.`;
      const payload: AnalyticsPayload = {
        kind: "count",
        label: intent.label,
        count: res.count,
        answer,
      };
      if (intent.list) {
        payload.people = res.people ?? [];
        payload.listTruncated = res.count > (res.people?.length ?? 0);
      }
      return payload;
    }

    case "peopleByName": {
      const res = await queryRoster({
        op: "list",
        filters: {
          ...(intent.exact
            ? { nameExact: intent.fragment }
            : intent.namePredicate
              ? { namePredicate: intent.namePredicate }
              : { nameFragment: intent.fragment }),
          sailDeptIds: intent.deptIds ?? undefined,
        },
        limit: 100,
      });
      if (res.count === 0 && !intent.strong) return null;
      const scope = intent.scopeName ? ` in ${intent.scopeName}` : "";
      const noun = res.count === 1 ? "person" : "people";
      // With a predicate tree, quoting one leaf value ("matching \"kumar\"")
      // misdescribes a compound condition -- the interpretation line shown
      // under the answer states the real condition.
      const subject = intent.namePredicate ? "the stated condition" : `"${intent.fragment}"`;
      const answer =
        res.count === 0
          ? `No employees matching ${subject}${scope}.`
          : `${res.count.toLocaleString()} ${noun} matching ${subject}${scope}.`;
      const payload: AnalyticsPayload = {
        kind: "count",
        label: intent.fragment || "matching employees",
        count: res.count,
        answer,
      };
      if (res.people && res.people.length) {
        payload.people = res.people;
        payload.listTruncated = res.count > res.people.length;
      }
      return payload;
    }

    case "total": {
      const n = await totalHeadcount();
      return {
        kind: "total",
        count: n,
        answer: `DSP has ${n.toLocaleString()} employees on record.`,
      };
    }

    case "breakdown": {
      const rows = await designationBreakdown();
      return {
        kind: "breakdown",
        rows,
        answer: `Designation-wise breakdown across DSP (${rows.length} designations).`,
      };
    }

    case "holidayCount": {
      // Closed holidays apply to EVERY employee category -- holidayyear
      // never sets `categories` on a CH row (see queryHolidays' buildWhere
      // comment), so filtering a CH count by category would always
      // silently return 0. That reads as "Category X gets none," which is
      // the opposite of the truth. Drop the inapplicable filter and say so.
      if (intent.type === HolidayType.CH && intent.category) {
        const res = await queryHolidays({ op: "count", filters: { year: intent.year, type: intent.type } });
        if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
        const noun = res.count === 1 ? "Closed holiday" : "Closed holidays";
        return {
          kind: "count",
          count: res.count,
          answer: `Closed holidays apply to every employee category, including Category ${intent.category} — there ${res.count === 1 ? "is" : "are"} ${res.count.toLocaleString()} ${noun} in ${intent.year}.`,
        };
      }

      // Restricted Holiday entitlement per category is a QUOTA fact
      // (holiday_rh_quota) -- RH rows themselves never carry a category
      // either (same reason as CH above), so a plain row-count filtered by
      // category would also always silently return 0. Answer from the
      // real source instead.
      if (intent.type === HolidayType.RH && intent.category) {
        const quotaRes = await queryHolidays({
          op: "rhQuota",
          filters: { year: intent.year, category: intent.category },
        });
        if (quotaRes.yearAvailable === false) return holidayYearNotLoaded(intent.year);
        const row = (quotaRes.rhQuota ?? [])[0];
        if (!row) {
          return {
            kind: "pending",
            answer: `I couldn't find an RH quota for Category ${intent.category} in ${intent.year}.`,
          };
        }
        const noun = row.quota === 1 ? "Restricted Holiday" : "Restricted Holidays";
        return {
          kind: "count",
          count: row.quota,
          answer: `Restricted Holidays aren't assigned per category — Category ${row.category} can choose ${row.quota} ${noun} in ${intent.year} from the full RH list.`,
        };
      }

      const res = await queryHolidays({
        op: "count",
        filters: { year: intent.year, type: intent.type, category: intent.category },
      });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      const label = intent.type ? `${HOLIDAY_TYPE_LABEL[intent.type]} holiday` : "holiday";
      const noun = res.count === 1 ? label : `${label}s`;
      const forCategory = intent.category ? ` for Category ${intent.category}` : "";
      return {
        kind: "count",
        count: res.count,
        answer: `There ${res.count === 1 ? "is" : "are"} ${res.count.toLocaleString()} ${noun} in ${intent.year}${forCategory}.`,
      };
    }

    case "holidayList": {
      // Same reasoning as holidayCount above: CH applies to every category,
      // so a category filter on a CH list is dropped and the answer says
      // so explicitly, instead of "No Closed holidays found ... for
      // Category A" -- which reads as Category A getting none, when in
      // fact they get every one of them, same as everyone else.
      if (intent.type === HolidayType.CH && intent.category) {
        const res = await queryHolidays({ op: "list", filters: { year: intent.year, type: intent.type, months: intent.months } });
        if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
        const rows = res.holidays ?? [];
        const scope = monthsLabel(intent.months);
        const answer = rows.length
          ? `Closed holidays apply to every employee category, including Category ${intent.category} — ${rows.length} in ${intent.year}${scope}.`
          : `No Closed holidays found in ${intent.year}${scope} (this applies to every employee category, including Category ${intent.category}).`;
        return { kind: "count", count: rows.length, answer, holidays: rows };
      }

      // RH per-category entitlement is a QUOTA, not a distinct subset of
      // the RH list -- every employee picks from the same master list, so
      // "restricted holidays for Category D" has no different list than
      // the full one. Show the full list plus the real quota fact together,
      // rather than a category filter that would always silently be empty.
      if (intent.type === HolidayType.RH && intent.category) {
        const [listRes, quotaRes] = await Promise.all([
          queryHolidays({ op: "list", filters: { year: intent.year, type: intent.type, months: intent.months } }),
          queryHolidays({ op: "rhQuota", filters: { year: intent.year, category: intent.category } }),
        ]);
        if (listRes.yearAvailable === false || quotaRes.yearAvailable === false) {
          return holidayYearNotLoaded(intent.year);
        }
        const rows = listRes.holidays ?? [];
        const quotaRow = (quotaRes.rhQuota ?? [])[0];
        const quotaText = quotaRow
          ? ` Category ${quotaRow.category}'s quota is ${quotaRow.quota} of these.`
          : "";
        const scope = monthsLabel(intent.months);
        const answer = `Restricted Holidays aren't assigned per category — here ${rows.length === 1 ? "is" : "are"} all ${rows.length} in ${intent.year}${scope}.${quotaText}`;
        return { kind: "count", count: rows.length, answer, holidays: rows };
      }

      const res = await queryHolidays({
        op: "list",
        filters: {
          year: intent.year,
          type: intent.type,
          months: intent.months,
          category: intent.category,
          fromDate: intent.fromDate,
          toDate: intent.toDate,
        },
      });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      const rows = res.holidays ?? [];

      // A holiday can carry two type rows for the same real day (the
      // documented "same holiday, same year" dual FH/RH pattern -- see
      // holidays/analytics.ts's schema-facts comment). The headline count
      // should reflect distinct holiday occasions, not raw (date,type)
      // rows, which double-counts those days -- 13 dual-type days in a
      // year otherwise inflate "39 holidays" into a misleading "52".
      // OmnibarModal.tsx's table groups by the same (date + name) key, so
      // this number matches what the person can actually count in the
      // table below it.
      const distinctCount = new Set(rows.map((r) => `${r.date}|${r.name}`)).size;

      const label = intent.type ? `${HOLIDAY_TYPE_LABEL[intent.type]} holiday` : "holiday";
      const scope = intent.toDate
        ? ` from ${formatIsoDate(intent.fromDate)} to ${formatIsoDate(intent.toDate)}`
        : intent.fromDate
          ? ` from today to 31 Dec ${intent.year}`
          : monthsLabel(intent.months, intent.year);
      const forCategory = intent.category ? ` for Category ${intent.category}` : "";
      const answer = distinctCount
        ? `${distinctCount} ${distinctCount === 1 ? label : `${label}s`}${scope}${forCategory}.`
        : `No ${label}s found${scope}${forCategory}.`;

      // Per-type tally, from these SAME filtered rows (so month/category
      // filters stay consistent with the list itself) -- only meaningful
      // when no single type was already asked for; a type-filtered list
      // only ever has one type, so a breakdown of it would be pointless.
      const typeBreakdown =
        !intent.type && rows.length > 0
          ? (Object.values(HolidayType) as HolidayType[]).map((t) => ({
              type: t,
              label: HOLIDAY_TYPE_LABEL[t],
              count: rows.filter((r) => r.type === t).length,
            }))
          : undefined;

      // Per-category RH quota (holiday_rh_quota, a YEAR-level policy fact,
      // not a per-row one) -- fetched alongside the list so the frontend can
      // show real, complete category information without a second round
      // trip. This matters specifically because RH categories work
      // differently from CH/FH: CH applies to every category (no per-row
      // data needed), FH is restricted to whichever categories its own row
      // names, but RH is a SHARED POOL every category can pick from -- the
      // real per-category fact for RH isn't "which categories can use this
      // holiday" (all of them can) but "how many they're allowed to pick,
      // which differs by category." Showing all four categories ticked for
      // an RH row without this quota alongside it would itself be a new,
      // subtler version of the same "technically true but misleading"
      // problem this whole feature has been fixing.
      let rhQuotaByCategory: { category: string; quota: number }[] | undefined;
      if (!intent.type && rows.length > 0) {
        const quotaRes = await queryHolidays({ op: "rhQuota", filters: { year: intent.year } });
        rhQuotaByCategory = quotaRes.rhQuota ?? [];
      }

      return {
        kind: "count",
        count: distinctCount,
        answer,
        holidays: rows,
        typeBreakdown,
        rawEntryCount: rows.length,
        rhQuotaByCategory,
        categoryLabels: rhQuotaByCategory ? CATEGORY_LABEL : undefined,
      };
    }

    case "holidayBreakdown": {
      const res = await queryHolidays({ op: "breakdown", filters: { year: intent.year } });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      const byType = res.byType ?? [];
      const rows: BreakdownRow[] = byType.map((b) => ({
        designation: b.type,
        count: b.count,
        short: `${b.label} (${b.type})`,
        class: "unknown",
      }));
      return {
        kind: "breakdown",
        rows,
        answer: `Holiday breakdown for ${intent.year}: ${byType.map((b) => `${b.label} ${b.count}`).join(", ")}.`,
      };
    }

    case "holidayCompare": {
      const res = await queryHolidays({
        op: "compare",
        filters: { year: intent.yearA, yearB: intent.yearB },
      });
      if (res.yearAvailable === false) {
        return {
          kind: "pending",
          answer: `I can only compare years already loaded in the holiday calendar; ${intent.yearA} or ${intent.yearB} isn't loaded yet.`,
        };
      }
      const c = res.compare!;
      if (intent.type) {
        const row = c.byType.find((t) => t.type === intent.type)!;
        const diff = row.a - row.b;
        const diffTxt = diff === 0 ? "no change" : diff > 0 ? `+${diff}` : `${diff}`;
        return {
          kind: "count",
          count: row.a,
          answer: `${row.label} holidays: ${c.yearA} has ${row.a}, ${c.yearB} had ${row.b} (${diffTxt}).`,
        };
      }
      const parts = c.byType.map((t) => `${t.label} ${c.yearA}: ${t.a} vs ${c.yearB}: ${t.b}`);
      return {
        kind: "count",
        count: c.totalA,
        answer: `${c.yearA} has ${c.totalA} holidays total vs ${c.yearB}'s ${c.totalB}. ${parts.join("; ")}.`,
      };
    }

    case "holidayFindOne": {
      const now = DateTime.now();
      const yearGiven = intent.year != null;
      const firstYear = intent.year ?? now.year;
      let res = await queryHolidays({ op: "list", filters: { name: intent.name, year: firstYear } });
      if (yearGiven && res.yearAvailable === false) {
        return holidayYearNotLoaded(firstYear);
      }
      if ((res.holidays?.length ?? 0) === 0 && !yearGiven) {
        // No hit in the default (current) year -- search any loaded year.
        res = await queryHolidays({ op: "list", filters: { name: intent.name, year: null } });
      }
      const rows = res.holidays ?? [];
      if (rows.length === 0) {
        return {
          kind: "pending",
          answer: `I couldn't find a holiday named “${intent.name}” in the loaded calendar.`,
        };
      }
      if (rows.length === 1) {
        const r = rows[0];
        const d = DateTime.fromISO(r.date);
        const noteText = r.note ? ` ${r.note}` : "";
        return {
          kind: "count",
          answer: `${r.name} falls on ${d.toFormat("d LLLL yyyy")} (${HOLIDAY_TYPE_LABEL[r.type]}).${noteText}`,
        };
      }
      const lines = rows.map((r) => {
        const d = DateTime.fromISO(r.date);
        return `${d.toFormat("d LLLL yyyy")} (${HOLIDAY_TYPE_LABEL[r.type]})`;
      });
      return { kind: "count", answer: `${intent.name}: ${lines.join("; ")}.` };
    }

    case "holidayTypeLookup": {
      const filters = intent.date
        ? { date: intent.date, year: intent.year }
        : { name: intent.name, year: intent.year };
      const res = await queryHolidays({ op: "list", filters });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      const rows = res.holidays ?? [];
      if (rows.length === 0) {
        const what = intent.date
          ? `${intent.date.day} ${MONTH_LABEL[intent.date.month]} ${intent.year}`
          : `“${intent.name}” in ${intent.year}`;
        return { kind: "pending", answer: `${what} isn't a holiday in the loaded calendar.` };
      }
      const lines = rows.map((r) => `${r.name} (${HOLIDAY_TYPE_LABEL[r.type]})`);
      const notes = Array.from(new Set(rows.map((r) => r.note).filter((n): n is string => !!n)));
      const noteText = notes.length ? ` ${notes.join(" ")}` : "";
      return { kind: "count", answer: `${lines.join(" and ")}.${noteText}` };
    }

    case "holidayExists": {
      const res = await queryHolidays({ op: "list", filters: { date: intent.date, year: intent.year } });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      const rows = res.holidays ?? [];
      const dateLabel = `${intent.date.day} ${MONTH_LABEL[intent.date.month]} ${intent.year}`;
      if (rows.length === 0) {
        return { kind: "count", answer: `No, ${dateLabel} is not a holiday.` };
      }
      const names = rows.map((r) => `${r.name} (${HOLIDAY_TYPE_LABEL[r.type]})`).join(" and ");
      const notes = Array.from(new Set(rows.map((r) => r.note).filter((n): n is string => !!n)));
      const noteText = notes.length ? ` ${notes.join(" ")}` : "";
      return { kind: "count", answer: `Yes — ${dateLabel} is ${names}.${noteText}` };
    }

    case "holidayInvalidCategory":
      return {
        kind: "pending",
        answer: `Category ${intent.input} is not a valid employee category`,
      };

    case "holidayBadQuery":
      return holidayBadQuery(intent.message);

    case "holidayNotificationRequest":
      // Deliberately NOT a data answer, and deliberately NOT routed to
      // circular/semantic search either -- "holiday notification 2025" is
      // asking for a standing alert (something shown at login, going
      // forward), not a one-off lookup this parser can serve. Being honest
      // that this doesn't exist yet is better than silently answering the
      // word "notification" as if it meant "list."
      return {
        kind: "pending",
        answer:
          "I can't set up notifications yet -- that would need its own feature: a reminder shown when you log in, with its own subscribe and unsubscribe controls. I can tell you the upcoming holidays right now if that helps in the meantime -- just ask \"upcoming holidays.\"",
      };

    case "holidayRhQuota": {
      const res = await queryHolidays({
        op: "rhQuota",
        filters: { year: intent.year, category: intent.category },
      });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      const rows = res.rhQuota ?? [];
      if (rows.length === 0) {
        const scope = intent.category ? ` for Category ${intent.category}` : "";
        return {
          kind: "pending",
          answer: `I couldn't find an RH quota${scope} in ${intent.year}.`,
        };
      }
      if (intent.category) {
        const r = rows[0];
        const noun = r.quota === 1 ? "Restricted Holiday" : "Restricted Holidays";
        return {
          kind: "count",
          count: r.quota,
          answer: `Category ${r.category} can take ${r.quota} ${noun} in ${intent.year}.`,
        };
      }
      const parts = rows.map((r) => `Category ${r.category}: ${r.quota}`);
      return {
        kind: "count",
        count: rows.reduce((s, r) => s + r.quota, 0),
        answer: `RH quota for ${intent.year} — ${parts.join(", ")}.`,
      };
    }
  }
  return null;
}

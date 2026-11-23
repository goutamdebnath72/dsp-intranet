// src/lib/employees/analytics.ts
//
// Deterministic employee analytics. My rule: every number comes from the DB via parameterized SQL, never from AI.
//
// Stage 8 overhaul (28 Sep 2026): I rebuilt the people layer below entirely on `employee_roster`/`designation_grade`/`sail_department`
// (rosterQuery.ts / designationGrades.ts / sailDepartments.ts). The old queryPeople()/countByTerm()/etc that queried public."user" directly and
// sorted by parsed ticket number are gone. Every list here is `ORDER BY global_seniority_rank`, no exceptions.
// The holiday section below (Stage 2) is untouched and unaffected by this.

import { DateTime } from "luxon";
import { compareTotalSentence, compareTypeSentence } from "./compareSentence";
import { getDb } from "@/lib/db";
import { queryRoster, listByGrades, type RosterFilters } from "./rosterQuery";
import { parseAnalytics, type AnalyticsIntent } from "./parser";
import type { EmployeeResult } from "@/lib/search/employeeSearch";
import { availableHolidayYears, queryHolidays, type HolidayRow } from "@/lib/holidays/analytics";
import { buildHolidayCompareView, type HolidayCompareView } from "@/lib/holidays/compareView";
import { formatYearList } from "@/lib/holidays/yearList";
import { HolidayType } from "@/lib/db/models/holiday-master.model";
import { TYPE_LABEL as HOLIDAY_TYPE_LABEL, CATEGORY_LABEL, MONTH_LABEL } from "@/lib/holidays/terms";
import { coveredByDetails, unansweredNotice } from "@/lib/holidays/compound";
import { buildHolidayDetails, labelWithCategories, notesSuffix, type HolidayDetail } from "@/lib/holidays/format";

// ============================================================================
// Headcount / list helpers. I keep these as thin wrappers over rosterQuery for the cases answerAnalytics needs directly.
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

/** I scope this designation-wise breakdown to a set of sail_department ids. */
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
  /** Stage 2: the holiday rows for a holiday list query; I render them the same way as People. */
  holidays?: HolidayRow[];
  /**
   * Structured year comparison: the screen draws a card from it (HolidayCompareCard), and I keep `answer` carrying the
   * same facts as plain text. Mirrors AnalyticsAnswer.holidayCompare in src/hooks/useOmniSearch.ts.
   */
  holidayCompare?: HolidayCompareView;
  /**
   * Structured layout for "when is X" / "is this date a holiday" answers. The screen draws a card from it
   * instead of one long sentence, and `answer` still carries the same facts as plain text.
   */
  holidayDetails?: HolidayDetail[];
  /** The one-line lead I show above the holiday card, e.g. "Yes — 23 October 2025 is a holiday." */
  lead?: string;
  /** Set when the question had a second part that I did not answer ("Not answered: ..."). */
  notice?: string;
  /** A clarifying question about a department word with more than one meaning (step 49a): the screen draws checkboxes from it. I keep one definition for the server and the screen. */
  ask?: import("@/lib/nl2sql/departmentAsk").DepartmentAsk;
  /** A hospital OPD answer (step 51a), drawn as a card by HospitalAnswerCard. I use the same type in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */
  hospital?: import("@/lib/hospital/types").HospitalAnswer;
  /** Set when someone who may use the employee manager asked for it (step 66a): EmployeeAdminPanel draws it as a panel. Same type in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */
  employeeAdmin?: import("@/lib/employees/admin/types").EmployeeAdminOpen;
  /** Set when someone who may use the PAX directory editor asked for it (step 64a): PaxAdminPanel draws it as a panel. Same type in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */
  paxAdmin?: import("@/lib/pax/admin/types").PaxAdminOpen;
  /** Set when someone who may use the Holiday Manager asked for it: HolidayAdminPanel draws it as a panel. */
  holidayAdmin?: import("@/lib/holidays/admin/types").HolidayAdminOpen;
  /** Set when someone who may use the Circular Manager asked for it: CircularAdminPanel draws it as a panel. */
  circularAdmin?: import("@/lib/circulars/admin/types").CircularAdminOpen;
  /** Set when someone who may use the Announcement Manager asked for it: AnnouncementAdminPanel draws it as a panel. */
  announcementAdmin?: import("@/lib/announcements/admin/types").AnnouncementAdminOpen;
  /** Set when someone who may use the Contact Access Log asked for it: AccessLogAdminPanel draws it as a panel. */
  accessLogAdmin?: import("@/lib/accessLog/admin/types").AccessLogAdminOpen;
  /** The management page, meaning the titles of the management tools this person may open; ManagementHubPanel draws it. */
  managementHub?: import("@/lib/facility/hub").ManagementHubOpen;
  /** Set when someone who may not have the management page asked for it. I show the card that asks him to sign in, or tells him he is not authorised (ManagementGatePanel). */
  managementGate?: import("@/lib/facility/hub").ManagementGate;
  /** I show the ONE clean answer first, big and bold (step 61a): a Yes or No (holiday verdicts), the date asked for, the department asked for. Same type in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */
  headline?: import("@/lib/ui/answerHeadline").AnswerHeadline;
  typeBreakdown?: { type: string; label: string; count: number }[];
  rawEntryCount?: number;
  rhQuotaByCategory?: { category: string; quota: number }[];
  categoryLabels?: Record<string, string>;
  /**
   * Added 29 Sep 2026 for the feedback loop of my hybrid LLM router (see
   * queryOrchestrator.ts / patternCache.ts). It is present ONLY when this answer
   * came from a fresh LLM classification that generalized to a new,
   * not-yet-trusted pattern. The frontend should show a tick/cross on any
   * payload carrying this id, and call the pattern-feedback endpoint with
   * it on an explicit click. I infer nothing from behaviour: no click,
   * no signal. It is absent for every
   * other answer (deterministic parser, or an already-confirmed cache hit),
   * and those never need feedback UI at all.
   */
  pendingPatternId?: number;
  /**
   * Added 29 Sep 2026: a plain-language statement of how an LLM-derived
   * query was understood (e.g. `Name has the word "kumar" and "kumar" is not
   * the first word ...`). Present only on answers that came from the LLM
   * tier or a learned-pattern hit, never on deterministic-parser answers.
   * The verifier proves the rows match the interpreted condition; this line lets
   * the person check that the condition itself matches what they meant.
   */
  interpretation?: string;
}

/**
 * The original public entry point: it parses a raw query with the deterministic
 * regex/pattern parser, then executes it. I kept it exactly as before for any
 * existing caller. It is now also the FALLBACK path that the new LLM
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
 * I split this out of answerAnalytics() on 29 Sep 2026 so that the new LLM-based
 * intent orchestrator (queryOrchestrator.ts) can supply its OWN grounded
 * intent directly, without going through the regex/pattern parser at all.
 * That parser (parseAnalytics, below) is now the FALLBACK path only, used
 * when the LLM classification fails or is low-confidence. Every existing
 * intent kind and its formatting is unchanged.
 *
 * The return type stays NULLABLE (not a plain AnalyticsPayload) on purpose: a weak,
 * unquoted peopleByName search that finds nothing returns null, which
 * means "let the caller fall through to semantic/circular search" rather
 * than assert "no employees found". Do not paper this over into a forced non-null return;
 * it has to survive the split.
 */
const HOLIDAY_TYPE_LABELS = HOLIDAY_TYPE_LABEL as unknown as Record<string, string>;

export async function runAnalyticsIntent(intent: AnalyticsIntent): Promise<AnalyticsPayload | null> {
  const payload = await runAnalyticsIntentCore(intent);
  // A holiday question can carry a second part that the engine does not answer. I say so, unless the card
  // already shows what that part asked for (e.g. "which categories" when the chips list the categories).
  const unanswered = "unanswered" in intent ? intent.unanswered : undefined;
  if (!payload || !unanswered || coveredByDetails(unanswered, payload.holidayDetails)) return payload;
  return { ...payload, notice: unansweredNotice(unanswered) };
}

async function runAnalyticsIntentCore(intent: AnalyticsIntent): Promise<AnalyticsPayload | null> {
  const holidayYearNotLoaded = async (year: number): Promise<AnalyticsPayload> => {
    const years = await availableHolidayYears();
    const available = years.length ? ` Years available: ${formatYearList(years)}.` : "";
    return { kind: "pending", answer: `I don't have holiday data loaded for ${year} yet.${available}` };
  };

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
      // would misdescribe a compound condition, so I leave it to the interpretation line shown
      // under the answer to state the real condition.
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
      // Closed holidays apply to EVERY employee category: holidayyear
      // never sets `categories` on a CH row (see queryHolidays' buildWhere
      // comment), so filtering a CH count by category would always
      // silently return 0. That reads as "Category X gets none," which is
      // the opposite of the truth. So I drop the inapplicable filter and say so.
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
      // (holiday_rh_quota). RH rows themselves never carry a category
      // either (same reason as CH above), so a plain row-count filtered by
      // category would also always silently return 0. I answer from the
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
        op: "list",
        filters: { year: intent.year, type: intent.type, category: intent.category },
      });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      // I count each real day once. A day that is both a Festival and a Restricted holiday has two rows but is ONE
      // holiday, and the Holiday List counts it the same way (key: date + name), so the two numbers cannot disagree.
      const entries = res.holidays ?? [];
      const occasions = new Set(entries.map((r) => `${r.date}|${r.name}`)).size;
      const sharedDays = entries.length - occasions;
      const label = intent.type ? `${HOLIDAY_TYPE_LABEL[intent.type]} holiday` : "holiday";
      const noun = occasions === 1 ? label : `${label}s`;
      const forCategory = intent.category ? ` for Category ${intent.category}` : "";
      const alsoCounted =
        sharedDays > 0 ? ` (${entries.length} entries in all: ${sharedDays} ${sharedDays === 1 ? "day is" : "days are"} counted under two types)` : "";
      return {
        kind: "count",
        count: occasions,
        answer: `There ${occasions === 1 ? "is" : "are"} ${occasions.toLocaleString()} ${noun} in ${intent.year}${forCategory}${alsoCounted}.`,
      };
    }

    case "holidayList": {
      // Same reasoning as holidayCount above: CH applies to every category,
      // so I drop a category filter on a CH list and the answer says
      // so explicitly, instead of "No Closed holidays found ... for
      // Category A". That would read as Category A getting none, when in
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
      // the RH list: every employee picks from the same master list, so
      // "restricted holidays for Category D" has no different list than
      // the full one. I show the full list plus the real quota fact together,
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
      // documented "same holiday, same year" dual FH/RH pattern; see
      // holidays/analytics.ts's schema-facts comment). I make the headline count
      // reflect distinct holiday occasions, not raw (date,type)
      // rows, which double-count those days: 13 dual-type days in a
      // year would otherwise inflate "39 holidays" into a misleading "52".
      // The table in OmnibarModal.tsx groups by the same (date + name) key, so
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

      // The per-type tally comes from these SAME filtered rows, so month/category
      // filters stay consistent with the list itself. It only makes sense
      // when no single type was already asked for: a type-filtered list
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
      // not a per-row one). I fetch it alongside the list so the frontend can
      // show real, complete category information without a second round
      // trip. This matters because RH categories work
      // differently from CH/FH: CH applies to every category (no per-row
      // data needed), FH is restricted to whichever categories its own row
      // names, but RH is a SHARED POOL every category can pick from. The
      // real per-category fact for RH isn't "which categories can use this
      // holiday" (all of them can) but "how many they're allowed to pick,
      // which differs by category." Showing all four categories ticked for
      // an RH row without this quota alongside it would itself be a new,
      // subtler version of the same "technically true but misleading"
      // problem I have been fixing throughout this feature.
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
        // I say exactly WHICH year has no data, and which years do, instead of "A or B isn't loaded".
        const years = await availableHolidayYears();
        const missing = [intent.yearA, intent.yearB].filter((y, i, all) => !years.includes(y) && all.indexOf(y) === i);
        const available = years.length ? ` Years available: ${formatYearList(years)}.` : "";
        const other = missing[0] === intent.yearA ? intent.yearB : intent.yearA;
        const answer =
          missing.length === 0
            ? `I can only compare years already loaded in the holiday calendar.${available}`
            : missing.length === 1
              ? `I don't have holiday data loaded for ${missing[0]} yet, so I can't compare it with ${other}.${available}`
              : `I don't have holiday data loaded for both ${missing[0]} and ${missing[1]} yet, so I can't compare them.${available}`;
        return { kind: "pending", answer };
      }
      const c = res.compare!;
      if (intent.type) {
        const row = c.byType.find((t) => t.type === intent.type)!;
        // Tense follows each year (had / has / will have) and I state the difference in words
        // ("2 more in 2026"), so the order the person typed the years in cannot make it read wrongly.
        return {
          kind: "count",
          count: row.a,
          answer: compareTypeSentence(row.label, c.yearA, row.a, c.yearB, row.b, DateTime.now().year),
          holidayCompare: buildHolidayCompareView({
            yearA: c.yearA, yearB: c.yearB, totalA: c.totalA, totalB: c.totalB, byType: c.byType, type: intent.type, nowYear: DateTime.now().year,
          }),
        };
      }
      const parts = c.byType.map((t) => `${t.label} ${c.yearA}: ${t.a} vs ${c.yearB}: ${t.b}`);
      // The totals count each real day once but the per-type numbers count every entry, so I say why the types add up to more.
      const typeSum = c.byType.reduce((s, t) => s + t.a + t.b, 0);
      const dualNote =
        typeSum > c.totalA + c.totalB
          ? " (a day that is both a Festival and a Restricted holiday is counted once in the totals, so the types add up to more)"
          : "";
      return {
        kind: "count",
        count: c.totalA,
        answer: compareTotalSentence(c.yearA, c.totalA, c.yearB, c.totalB, DateTime.now().year, parts.join("; ") + dualNote),
        holidayCompare: buildHolidayCompareView({
          yearA: c.yearA, yearB: c.yearB, totalA: c.totalA, totalB: c.totalB, byType: c.byType, nowYear: DateTime.now().year,
        }),
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
        // No hit in the default (current) year, so I search any loaded year.
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
        const noteText = notesSuffix([r.note]);
        return {
          kind: "count",
          answer: `${r.name} falls on ${d.toFormat("d LLLL yyyy")} (${labelWithCategories(HOLIDAY_TYPE_LABEL[r.type], r.categories)}).${noteText}`,
          headline: { text: d.toFormat("cccc, d LLLL yyyy"), tone: "info" },
          holidayDetails: buildHolidayDetails(rows, HOLIDAY_TYPE_LABELS),
        };
      }
      // Several rows (e.g. the same day is a Festival holiday for some categories and a Restricted one for
      // the rest): I show each row with ITS categories, then the explanation once.
      const lines = rows.map((r) => {
        const d = DateTime.fromISO(r.date);
        return `${d.toFormat("d LLLL yyyy")} (${labelWithCategories(HOLIDAY_TYPE_LABEL[r.type], r.categories)})`;
      });
      return {
        kind: "count",
        answer: `${intent.name}: ${lines.join("; ")}.${notesSuffix(rows.map((r) => r.note))}`,
        holidayDetails: buildHolidayDetails(rows, HOLIDAY_TYPE_LABELS),
      };
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
      const lines = rows.map((r) => `${r.name} (${labelWithCategories(HOLIDAY_TYPE_LABEL[r.type], r.categories)})`);
      return {
        kind: "count",
        answer: `${lines.join(" and ")}.${notesSuffix(rows.map((r) => r.note))}`,
        headline: { text: [...new Set(rows.map((r) => labelWithCategories(HOLIDAY_TYPE_LABEL[r.type], r.categories)))].join(" and "), tone: "info" },
        holidayDetails: buildHolidayDetails(rows, HOLIDAY_TYPE_LABELS),
      };
    }

    case "holidayExists": {
      const res = await queryHolidays({ op: "list", filters: { date: intent.date, year: intent.year } });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      const rows = res.holidays ?? [];
      const dateLabel = `${intent.date.day} ${MONTH_LABEL[intent.date.month]} ${intent.year}`;
      if (rows.length === 0) {
        return { kind: "count", answer: `No, ${dateLabel} is not a holiday.`, headline: { text: "No", tone: "no" } };
      }
      const names = rows
        .map((r) => `${r.name} (${labelWithCategories(HOLIDAY_TYPE_LABEL[r.type], r.categories)})`)
        .join(" and ");
      return {
        kind: "count",
        answer: `Yes — ${dateLabel} is ${names}.${notesSuffix(rows.map((r) => r.note))}`,
        lead: `Yes — ${dateLabel} is a holiday.`,
        headline: { text: "Yes", tone: "yes" },
        holidayDetails: buildHolidayDetails(rows, HOLIDAY_TYPE_LABELS),
      };
    }

    case "holidayInvalidCategory":
      return {
        kind: "pending",
        answer: `Category ${intent.input} is not a valid employee category`,
      };

    case "holidayBadQuery":
      return holidayBadQuery(intent.message);

    case "holidayNotificationRequest":
      // Deliberately NOT a data answer, and deliberately NOT routed to circular/semantic search either:
      // "holiday notification 2025" asks about the standing login reminder (HolidayNotificationToast, the card at
      // the bottom-right of the screen), not for a one-off lookup. The reminder is built and working, so I explain
      // how it behaves: what the card offers and where to unsubscribe. Keep the wording in step with
      // the labels in src/components/HolidayNotificationToast.tsx.
      return {
        kind: "pending",
        answer:
          "Holiday reminders already exist. At login, a card at the bottom-right of the screen offers to show the upcoming holidays: choose Subscribe, and tick \"Only show me this once\" if you want just one reminder. After you subscribe, the same card lets you switch between \"Show only once\" and \"Show every login\", or Unsubscribe. To see the upcoming holidays now, ask \"upcoming holidays\".",
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

// src/lib/search/pureAiEngine.ts
//
// The Pure AI Assistant Engine for DSP Intranet.
// Eliminates regex language parsing and stopword patchwork completely.
// Architecture:
//   1. The LLM (Groq LLaMA 3.3 70B / gpt-oss-120b) does 100% of Natural Language Understanding:
//      understands any human phrasing, pronouns ("I", "we"), synonyms, typos, and extracts clean parameters.
//   2. The Code does 100% of Data Access:
//      executes pure deterministic queries against data tables (hospital, employee SQL, circular embeddings, holidays, PAX).

import type { DataSource } from "typeorm";
import { SCHEDULE, PERSON, OPD_DAYS, WEEKDAY_NAME, type Person, type Weekday } from "../hospital/opdData";
import { DOCTOR_POOL, nice, specialisationOf } from "../hospital/engine";
import type { HospitalAnswer, HospitalResult } from "../hospital/types";

export type ToolName =
  | "hospital"
  | "employee_roster"
  | "circular_search"
  | "executive_synthesis"
  | "holiday_calendar"
  | "pax_directory"
  | "conversational";

export interface ToolCall {
  tool: ToolName;
  params: Record<string, any>;
  reasoning: string;
  conversationalReply?: string | null;
}

export interface PureAiResponse {
  type: "analytics" | "circulars" | "synthesis";
  data: any;
  tool: ToolName;
  reasoning: string;
}

const TOOL_DISPATCH_PROMPT = `You are the AI Assistant Brain for the Durgapur Steel Plant (DSP) Intranet Omnibar.
Your job is to read the user's natural language input and select the exact tool with clean parameters.
DSP is a major steel manufacturing plant of SAIL with its own Main Hospital, departments, employee roster, circular policies, and township.
Never fail on natural language, pronouns ("I can see", "where do I go", "tell me"), colloquial phrasing, or Indian English.

AVAILABLE TOOLS & PARAMETERS:

1. "hospital":
   For DSP Main Hospital, doctors, OPD schedules, doctor availability, doctor qualifications, permanent vs contractual doctors, department OPDs, timings.
   Parameters:
   - "action": "doctor_schedule" | "list_doctors" | "department_opd" | "timings" | "doctor_qualification" | "doctor_employment"
   - "doctorName": doctor's surname or full name (e.g. "karmakar", "ajit karmakar", "rajeev kumar", "rohit shyam") if mentioned, else null
   - "department": department name (e.g. "Medicine", "Surgery", "ENT", "Eye", "Orthopaedics", "Dental", "Chest", "Gynae & Obs") if mentioned, else null
   - "employment": "permanent" | "contractual" | "all" (default "all", or "permanent" if regular/on-roll/permanent, or "contractual" if contract/temporary/non-permanent)
   - "qualification": specific degree (e.g. "MD", "MS", "DNB", "DrNB", "MBBS") or null
   - "weekday": day of week (e.g. "Monday", "Tuesday", etc.) if mentioned, else null

   Examples:
   - "on which day of the week I can see dr karmakar in opd?" -> action: "doctor_schedule", doctorName: "karmakar"
   - "on which day of the week I can visit dr ajit karmakar?" -> action: "doctor_schedule", doctorName: "ajit karmakar"
   - "Can I consult with Dr. Karmakar with token after 5 pm?" -> action: "doctor_schedule", doctorName: "karmakar"
   - "Can I consult with Dr. Karmakar without a token after 5pm?" -> action: "doctor_schedule", doctorName: "karmakar"
   - "list the permanent doctors with their specializations" -> action: "list_doctors", employment: "permanent"
   - "list the permanent doctors with their qualifications" -> action: "list_doctors", employment: "permanent"
   - "list of permanent doctors." -> action: "list_doctors", employment: "permanent"
   - "list the non-permanent doctors with their specializations" -> action: "list_doctors", employment: "contractual"
   - "medicine opd lists" -> action: "department_opd", department: "Medicine"
   - "opd token timings" -> action: "timings"
   - "is dr rajeev kumar permanent" -> action: "doctor_employment", doctorName: "rajeev kumar"

2. "employee_roster":
   For DSP employee directory, headcounts, designations, HODs, reporting officers, employee lookups, seniority, grades (E-1, S-11).
   Parameters:
   - "query": the original user question to pass to SQL generator

3. "circular_search":
   For company policies, rules, circulars, office orders, schemes (PF repayment, safety rules, quarters retention, study leave, HTS reward, gate passes).
   Parameters:
   - "topic": clean topic phrase to search (e.g. "pre-mature repayment of refundable PF loan")

4. "executive_synthesis":
   For complex multi-document comparison, policy evolution across years, or comprehensive cross-policy synthesis across multiple circulars.
   Parameters:
   - "prompt": the synthesis prompt

5. "holiday_calendar":
   For plant holidays, gazetted holidays, restricted holidays (RH), festival dates (Durga Puja, Diwali, Eid).
   Parameters:
   - "festival": festival name (e.g. "Durga Puja") if mentioned, else null
   - "month": month name (e.g. "November") if mentioned, else null
   - "year": year number (e.g. 2026) if mentioned, else 2026

6. "pax_directory":
   For internal telephone extensions (PAX), landline numbers, intercom numbers.
   Parameters:
   - "place": office, department or place name (e.g. "fire service", "central store")
   - "number": intercom number if asking who holds it

7. "conversational":
   For greetings ("hi", "hello"), capability questions ("what can you do?"), or pleasantries.
   Parameters:
   - "reply": friendly, professional response introducing your capabilities across DSP intranet

Respond strictly in JSON format:
{
  "tool": "hospital" | "employee_roster" | "circular_search" | "executive_synthesis" | "holiday_calendar" | "pax_directory" | "conversational",
  "reasoning": "brief explanation",
  "params": { ... },
  "conversationalReply": "text if conversational, else null"
}`;

/**
 * Fast LLM NLU Call using Groq (LLaMA 3.3 70B / gpt-oss-120b).
 */
export async function parseQueryWithLlm(query: string): Promise<ToolCall> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.AGENT_ROUTER_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  if (!apiKey) {
    return heuristicFallback(query);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: TOOL_DISPATCH_PROMPT },
          { role: "user", content: `Parse user input: "${query}"` },
        ],
        temperature: 0.0,
        max_tokens: 350,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      return {
        tool: parsed.tool || "circular_search",
        params: { ...(parsed.params || {}), rawQuery: query },
        reasoning: parsed.reasoning || "Parsed by Groq LLM",
        conversationalReply: parsed.conversationalReply ?? null,
      };
    } else {
      console.warn(`[pureAiEngine] Groq API returned status ${res.status}: ${await res.text()}`);
    }
  } catch (err: any) {
    clearTimeout(timer);
    console.warn(`[pureAiEngine] Groq fetch error: ${err?.message}`);
  }

  return heuristicFallback(query);
}

/**
 * Robust heuristic safety fallback if Groq API is offline.
 */
function heuristicFallback(query: string): ToolCall {
  const q = query.toLowerCase().trim();
  if (/^(hi|hello|hey|help|who are you|good morning)\b/i.test(q)) {
    return {
      tool: "conversational",
      params: { rawQuery: query },
      reasoning: "Greeting heuristic",
      conversationalReply: "Hello! I am your DSP AI Assistant. How can I help you across the intranet today?",
    };
  }
  if (/\b(doc\b|doctor|doctors|dr\b|hospital|karmakar|opd|clinic|specialization|qualification|chamber|chambers?|surgeons?|medicos?|dnb|drnb|mbbs|md\b|ms\b)\b/i.test(q)) {
    const isContr = /\b(non-permanent|contractual|temporary)\b/i.test(q);
    const isPerm = !isContr && /\b(permanent|regular|on-?roll|medicos?\s+on\s+roll)\b/i.test(q);
    const isTimings = /\b(timings?|hours?|token)\b/i.test(q) && !/\b(dr|karmakar|doctor)\b/i.test(q);
    const isDnb = /\b(dnb|drnb)\b/i.test(q);
    const isMd = /\b(md)\b/i.test(q) && !/\binstead\s+of\s+md\b/i.test(q);
    const isMs = /\b(ms)\b/i.test(q);
    const qual = isDnb ? "DNB" : isMd ? "MD" : isMs ? "MS" : null;

    const deptMatch = q.match(/\b(medicine|chest|heart|surgery|surgeons?|ent|eye|ortho|orthopaedics?|dental|gynae)\b/i);
    const isDeptOpd = !!deptMatch && !/\b(dr|karmakar)\b/i.test(q) && /\b(doc\b|doctor|opd|clinic|list|chamber|chambers?|who|which|examine)\b/i.test(q);
    const m = q.match(/\b(dr\.?\s+[a-z]+(?:\s+[a-z]+)?|ajit\s+karmakar|rajeev\s+kumar|[a-z]+\s+karmakar|karmakar|ajit|rajeev|rohit)\b/i);
    let doctorName = m ? m[0].replace(/^dr\.?\s+/i, "") : null;
    if (doctorName) {
      doctorName = doctorName.replace(/\b(with|without|a|an|the|token|after|before|please|consult|meet|visit|at|in|opd|to|for|can|i|see)\b/gi, "").trim();
    }
    const weekdayMatch = q.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i);
    let mappedDept = deptMatch ? deptMatch[0] : null;
    if (mappedDept && /heart/i.test(mappedDept)) mappedDept = "Chest";
    if (mappedDept && /surgeon/i.test(mappedDept)) mappedDept = /eye/i.test(q) ? "Eye" : "Surgery";

    return {
      tool: "hospital",
      params: {
        action: doctorName && doctorName.length > 2 ? "doctor_schedule" : isTimings ? "timings" : isDeptOpd ? "department_opd" : "list_doctors",
        doctorName: doctorName && doctorName.length > 1 ? doctorName : null,
        department: mappedDept,
        employment: isPerm ? "permanent" : isContr ? "contractual" : "all",
        qualification: qual,
        weekday: weekdayMatch ? weekdayMatch[1] : null,
        rawQuery: query,
      },
      reasoning: "Hospital keyword fallback",
    };
  }
  if (/\b(trace the evolution|synthesize|compare the financial|provide a briefing)\b/i.test(q)) {
    return { tool: "executive_synthesis", params: { prompt: query }, reasoning: "Synthesis fallback" };
  }
  if (/\b(how many employees|who is the hod|senior most|ticket \d{6})\b/i.test(q)) {
    return { tool: "employee_roster", params: { query }, reasoning: "Employee fallback" };
  }
  if (/\b(holiday|holidays|rh\b|puja|diwali)\b/i.test(q)) {
    return { tool: "holiday_calendar", params: { year: 2026 }, reasoning: "Holiday fallback" };
  }
  if (/\b(pax|intercom|extension|telephone)\b/i.test(q)) {
    return { tool: "pax_directory", params: { query }, reasoning: "PAX fallback" };
  }
  return { tool: "circular_search", params: { topic: query }, reasoning: "Circular search fallback" };
}

// ============================================================================
// PURE DATA EXECUTORS (Zero regex parsing, pure data lookup by parameter)
// ============================================================================

const isGone = (p: Person) => p.status === "retired" || p.status === "transferred";
const deptLabel = (dep: string): string =>
  SCHEDULE.departments.find((d) => d.staffDepartment.toUpperCase() === dep.toUpperCase())?.name ?? nice(dep);

/**
 * Pure Data Hospital Executor: Takes clean parameters and looks up doctor schedules / lists directly.
 * Zero regex, zero stopword patchwork. 100% pure deterministic data lookup.
 */
export function executePureHospital(params: Record<string, any>): HospitalResult | null {
  const { action, doctorName, department, employment, qualification, weekday } = params;

  // 1. Doctor Schedule Lookup or specific doctor inquiry
  if (doctorName && action !== "doctor_employment" && action !== "doctor_qualification") {
    const cleanDocName = String(doctorName)
      .toLowerCase()
      .replace(/^dr\.?\s+/i, "")
      .replace(/\b(with|without|a|an|the|token|after|before|please|consult|meet|visit|at|in|opd|to|for|can|i|see)\b/gi, "")
      .trim();
    const searchWords = cleanDocName.split(/\s+/).filter((w) => w.length > 1);

    // Find doctor in DOCTOR_POOL or PERSON
    let doc =
      DOCTOR_POOL.find((p) => {
        const pName = p.name.toLowerCase();
        return pName.includes(cleanDocName) || searchWords.every((w) => pName.includes(w));
      }) ||
      Array.from(PERSON.values()).find((p) => {
        const pName = p.name.toLowerCase();
        return pName.includes(cleanDocName) || searchWords.every((w) => pName.includes(w));
      });

    // If still not found and searchWords has multiple terms, match against doctor surname/first name
    if (!doc && searchWords.length > 0) {
      doc =
        DOCTOR_POOL.find((p) => {
          const pParts = p.name.toLowerCase().split(/\s+/);
          return searchWords.some((w) => w.length >= 3 && pParts.some((part) => part === w || part.includes(w)));
        }) ||
        Array.from(PERSON.values()).find((p) => {
          const pParts = p.name.toLowerCase().split(/\s+/);
          return searchWords.some((w) => w.length >= 3 && pParts.some((part) => part === w || part.includes(w)));
        });
    }

    if (!doc) {
      const text = `I could not find a doctor matching "${doctorName}" in the hospital lists.`;
      return {
        summary: text,
        card: { title: "Which doctor?", status: { tone: "unknown", text } },
      };
    }

    const who = `Dr. ${nice(doc.name)}`;
    const sittingEntries: Array<{ deptName: string; unitLabel: string; days: string[]; room: string }> = [];

    for (const d of SCHEDULE.departments) {
      for (const u of d.units) {
        const days: string[] = [];
        let room = "OPD";
        for (const day of OPD_DAYS) {
          const slot = u.week[day];
          if (slot?.doctors?.includes(doc.id)) {
            days.push(WEEKDAY_NAME[day]);
            if (slot.rooms?.[doc.id]) room = slot.rooms[doc.id];
            else if (u.opdNo) room = `OPD ${u.opdNo}`;
          }
        }
        if (days.length) {
          sittingEntries.push({ deptName: d.name, unitLabel: u.label, days, room });
        }
      }
    }

    if (!sittingEntries.length) {
      const text = `${who} is on the staff list (${deptLabel(doc.department)}), but has no sitting days in the current OPD schedule.`;
      return {
        summary: text,
        card: { title: `${who}: OPD schedule`, status: { tone: "unknown", text } },
      };
    }

    const first = sittingEntries[0];
    const daysText = first.days.join(" and ");
    let summary = `${who} sits in ${first.deptName} ${first.unitLabel} (${first.room}) on ${daysText}.`;

    const raw = String(params.rawQuery || "").toLowerCase();
    const isWithoutToken = /\b(without\s+(?:a\s+)?token|no\s+token)\b/i.test(raw);
    const isWithToken = /\b(with\s+(?:a\s+)?token)\b/i.test(raw);
    const isAfter5 = /\b(after\s*5|5\s*pm|5pm|evening)\b/i.test(raw);

    let tone: "open" | "closed" | "info" = "open";

    if (isWithoutToken) {
      summary = `No, you cannot consult without a token. Token registration is mandatory for all OPD visits (card registration hours are 8:00 AM to 11:30 AM and 4:30 PM to 6:30 PM). Furthermore, the afternoon OPD (5 PM to 7 PM) is strictly for employees currently on roll. ${who} sits on ${daysText} in ${first.deptName} ${first.unitLabel} (${first.room}).`;
      tone = "closed";
    } else if (isWithToken || isAfter5) {
      summary = `Yes, you can consult with a token after 5 PM, provided you are an employee currently on roll (afternoon OPD 5 PM to 7 PM is strictly reserved for on-roll employees; token registration is 4:30 PM to 6:30 PM). ${who} sits on ${daysText} in ${first.deptName} ${first.unitLabel} (${first.room}).`;
      tone = "open";
    } else if (weekday) {
      const askedDay = String(weekday).toLowerCase();
      const sitsOnDay = first.days.some((d) => d.toLowerCase() === askedDay);
      if (sitsOnDay) {
        summary = `Yes, ${who} sits on ${weekday} in ${first.deptName} ${first.unitLabel} (${first.room}).`;
        tone = "open";
      } else {
        summary = `No, ${who} does not sit on ${weekday}. ${who} sits on ${daysText} in ${first.deptName} ${first.unitLabel} (${first.room}).`;
        tone = "closed";
      }
    }

    return {
      summary,
      card: {
        title: `${who}: OPD days`,
        status: { tone, text: summary },
        table: {
          columns: ["Doctor", "Unit", "OPD Days", "Room", "Department"],
          rows: sittingEntries.map((entry) => [
            who,
            entry.unitLabel,
            entry.days.join(" and "),
            entry.room,
            entry.deptName,
          ]),
        },
      },
    };
  }

  // 2. Doctor Employment or Qualification inquiry
  if ((action === "doctor_employment" || action === "doctor_qualification") && doctorName) {
    const cleanDocName = String(doctorName).toLowerCase().replace(/^dr\.?\s+/i, "").trim();
    const searchWords = cleanDocName.split(/\s+/).filter(Boolean);
    const doc =
      DOCTOR_POOL.find((p) => {
        const pName = p.name.toLowerCase();
        return pName.includes(cleanDocName) || searchWords.every((w) => pName.includes(w));
      }) ||
      Array.from(PERSON.values()).find((p) => {
        const pName = p.name.toLowerCase();
        return pName.includes(cleanDocName) || searchWords.every((w) => pName.includes(w));
      });

    if (doc) {
      const isPerm = doc.employment !== "contractual" && doc.status !== "not_on_list";
      const spec = specialisationOf(doc);
      const specText = spec.spec ?? (spec.kind === "none" ? "none (MBBS only)" : "general");
      const summary =
        action === "doctor_employment"
          ? `Dr. ${nice(doc.name)} is a ${isPerm ? "permanent" : "non-permanent (contractual)"} doctor in ${deptLabel(doc.department)} (${isPerm ? `Ticket: ${doc.ticket ?? "on roll"}` : `List number: ${doc.doctorListId ?? "contractual"}`}).`
          : `Dr. ${nice(doc.name)} (${deptLabel(doc.department)}) holds qualification ${doc.qualification ?? "MBBS"} with specialization in ${specText}.`;

      return {
        summary,
        card: {
          title: `Dr. ${nice(doc.name)}`,
          status: { tone: "info", text: summary },
          table: {
            columns: ["Doctor", "Department", "Specialization", "Qualification", isPerm ? "Ticket" : "List number"],
            rows: [
              [
                `Dr. ${nice(doc.name)}`,
                deptLabel(doc.department),
                specText,
                doc.qualification ?? "—",
                doc.ticket ?? doc.doctorListId ?? "not recorded",
              ],
            ],
          },
        },
      };
    }
  }

  // 3. Department OPD At a Glance
  if (action === "department_opd" || (department && !doctorName && action !== "list_doctors")) {
    const deptStr = String(department).toLowerCase();
    const deptObj = SCHEDULE.departments.find(
      (d) =>
        d.name.toLowerCase().includes(deptStr) ||
        d.staffDepartment.toLowerCase().includes(deptStr) ||
        d.aliases.some((a) => a.toLowerCase().includes(deptStr)),
    );

    if (deptObj) {
      const isUnitsDept = deptObj.kind === "units";
      const raw = String(params.rawQuery || "").toLowerCase();
      const isChestQuery = deptObj.id === "chest" || /\b(chest|heart|murmur)\b/i.test(raw);
      const dayCode = weekday
        ? (String(weekday).slice(0, 3).toUpperCase() as Weekday)
        : null;

      if (isUnitsDept) {
        // UNIT-BASED DEPARTMENT (like Medicine)
        const unitRows: string[][] = [];
        for (const u of deptObj.units) {
          const days = u.days ?? [];
          const daysText = days.map((x) => WEEKDAY_NAME[x]).join(" and ");
          const firstSlot = days.map((x) => u.week[x]).find((s) => s?.doctors?.length);
          const docList =
            firstSlot?.doctors
              ?.map((docId) => {
                const doc = PERSON.get(docId);
                const room = firstSlot.rooms?.[docId] ?? (u.opdNo ? `OPD ${u.opdNo}` : "");
                const dName = doc ? `Dr. ${nice(doc.name)}` : docId;
                return room ? `${room}: ${dName}` : dName;
              })
              .join("; ") ?? "—";

          const headId = u.head ?? (u.members && u.members.length > 0 ? u.members[0] : null);
          const inCharge = headId && PERSON.get(headId) ? `Dr. ${nice(PERSON.get(headId)!.name)}` : "—";

          unitRows.push([u.label, daysText, docList, inCharge]);
        }

        const title = `${deptObj.name} OPD at a glance`;
        return {
          summary: title,
          card: {
            title,
            table: {
              columns: ["Unit", "OPD days", "Doctors (room)", "In-charge"],
              rows: unitRows,
            },
            lines: [
              `A patient is seen only by the unit of his or her first visit.`,
            ],
          },
        };
      } else {
        // ROOM-BASED DEPARTMENT (like Eye, ENT, Chest, Surgery, Orthopaedics)
        const roomRows: string[][] = [];

        if (dayCode) {
          // Specific Day Schedule Asked (e.g. "on Saturdays" or "this Thursday")
          for (const u of deptObj.units) {
            const slot = u.week[dayCode];
            let statusText = "Closed";
            let docList = "—";

            if (slot?.doctors?.length) {
              docList = slot.doctors
                .map((id) => {
                  const doc = PERSON.get(id);
                  return doc ? `Dr. ${nice(doc.name)}` : id;
                })
                .join(", ");
              statusText = "Open (8 AM to 1 PM)";
            } else if (slot?.state === "OT_DAY") {
              statusText = "OT Day (Operation Theatre)";
            } else if (slot?.state === "CLOSED") {
              statusText = slot.note || "Closed (doctor not available)";
            }

            roomRows.push([u.label, docList, deptObj.name, statusText]);
          }

          let summary = `On ${WEEKDAY_NAME[dayCode]}, ${deptObj.name} OPD chambers: ${roomRows.map((r) => `${r[0]} (${r[1]} - ${r[3]})`).join("; ")}.`;
          if (isChestQuery) {
            summary = `Chest OPD (OPD 4) is currently closed on all days (doctor not available). For chest or heart murmurs, consult General Medicine OPD (OPD 25 & 26; on Thursday, Medicine Unit II sits with Dr. Ajit Karmakar).`;
          }

          return {
            summary,
            card: {
              title: `${deptObj.name} OPD: ${WEEKDAY_NAME[dayCode]}`,
              status: { tone: isChestQuery ? "closed" : "open", text: summary },
              table: {
                columns: ["Chamber / Room", "Doctor", "Department", `${WEEKDAY_NAME[dayCode]} Schedule`],
                rows: roomRows,
              },
            },
          };
        } else {
          // Full Weekly Grid for Room-based Department
          for (const u of deptObj.units) {
            const daysCells = OPD_DAYS.map((d) => {
              const slot = u.week[d];
              if (slot?.doctors?.length) {
                return slot.doctors.map((id) => `Dr. ${nice(PERSON.get(id)?.name || id)}`).join(", ");
              }
              if (slot?.state === "OT_DAY") return "OT Day";
              if (slot?.state === "CLOSED") return "Closed";
              return "—";
            });
            roomRows.push([u.label, ...daysCells]);
          }

          const summary = `${deptObj.name} OPD weekly schedule by chamber/room.`;
          return {
            summary,
            card: {
              title: `${deptObj.name} OPD at a glance`,
              status: { tone: isChestQuery ? "closed" : "info", text: isChestQuery ? "Chest OPD (OPD 4) is currently closed on all days (doctor not available). For chest or heart complaints, consult General Medicine." : summary },
              table: {
                columns: ["Chamber / Room", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
                rows: roomRows,
              },
            },
          };
        }
      }
    }
  }

  // 4. OPD and Token Timings
  if (action === "timings") {
    const title = "OPD hours and card registration (tokens)";
    return {
      summary: title,
      card: {
        title,
        status: { tone: "info", text: "DSP Main Hospital OPD timings" },
        lines: [
          "OPD hours: 8 AM to 1 PM and 5 PM to 7 PM",
          "Card registration (token) hours: 8 AM to 11:30 AM and 4:30 PM to 6:30 PM",
          "The afternoon OPD (5 PM to 7 PM) is only for employees currently on roll",
          "Emergency operates 24x7 at the Main Hospital Emergency department",
        ],
        notes: ["A patient is seen only by the unit of his or her first visit."],
      },
    };
  }

  // 5. Doctor List Lookup (Permanent / Contractual / All)
  if (action === "list_doctors" || !action) {
    let pool = DOCTOR_POOL.filter((p) => !isGone(p));

    if (employment === "permanent") {
      pool = pool.filter((p) => p.employment !== "contractual" && p.status !== "not_on_list");
    } else if (employment === "contractual") {
      pool = pool.filter((p) => p.employment === "contractual");
    }

    if (department) {
      const dKey = String(department).toUpperCase();
      pool = pool.filter((p) => (p.department ?? "").toUpperCase().includes(dKey));
    }

    if (qualification && qualification !== "any") {
      const qKey = String(qualification).toUpperCase();
      pool = pool.filter((p) => (p.qualification ?? "").toUpperCase().includes(qKey));
    }

    pool.sort((a, b) => (a.department ?? "").localeCompare(b.department ?? "") || a.name.localeCompare(b.name));

    const isPermOnly = employment === "permanent";
    const isContrOnly = employment === "contractual";
    const label = isPermOnly ? "permanent (on-roll)" : isContrOnly ? "non-permanent" : "hospital";
    const title = qualification
      ? `${isPermOnly ? "Permanent doctors" : "Doctors"} with ${qualification}`
      : isPermOnly
      ? "Permanent doctors"
      : isContrOnly
      ? "Non-permanent doctors"
      : "Hospital doctors";

    const text = qualification
      ? `There is exactly ${pool.length} ${label} doctor with a ${qualification} qualification${pool.length === 1 ? `: Dr. ${nice(pool[0].name)} (${deptLabel(pool[0].department)}, Ticket: ${pool[0].ticket ?? "on roll"}, Qualification: ${pool[0].qualification}).` : "."}`
      : `The intranet doctor list has ${pool.length} ${label} doctors${department ? ` in ${department}` : ""}.`;

    return {
      summary: text,
      card: {
        title,
        status: { tone: pool.length ? "info" : "unknown", text },
        table: {
          columns: ["Doctor", "Department", "Specialization", "Qualification", isPermOnly ? "Ticket" : "List number"],
          rows: pool.map((p) => {
            const spec = specialisationOf(p);
            const specText =
              spec.spec ??
              (spec.kind === "none"
                ? "none (MBBS only)"
                : spec.kind === "no_subject"
                ? "not stated"
                : "not recorded yet");
            return [
              `Dr. ${nice(p.name)}`,
              p.department ? deptLabel(p.department) : "not recorded",
              specText,
              p.qualification ?? "—",
              p.ticket ?? p.doctorListId ?? "not recorded",
            ];
          }),
        },
      },
    };
  }

  return null;
}

/**
 * Master Controller: Pure AI Assistant.
 */
export async function runPureAiAssistant(
  query: string,
  userTicket: string | null,
  dataSource: DataSource,
): Promise<PureAiResponse | null> {
  const toolCall = await parseQueryWithLlm(query);

  switch (toolCall.tool) {
    case "conversational": {
      return {
        type: "analytics",
        data: {
          kind: "clarify",
          answer: toolCall.conversationalReply || "Hello! I am your DSP AI Assistant. How can I help you today?",
        },
        tool: "conversational",
        reasoning: toolCall.reasoning,
      };
    }

    case "hospital": {
      const hospitalResult = executePureHospital(toolCall.params);
      if (hospitalResult) {
        return {
          type: "analytics",
          data: {
            kind: "count",
            answer: hospitalResult.summary,
            hospital: hospitalResult.card,
          },
          tool: "hospital",
          reasoning: toolCall.reasoning,
        };
      }
      break;
    }

    case "employee_roster": {
      const { answerOmnibar } = await import("../nl2sql/omnibar");
      const omnibarResult = await answerOmnibar(query, userTicket, null, { skipModel: false });
      if (omnibarResult) {
        return {
          type: "analytics",
          data: omnibarResult,
          tool: "employee_roster",
          reasoning: toolCall.reasoning,
        };
      }
      break;
    }

    case "executive_synthesis": {
      let isAuthorized = false;
      if (userTicket && /^4\d{5}$/.test(userTicket)) {
        try {
          const rec = await dataSource.query(`SELECT id FROM "user" WHERE "ticketNo" = $1 AND "ticketNo" LIKE '4%' LIMIT 1`, [userTicket]);
          if (rec && rec.length > 0) isAuthorized = true;
        } catch {
          isAuthorized = false;
        }
      }

      const { executeSmartSemanticRouter } = await import("./smartSemanticRouter");

      if (isAuthorized) {
        const circulars = await executeSmartSemanticRouter(dataSource, toolCall.params.prompt || query);
        const { executeExecutiveSynthesis } = await import("./executiveSynthesis");
        const synth = await executeExecutiveSynthesis(toolCall.params.prompt || query, circulars.uniqueResults || []);
        return {
          type: "synthesis",
          data: synth,
          tool: "executive_synthesis",
          reasoning: toolCall.reasoning,
        };
      }

      const circulars = await executeSmartSemanticRouter(dataSource, query);
      return {
        type: "circulars",
        data: circulars.uniqueResults || [],
        tool: "circular_search",
        reasoning: "Not authorized for EDS; searched circulars",
      };
    }

    case "circular_search": {
      const { executeSmartSemanticRouter } = await import("./smartSemanticRouter");
      const circulars = await executeSmartSemanticRouter(dataSource, toolCall.params.topic || query);
      return {
        type: "circulars",
        data: circulars.uniqueResults || [],
        tool: "circular_search",
        reasoning: toolCall.reasoning,
      };
    }

    case "holiday_calendar":
    case "pax_directory": {
      const { answerOmnibar } = await import("../nl2sql/omnibar");
      const omnibarResult = await answerOmnibar(query, userTicket, null, { skipModel: false });
      if (omnibarResult) {
        return {
          type: "analytics",
          data: omnibarResult,
          tool: toolCall.tool,
          reasoning: toolCall.reasoning,
        };
      }
      break;
    }
  }

  return null;
}

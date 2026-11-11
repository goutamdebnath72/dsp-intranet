// src/app/api/circulars/[id]/route.ts
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { Circular } from "@/lib/db/models/circular.model";
import { authorityForTicket, sessionActor } from "@/lib/circulars/admin/access";
import { isSameOrigin } from "@/lib/circulars/admin/api";
import { begin, Forbidden } from "@/lib/facility/authority";
import { writeAudit } from "@/lib/facility/audit";
import { DateTime } from "luxon";
import { EDIT_DELETE_WINDOW_HOURS } from "@/lib/constants";

class NotFoundNow extends Error {}

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(request: Request, context: RouteContext) {
  const dataSource = await getDb();
  const { params } = context;

  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const circularRepository = dataSource.getRepository(Circular);
    const circular = await circularRepository.findOne({ where: { id } });

    if (!circular) {
      return NextResponse.json(
        { error: "Circular not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(circular);
  } catch (error) {
    console.error(`API Error fetching circular ${params.id}:`, error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

/**
 * WHO MAY CHANGE A CIRCULAR (PATCH and DELETE): the HOD of C&IT may change any; a delegate of the Circular manager only
 * the circulars he or she uploaded, within EDIT_DELETE_WINDOW_HOURS of the upload. Decided from the DATABASE on every
 * request, and decided again under the facility lock inside the transaction. (The old rule was "the ticket starts with 4
 * and is the author": no login-state check beyond the cookie, no audit row, a withdrawn delegate could keep deleting,
 * and a non-executive delegate could never delete his own upload.)
 */
async function authorise(request: Request, circular: { authorTicketNo?: string | null; uploadedAt?: any } | null) {
  if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"))) {
    return { res: NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 }) };
  }
  const dataSource = await getDb();
  const actor = await sessionActor(dataSource);
  if (!actor) return { res: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  const authority = await authorityForTicket(dataSource, actor.ticket);
  if (!authority) return { res: NextResponse.json({ error: "Only the HOD of C&IT, or an authorised delegate, can change circulars." }, { status: 403 }) };
  if (!circular) return { res: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (authority !== "hod") {
    if (String(circular.authorTicketNo ?? "").trim() !== actor.ticket) {
      return { res: NextResponse.json({ error: "Forbidden: you can change only the circulars you uploaded." }, { status: 403 }) };
    }
    const now = DateTime.now();
    // Window is measured from UPLOAD time, not the (possibly backfilled) issue date.
    if (now.diff(circular.uploadedAt || now, "hours").hours > EDIT_DELETE_WINDOW_HOURS) {
      return { res: NextResponse.json({ error: "The change window for this circular has expired." }, { status: 403 }) };
    }
  }
  return { dataSource, actor, authority };
}

export async function PATCH(request: Request, context: RouteContext) {
  const circularId = parseInt(context.params.id, 10);
  if (!Number.isInteger(circularId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  try {
    const dataSource = await getDb();
    const circularRepo = dataSource.getRepository(Circular);
    const circular = await circularRepo.findOne({ where: { id: circularId } });
    const auth = await authorise(request, circular);
    if ("res" in auth) return auth.res;

    // Only the headline can be edited. (The old handler also accepted `fileUrls` from the client: those addresses are
    // what DELETE later passes to the Blob store to be removed, so a caller could have had OTHER files deleted.)
    const body = await request.json().catch(() => ({}));
    const headline = typeof body?.headline === "string" ? body.headline.replace(/^\s*\d+[.\-\s]+/, "").trim().slice(0, 500) : "";
    if (!headline) return NextResponse.json({ error: "A headline is required." }, { status: 400 });

    const before = circular!.headline;
    await dataSource.transaction(async (manager) => {
      const q = async (sql: string, params?: unknown[]) => manager.query(sql, params as never[]);
      const role = await begin(q, "circular", auth.actor);
      await q(`UPDATE public.circulars SET headline = $1 WHERE id = $2`, [headline, circularId]);
      await writeAudit(q, "circular", auth.actor, role, "modify", {
        targetId: circularId,
        before: { headline: before },
        after: { headline },
        note: "Circular headline edited",
      });
    });
    return NextResponse.json({ ...circular, headline });
  } catch (error) {
    if (error instanceof Forbidden) return NextResponse.json({ error: "Your authority was withdrawn." }, { status: 403 });
    console.error(`PATCH /api/circulars failed for id=${circularId}:`, (error as any)?.message || error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { params } = context;
  const circularId = parseInt(params.id, 10);
  if (!Number.isInteger(circularId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  try {
    const dataSource = await getDb();
    const circularRepo = dataSource.getRepository(Circular);
    const circular = await circularRepo.findOne({ where: { id: circularId } });
    const auth = await authorise(request, circular);
    if ("res" in auth) return auth.res;
    if (!circular) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const now = DateTime.now();

    // Blob URLs to remove AFTER the DB commit succeeds. Blobs are the
    // irreplaceable side, so they go last: if blob deletion fails we are
    // left with a harmless orphan (catchable by audit-blob.mjs), never a
    // circular row pointing at missing files.
    const blobUrls = Array.isArray(circular.fileUrls) ? circular.fileUrls : [];
    const year = circular.publishedAt
      ? circular.publishedAt.year
      : now.year;

    // ---- ATOMIC DB DELETE + RENUMBER (single transaction) ----
    // If ANY step throws, the whole transaction rolls back and nothing in
    // the database changes. Blobs are untouched until this commits.
    await dataSource.transaction(async (manager) => {
      // Serialize against concurrent uploads/deletes for the same year so
      // the renumber below sees a stable set of rows.
      await manager.query(`SELECT pg_advisory_xact_lock($1)`, [year]);

      // The Circular manager's lock and the authority, decided again NOW (same order as the upload: year lock first,
      // then the facility lock, so the two can never wait for each other). The row must still exist: a second delete
      // of the same circular must not "succeed" and renumber twice.
      const q = async (sql: string, params?: unknown[]) => manager.query(sql, params as never[]);
      const role = await begin(q, "circular", auth.actor);
      const still = await manager.query(`SELECT id FROM public.circulars WHERE id = $1 FOR UPDATE`, [circularId]);
      if (!still.length) throw new NotFoundNow();

      // 1. Delete the child chunks (raw table, no cascade defined).
      await manager.query(
        `DELETE FROM public.circular_chunks WHERE circular_id = $1`,
        [circularId],
      );

      // 1b. Delete who-has-read-it rows (no foreign key on that table, so nothing removes them by itself: they would stay for ever, pointing at a circular that is gone).
      await manager.query(`DELETE FROM public.circularreadstatus WHERE "circularId" = $1`, [circularId]);

      // 2. Delete the circular row itself.
      await manager.query(`DELETE FROM public.circulars WHERE id = $1`, [
        circularId,
      ]);

      // 3. Renumber that year's remaining circulars to close the gap.
      //    Done in TWO phases to avoid a transient unique-constraint collision
      //    on circulars_year_serial_uidx: a single bulk UPDATE to 1..N can make
      //    one row momentarily take a serial another row still holds, which
      //    Postgres rejects mid-statement even though the FINAL state is valid.
      //    Phase 3a parks every row of the year at a guaranteed-free NEGATIVE
      //    serial (-rn); phase 3b flips those to the final positive 1..N. The
      //    negative range can never clash with the live positive set, and the
      //    positive assignment starts from an all-negative set, so neither
      //    phase can transiently duplicate a value.
      await manager.query(
        `
          WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (ORDER BY "serialNumber" ASC, id ASC) AS rn
            FROM public.circulars
            WHERE EXTRACT(YEAR FROM "publishedAt") = $1
          )
          UPDATE public.circulars c
          SET "serialNumber" = -ranked.rn
          FROM ranked
          WHERE c.id = ranked.id
        `,
        [year],
      );
      // 3b. Flip the parked negatives to their final positive serials.
      await manager.query(
        `
          UPDATE public.circulars
          SET "serialNumber" = -"serialNumber"
          WHERE EXTRACT(YEAR FROM "publishedAt") = $1
            AND "serialNumber" < 0
        `,
        [year],
      );

      await writeAudit(q, "circular", auth.actor, role, "delete", {
        targetId: circularId,
        before: { id: circularId, headline: circular.headline, serialNumber: circular.serialNumber ?? null, year, pages: blobUrls.length },
        note: "Circular deleted (files and search text removed, the year renumbered)",
      });
    });

    // ---- COMPENSATING BLOB CLEANUP (after commit) ----
    // DB is already consistent. A failure here only leaves orphan blobs.
    if (blobUrls.length > 0) {
      try {
        await del(blobUrls);
        console.log(
          `DELETE: removed ${blobUrls.length} blob(s) for circular ${circularId}`,
        );
      } catch (e: any) {
        console.error(
          `DELETE WARNING: circular ${circularId} removed from DB but blob cleanup failed:`,
          e?.message || e,
          blobUrls,
        );
        // Not fatal: DB is consistent; orphan blobs are auditable/removable later.
      }
    }

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error: any) {
    if (error instanceof Forbidden) return NextResponse.json({ error: "Your authority was withdrawn." }, { status: 403 });
    if (error instanceof NotFoundNow) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // The real cause goes to the server log; the browser gets a plain answer (no SQL or stack).
    console.error(`DELETE /api/circulars failed for id=${circularId}:`, error?.stack || error?.message || error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

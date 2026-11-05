// src/lib/employees/photo/store.ts
//
// THE PHOTO TABLE (public.employee_photo, sql/19): which pictures an employee has and which version is current. Who may change a photo is who may change the employee (the kit's `begin`: HOD or a delegate);
// every change is a line in the employee manager's history ("photo", changed or removed), and never holds the picture.

import { writeAudit } from "@/lib/facility/audit";
import { Forbidden, begin } from "@/lib/facility/authority";
import type { Actor } from "@/lib/facility/types";
import type { EmpDb } from "@/lib/employees/admin/store";

export interface PhotoUrls { version: number; masterUrl: string; thumbUrl: string }
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export async function photoUrls(db: EmpDb, id: number): Promise<PhotoUrls | null> {
  const r = (await db.run((q) => q(`SELECT version, master_url, thumb_url FROM public.employee_photo WHERE employee_id = $1`, [id])))[0];
  return r ? { version: Number(r.version), masterUrl: str(r.master_url), thumbUrl: str(r.thumb_url) } : null;
}

export type SaveResult = { status: "ok"; version: number; oldUrls: string[] } | { status: "forbidden" } | { status: "missing" };

export async function savePhoto(db: EmpDb, actor: Actor, id: number, p: { masterUrl: string; thumbUrl: string; width: number; height: number; bytes: number }): Promise<SaveResult> {
  try {
    return await db.run(async (q): Promise<SaveResult> => {
      const role = await begin(q, "employee", actor);
      const who = (await q(`SELECT ticket_no, name FROM public.employee_roster WHERE id = $1`, [id]))[0];
      if (!who) return { status: "missing" };
      const old = (await q(`SELECT master_url, thumb_url FROM public.employee_photo WHERE employee_id = $1 FOR UPDATE`, [id]))[0];
      const r = await q(
        `INSERT INTO public.employee_photo (employee_id, version, master_url, thumb_url, width, height, bytes, updated_by_ticket, updated_by_name) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (employee_id) DO UPDATE SET version = public.employee_photo.version + 1, master_url = EXCLUDED.master_url, thumb_url = EXCLUDED.thumb_url, width = EXCLUDED.width, height = EXCLUDED.height, bytes = EXCLUDED.bytes, updated_at = now(), updated_by_ticket = EXCLUDED.updated_by_ticket, updated_by_name = EXCLUDED.updated_by_name RETURNING version`,
        [id, p.masterUrl, p.thumbUrl, p.width, p.height, p.bytes, actor.ticket, actor.name],
      );
      await writeAudit(q, "employee", actor, role, "photo", { targetId: id, targetTicket: str(who.ticket_no), targetName: str(who.name), note: "changed" });
      return { status: "ok", version: Number(r[0].version), oldUrls: old ? [str(old.master_url), str(old.thumb_url)] : [] };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    throw e;
  }
}

export type RemoveResult = { status: "ok"; oldUrls: string[] } | { status: "none" } | { status: "forbidden" } | { status: "missing" };

export async function removePhoto(db: EmpDb, actor: Actor, id: number): Promise<RemoveResult> {
  try {
    return await db.run(async (q): Promise<RemoveResult> => {
      const role = await begin(q, "employee", actor);
      const who = (await q(`SELECT ticket_no, name FROM public.employee_roster WHERE id = $1`, [id]))[0];
      if (!who) return { status: "missing" };
      const old = (await q(`DELETE FROM public.employee_photo WHERE employee_id = $1 RETURNING master_url, thumb_url`, [id]))[0];
      if (!old) return { status: "none" };
      await writeAudit(q, "employee", actor, role, "photo", { targetId: id, targetTicket: str(who.ticket_no), targetName: str(who.name), note: "removed" });
      return { status: "ok", oldUrls: [str(old.master_url), str(old.thumb_url)] };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    throw e;
  }
}

/** The photo goes with the employee (no history line: the deletion has its own). Returns the addresses to delete from the store. */
export async function purgePhoto(db: EmpDb, id: number): Promise<string[]> {
  const r = (await db.run((q) => q(`DELETE FROM public.employee_photo WHERE employee_id = $1 RETURNING master_url, thumb_url`, [id])))[0];
  return r ? [str(r.master_url), str(r.thumb_url)] : [];
}

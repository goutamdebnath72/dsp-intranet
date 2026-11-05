// src/lib/employees/photo/api.ts
//
// THE PHOTO REQUESTS (step 70): POST = upload or remove (HOD or an authorised delegate, as for the employee records); GET = the picture itself or its version (anybody who is LOGGED IN: owner's decision, 2 Nov 2026).
// The route (src/app/api/employees/photo/route.ts) only reads the request and hands it here, so the rules can be tested without a server.

import { authorityOf } from "@/lib/facility/authority";
import type { Actor } from "@/lib/facility/types";
import type { EmpDb } from "@/lib/employees/admin/store";
import { PHOTO } from "./crop";
import { normalisePhoto } from "./process";
import { photoUrls, removePhoto, savePhoto } from "./store";
import type { PhotoStorage } from "./storage";

export interface PhotoCtx { actor: Actor | null; db: EmpDb; storage: PhotoStorage }
export interface PhotoReply { status: number; body: Record<string, unknown> }
const reply = (status: number, body: Record<string, unknown>): PhotoReply => ({ status, body });
const idOf = (v: unknown): number | null => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const settle = (p: Promise<void>) => p.catch(() => undefined);

export async function handlePhotoPost(form: FormData | null, ctx: PhotoCtx): Promise<PhotoReply> {
  if (!ctx.actor) return reply(401, { error: "Please log in." });
  const actor = ctx.actor;
  if (!form) return reply(400, { error: "Bad request." });
  const op = String(form.get("op") ?? "");
  const id = idOf(form.get("id"));
  if ((op !== "upload" && op !== "remove") || id === null) return reply(400, { error: "Bad request." });
  if (!(await ctx.db.run((q) => authorityOf(q, "employee", actor.ticket)))) return reply(403, { error: "You are not allowed to do that." });

  if (op === "remove") {
    const r = await removePhoto(ctx.db, actor, id);
    if (r.status === "ok") await settle(ctx.storage.del(r.oldUrls));
    return reply(200, { result: { status: r.status } });
  }

  const file = form.get("file");
  if (typeof file === "string" || !file || typeof (file as Blob).arrayBuffer !== "function") return reply(200, { result: { status: "invalid", reason: "No photo was sent." } });
  if ((file as Blob).size > PHOTO.serverMaxBytes) return reply(200, { result: { status: "invalid", reason: "The picture is too large (the screen sends a much smaller one: try again)." } });
  const n = await normalisePhoto(Buffer.from(await (file as Blob).arrayBuffer()));
  if (!n.ok) return reply(200, { result: { status: "invalid", reason: n.reason } });

  let masterUrl: string, thumbUrl: string;
  try {
    masterUrl = await ctx.storage.put(`employee-photos/${id}/master.jpg`, n.master, "image/jpeg");
    thumbUrl = await ctx.storage.put(`employee-photos/${id}/thumb.jpg`, n.thumb, "image/jpeg");
  } catch (e) {
    console.error("employee photo store:", e);
    return reply(503, { error: "The photo store is not available (check BLOB_READ_WRITE_TOKEN). Nothing was saved." });
  }
  const saved = await savePhoto(ctx.db, actor, id, { masterUrl, thumbUrl, width: n.width, height: n.height, bytes: n.master.length });
  if (saved.status !== "ok") { await settle(ctx.storage.del([masterUrl, thumbUrl])); return reply(200, { result: { status: saved.status } }); }
  await settle(ctx.storage.del(saved.oldUrls));
  return reply(200, { result: { status: "ok", version: saved.version } });
}

export interface PhotoGetReply { status: number; headers: Record<string, string>; json?: Record<string, unknown>; bytes?: Buffer }

export async function handlePhotoGet(query: URLSearchParams, ctx: PhotoCtx, ifNoneMatch?: string | null): Promise<PhotoGetReply> {
  const none = { "Cache-Control": "no-store" };
  if (!ctx.actor) return { status: 401, headers: none, json: { error: "Please log in." } };
  const id = idOf(query.get("id"));
  if (id === null) return { status: 400, headers: none, json: { error: "Bad request." } };
  const row = await photoUrls(ctx.db, id);
  if (query.get("meta") === "1") return { status: 200, headers: none, json: { version: row ? row.version : null } };
  if (!row) return { status: 404, headers: none, json: { error: "No photo." } };
  const size = query.get("size") === "master" ? "master" : "thumb";
  const etag = `"${id}-${row.version}-${size}"`;
  const cache = { ETag: etag, "Cache-Control": "private, max-age=31536000, immutable" };
  if (ifNoneMatch && ifNoneMatch === etag) return { status: 304, headers: cache };
  const bytes = await ctx.storage.get(size === "master" ? row.masterUrl : row.thumbUrl);
  if (!bytes) return { status: 404, headers: none, json: { error: "No photo." } };
  return { status: 200, headers: { ...cache, "Content-Type": "image/jpeg" }, bytes };
}

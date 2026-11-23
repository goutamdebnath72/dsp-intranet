// src/app/developers/[[...path]]/route.ts
//
// GET /developers and /developers/<file>: the developer reference (everything under developer-docs/, built by scripts/docs/build-api-docs.mjs), shown only to a signed-in user.
// The reference lists every route, table and switch of the application and the way each is guarded, so I do not leave it in /public for anyone on the internet: the login session decides (src/lib/apiAuth.ts), and the files are read
// from the server's own folder, never from a path the browser can choose (the path is checked below). DEV_DOCS_ACCESS=off in the environment switches it off altogether (404).
// The page loads its own files by relative address, so /developers goes to /developers/index.html first.
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join, normalize, extname, sep } from "node:path";
import { getSessionTicket } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

const ROOT = join(process.cwd(), "developer-docs");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const gate = (title: string, text: string, status: number) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#090b10;color:#e8ebf3;font:16px/1.6 system-ui,sans-serif"><div style="max-width:440px;padding:32px;text-align:center"><div style="width:44px;height:44px;margin:0 auto 18px;border-radius:12px;background:linear-gradient(145deg,#ff8a3d,#ffb454);color:#1a0d03;font-weight:800;display:grid;place-items:center">DSP</div><h1 style="font-size:22px;margin:0 0 8px">${title}</h1><p style="color:#aab1c2;margin:0 0 22px">${text}</p><a href="/" style="color:#5ab8ff">Back to the intranet</a></div></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

export async function GET(_request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  if ((process.env.DEV_DOCS_ACCESS || "").trim().toLowerCase() === "off") return new NextResponse("Not found", { status: 404 });
  const { path } = await ctx.params;
  if (!(await getSessionTicket())) return gate("Developer reference", "Sign in to the intranet first, then open this page again. The reference is for signed-in staff.", 401);
  if (!path || path.length === 0) return NextResponse.redirect(new URL("/developers/index.html", _request.url), 308);
  const rel = normalize(path.join("/"));
  const file = join(ROOT, rel);
  if (rel.startsWith("..") || !file.startsWith(ROOT + sep)) return new NextResponse("Not found", { status: 404 });
  const type = TYPES[extname(file)];
  if (!type) return new NextResponse("Not found", { status: 404 });
  try {
    const body = await readFile(file);
    return new NextResponse(new Uint8Array(body), { status: 200, headers: { "Content-Type": type, "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex, nofollow" } });
  } catch {
    return gate("Not found", "The reference has no such file. It may not have been built yet: run npm run docs:api.", 404);
  }
}

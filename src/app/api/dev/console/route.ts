// src/app/api/dev/console/route.ts
//
// POST /api/dev/console   { entries: [{ t, l, p, m }] }   DEVELOPMENT ONLY (404 in production).
// The browser's console, written to `.browser-console.log` in the project folder (see src/lib/dev/consoleBridge.ts). Started afresh when the dev server starts (the first write of a server process empties the file).

import { appendFile, stat, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { cleanEntries, formatEntries, MAX_BODY_CHARS, MAX_FILE_BYTES } from "@/lib/dev/consoleBridge";

export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), ".browser-console.log");
// on globalThis: a hot reload of this file must not empty the log in the middle of a session
const g = globalThis as unknown as { __dspBrowserLogStarted?: boolean };

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return new NextResponse(null, { status: 413 });
    const entries = cleanEntries(JSON.parse(text));
    if (!entries.length) return new NextResponse(null, { status: 204 });
    let fresh = !g.__dspBrowserLogStarted;
    if (!fresh) fresh = await stat(FILE).then((s) => s.size > MAX_FILE_BYTES, () => false);
    g.__dspBrowserLogStarted = true;
    const body = formatEntries(entries);
    if (fresh) await writeFile(FILE, body);
    else await appendFile(FILE, body);
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}

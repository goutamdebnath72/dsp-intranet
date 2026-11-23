// src/instrumentation.ts
//
// Next runs register() once when a server copy starts and calls onRequestError for every error a route, page or server action throws. I use both only to feed the ERROR LOG (src/lib/errorLog/), which exists in production only.
// I import the Node-only code INSIDE a positive `NEXT_RUNTIME === "nodejs"` block (Next's own pattern): the bundler removes the block from the edge copy of this file, where node:crypto does not exist.

import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installServerErrorLog } = await import("@/lib/errorLog/serverHook");
    installServerErrorLog();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportServerRequestError, keepAlive } = await import("@/lib/errorLog/serverHook");
    const done = reportServerRequestError(err, request, context);
    keepAlive(done);
    await done;
  }
};

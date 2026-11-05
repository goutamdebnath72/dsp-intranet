// src/lib/employees/photo/storage.ts
//
// WHERE THE PICTURES ARE KEPT (step 70): Vercel Blob, the same place the circulars' files go. The addresses of the pictures are NEVER sent to the browser: the pictures are served by our own login-checked route
// (src/app/api/employees/photo), so a picture is seen only by somebody who is logged in. `memoryStorage` is for the tests.

export interface PhotoStorage {
  put(path: string, body: Buffer, contentType: string): Promise<string>;
  get(url: string): Promise<Buffer | null>;
  del(urls: string[]): Promise<void>;
}

export function blobStorage(): PhotoStorage {
  return {
    async put(path, body, contentType) {
      const { put } = await import("@vercel/blob");
      return (await put(path, body, { access: "public", addRandomSuffix: true, contentType })).url;
    },
    async get(url) {
      const r = await fetch(url, { cache: "no-store" });
      return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    },
    async del(urls) {
      if (urls.length === 0) return;
      const { del } = await import("@vercel/blob");
      await del(urls);
    },
  };
}

export function memoryStorage(): PhotoStorage & { urls(): string[] } {
  const files = new Map<string, Buffer>();
  let n = 0;
  return {
    async put(path, body) { const url = `memory://${path}-${++n}`; files.set(url, body); return url; },
    async get(url) { return files.get(url) ?? null; },
    async del(urls) { for (const u of urls) files.delete(u); },
    urls: () => Array.from(files.keys()),
  };
}

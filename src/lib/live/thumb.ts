// src/lib/live/thumb.ts
//
// THE SMALL PICTURE OF A NEWS CARD. The feeds give a picture for most English and Hindi stories (and the business papers'), but at the size of the papers' own pages: 1200 to 1600 pixels wide, 100 to 400 KB each, for a box
// that is 96 pixels wide on the card. Showing them as they are would put several megabytes on a screen of fifteen cards, which is the slowness the owner feared. So the browser never asks the paper for the picture: it asks THIS
// intranet's route /api/live/thumb, which fetches the picture once, makes it 360 x 240 pixels (3:2, the shape of the pictures of the Bengali news page the owner pointed to; twice the 180 x 120 box, for sharp screens; the picture is cropped to the shape, never stretched) as a WebP of 8 to 20 KB, and says that it may be kept for a day by the browser and a week by the host's
// shared cache: the first person to open a story's picture pays for the making (a fraction of a second, and the card's text is already on the screen), every later one gets 5 KB from the cache. The feed itself carries only the
// picture's address, so the news answer is no slower for it.
// This route fetches an address it was given, so it fetches ONLY from the hosts below (the image servers of the papers whose feeds I read), only over https, and nothing else: it cannot be used to reach an address inside a network
// or an arbitrary site. A host that is not in the list gives no picture and the card shows its tile.
import { pictureKey } from "./rss";
export const THUMB_W = 360;
export const THUMB_H = 240;
/** The most bytes of a picture I will read (the papers' pictures are up to a few hundred KB). */
export const MAX_SOURCE_BYTES = 6 * 1024 * 1024;

/** The image servers of the papers: a host is allowed when it is one of these or a subdomain of one. */
export const IMAGE_HOSTS = [
  "thgim.com", "toiimg.com", "etimg.com", "indiatimes.com", "langimg.com", "livemint.com", "hindustantimes.com", "indianexpress.com", "ndtvimg.com", "ndtv.com",
  "bbci.co.uk", "bbc.co.uk", "bbc.com", "bhaskarassets.com", "bhaskar.com", "livehindustan.com", "hindustan.com", "wsj.net", "sangbadpratidin.in",
  "jagran.com", "jagranimages.com", "amarujala.com", "telegraphindia.com", "anandabazar.com", "bartamanpatrika.com", "eisamay.com", "aajkaal.in", "thehindu.com", "thehindubusinessline.com",
  // Ei Samay's pictures, and Bing's own thumbnails (the picture Bing News holds of a story whose paper does not let me read its pages)
  "assettype.com", "bing.com",
];

/**
 * The papers whose STORY PAGES I read when a list is built (src/lib/live/pageFacts.ts): to take the picture the paper itself attaches to the story (its og:image, the picture a link preview shows) when the feed carries none, and to see whether the paper marks the story as paid. These are the papers whose pages answer an
 * ordinary request (checked 28 Nov 2026: Jagran, Amar Ujala, Bartaman, Aajkaal, Sangbad Pratidin, Ei Samay, each in 0.2 to 0.5 s). I do NOT read a paper that refuses automated requests (Anandabazar Patrika and The Telegraph answer 403 even for robots.txt):
 * I do not work around a refusal, and their stories show Bing's picture of the story where Bing has it, and a tile where it has not.
 */
export const ARTICLE_HOSTS = [
  "jagran.com", "amarujala.com", "bartamanpatrika.com", "aajkaal.in", "sangbadpratidin.in", "eisamay.com",
  // the papers whose feeds already carry a picture are read too, for the other thing the page says: whether the story is free to read (src/lib/live/pageFacts.ts)
  "hindustantimes.com", "indianexpress.com", "thehindu.com", "thehindubusinessline.com", "livemint.com", "indiatimes.com", "ndtv.com", "bhaskar.com", "livehindustan.com", "wsj.com", "bbc.com", "bbc.co.uk",
];

/** Is this an https address on one of the papers' image servers (no port, no login in it, no IP number)? */
export function isAllowedImage(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
    const h = u.hostname.toLowerCase();
    if (/^[\d.]+$/.test(h) || h.includes(":")) return false;
    return IMAGE_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/**
 * The address the card's <img> uses for a story's picture (the picture's address was found when the list was built: in the feed, on the story's own page, or at Bing); null when the story has none or the route would refuse it, and the card
 * then shows its tile at once, with no request.
 */
export const thumbSrc = (image: string | undefined | null): string | null => (image && isAllowedImage(image) ? `/api/live/thumb?u=${encodeURIComponent(image)}` : null);

/**
 * Where a paper's image server lets the size be asked for in the address, I ask for a small one instead of fetching the big one and making it small here. Only Bhaskar needs it: most of its feed's pictures are animated GIFs, 1 to 7 MB
 * at the 1000 x 1000 the feed names and 1 MB at 200 x 200 (measured 28 Nov 2026). The other papers' pictures are 40 to 500 KB and are fetched as given.
 */
export function smallerAddress(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname === "images.bhaskarassets.com") u.pathname = u.pathname.replace(/\/thumb\/\d+x\d+\//, "/thumb/200x200/");
    return u.toString();
  } catch {
    return raw;
  }
}

const hostOk = (raw: string, hosts: string[]): boolean => {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
    const h = u.hostname.toLowerCase();
    if (/^[\d.]+$/.test(h) || h.includes(":")) return false;
    return hosts.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

/** Is this the page of a story of a paper whose pages I read (https, on its own host)? */
export const isReadableArticle = (raw: string): boolean => hostOk(raw, ARTICLE_HOSTS);

/** The most bytes of a story page I read: the picture's tag is in the head, in the first 100 to 200 KB, and I stop at the end of the head. */
export const MAX_PAGE_BYTES = 400 * 1024;
/** (Mint puts its paywall marker 110 to 120 KB into the page, after the head, so the head alone is not enough.) */

const decodeAttr = (s: string): string => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

/**
 * The picture a paper attaches to a story, from the story page's head: og:image (the one a link preview shows), else twitter:image. Returns the https address, or null. A relative address is made absolute against the page.
 * Only what is in a <meta> tag is read: nothing in the page is run.
 */
export function pictureOfPage(html: string, pageUrl: string): string | null {
  const head = html.slice(0, html.search(/<\/head>/i) > 0 ? html.search(/<\/head>/i) : MAX_PAGE_BYTES);
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const find = (key: string): string | null => {
    for (const m of metas) {
      const k = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(m)?.[1]?.toLowerCase();
      if (k !== key) continue;
      const c = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(m);
      const v = c ? decodeAttr(c[1] ?? c[2] ?? "") : "";
      if (v) return v;
    }
    return null;
  };
  const raw = find("og:image:secure_url") ?? find("og:image") ?? find("twitter:image") ?? find("twitter:image:src");
  if (!raw) return null;
  try {
    const u = new URL(raw, pageUrl);
    return u.protocol === "https:" ? u.toString() : u.protocol === "http:" ? `https://${u.host}${u.pathname}${u.search}` : null;
  } catch {
    return null;
  }
}

/**
 * Can this picture become a thumbnail? The Times of India and Economic Times addresses carry the picture's size in bytes ("...,imgsize-17121652.cms"): one over the ceiling (an animated GIF of 17 MB was in the feed of 28 Nov 2026, and the paper's own
 * resizing gave 26 MB) cannot be fetched, so the story has NO usable picture. Other addresses are taken as usable (the route refuses a file that turns out too large).
 */
export function usableImage(raw: string): boolean {
  const n = /imgsize-(\d+)/i.exec(raw)?.[1];
  if (n && Number(n) > MAX_SOURCE_BYTES) return false;
  // not a picture of the story: one the intranet has looked at and found to be a logo or a flat graphic (rejectPicture), or one whose address says it is a stock image ("ht-generic_india3.jpg", "placeholder", "default")
  return !REJECTED.has(pictureKey(raw)) && !STOCK_ADDRESS.test(pathOf(raw));
}

const REJECTED = new Set<string>();
const REJECTED_MAX = 500;
const STOCK_ADDRESS = /(?:^|[\/_.-])(?:generic|placeholder|dummy|no-?image|fallback|default-?image|default)(?:[\/_.-]|$)/i;
const pathOf = (raw: string): string => { try { return new URL(raw).pathname; } catch { return ""; } };

/** The owner's rule: no relevant picture, no story. A picture found to be a logo or a flat graphic (photoHash.ts looksLikeLogo: a paper's own logo that an image search gave for its story) is no picture: from now on usableImage says no to it. */
export function rejectPicture(image: string): void {
  if (REJECTED.size >= REJECTED_MAX) REJECTED.delete(REJECTED.keys().next().value as string);
  REJECTED.add(pictureKey(image));
}

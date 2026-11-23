// src/middleware.ts
//
// A picture is answered only to a page that shows it (my rule: no photograph can be saved from this app; see src/lib/ui/imageGuard.ts for what that can and cannot mean). The public picture files (the DSP history
// pictures and the other image files in /public) and Next's image optimiser are the only paths this runs on. A browser that loads the picture into a page sends `Sec-Fetch-Dest: image` and is served; one that is asked to
// open the picture by itself (the address typed, "Open image in new tab", "Save link as") sends `document` and gets 403. The employees' photographs have their own route, which applies the same rule after its login check.
import { NextResponse, type NextRequest } from "next/server";
import { imageFetchAllowed } from "@/lib/ui/imageGuard";

export function middleware(request: NextRequest) {
  if (imageFetchAllowed(request.headers)) return NextResponse.next();
  return new NextResponse("Pictures on this site are shown in its pages only.", { status: 403, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

export const config = {
  matcher: ["/((?!api|_next/static).*\\.(?:jpg|jpeg|png|gif|webp|avif|bmp|tif|tiff))", "/_next/image"],
};

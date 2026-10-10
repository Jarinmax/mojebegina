// Rozlišení domén (begina.cz / www.begina.cz / moje.begina.cz) — viz
// lib/site/routing.ts (pravidla) a lib/site/hosts.ts (domény).
//
// Proxy jen směruje; o přístupu k datům nerozhoduje. Každá serverová akce
// a stránka MojeBegina si přihlášení a roli ověřuje sama (requireOrderContext,
// requireCustomerContext…) — na begina.cz se k nim navíc vůbec nedá dostat.
import { NextResponse, type NextRequest } from "next/server";
import { SITE_HEADER } from "@/lib/site/hosts";
import { indexingEnabled } from "@/lib/site/flags";
import { PUBLIC_NOT_FOUND_PATH, route } from "@/lib/site/routing";

const NOINDEX = "noindex, nofollow";

function withSite(request: NextRequest, site: "public" | "internal"): Headers {
  const headers = new Headers(request.headers);
  // Vždy přepsat — hodnota od klienta se nesmí dostat ke stránkám.
  headers.set(SITE_HEADER, site);
  return headers;
}

function robotsHeader(response: NextResponse, site: "public" | "internal"): NextResponse {
  // moje.begina.cz se nikdy neindexuje; begina.cz jen s ESHOP_INDEXING=on.
  if (site === "internal" || !indexingEnabled()) response.headers.set("X-Robots-Tag", NOINDEX);
  return response;
}

export function proxy(request: NextRequest) {
  const decision = route({
    host: request.headers.get("host"),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    method: request.method,
  });

  switch (decision.kind) {
    case "redirect":
      return NextResponse.redirect(new URL(decision.location, request.url), decision.status);
    case "gone":
      return new NextResponse("Tato stránka už neexistuje.", {
        status: 410,
        headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": NOINDEX },
      });
    case "notFound": {
      const url = new URL(PUBLIC_NOT_FOUND_PATH, request.url);
      const response = NextResponse.rewrite(url, { request: { headers: withSite(request, "public") } });
      response.headers.set("X-Robots-Tag", NOINDEX);
      return response;
    }
    case "rewrite": {
      const url = new URL(`${decision.path}${request.nextUrl.search}`, request.url);
      return robotsHeader(NextResponse.rewrite(url, { request: { headers: withSite(request, "public") } }), "public");
    }
    case "pass":
      return robotsHeader(NextResponse.next({ request: { headers: withSite(request, decision.site) } }), decision.site);
  }
}

export const config = {
  // Vše kromě sestavených souborů a optimalizace obrázků (ty neobsahují
  // žádnou stránku ani data a na begina.cz je e-shop potřebuje).
  matcher: ["/((?!_next/static|_next/image).*)"],
};

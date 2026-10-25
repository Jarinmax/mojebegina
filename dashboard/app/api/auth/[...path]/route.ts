import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { AGENT_HOST, isAgentRequest } from "@/lib/site/hosts";

// Security Phase 2.7 — účty zakládáme sami ručně (viz Phase 2.4 LoginForm
// komentář), self-service registrace nikdy nebyla součástí appky. Tohle jen
// zavírá samotný auth endpoint, který by jinak sign-up přijal od kohokoli.
const { GET, POST: authPost } = auth.handler();

const AGENT_ORIGIN = `https://${AGENT_HOST}`;
// Managed Neon Auth už důvěřuje hlavní doméně interní aplikace. Pilotní
// doména je přísně omezená proxy allowlistem jen na tento sign-in endpoint,
// ale Neon ji nezná a vrací 403 INVALID_ORIGIN. Po ověření skutečného původu
// požadavku proto upstreamu předáme již povolený interní origin. Bez přesné
// shody originu se nic nepřepisuje — cizí web tak CSRF kontrolu neobejde.
const NEON_TRUSTED_AUTH_ORIGIN = "https://moje.begina.cz";

export function requestForNeonAuth(request: NextRequest): NextRequest | null {
  if (!isAgentRequest(request.headers.get("host"), request.headers.get("x-forwarded-host"))) {
    return request;
  }
  if (request.headers.get("origin") !== AGENT_ORIGIN) return null;

  const headers = new Headers(request.headers);
  headers.set("origin", NEON_TRUSTED_AUTH_ORIGIN);
  if (headers.get("referer")?.startsWith(`${AGENT_ORIGIN}/`)) {
    headers.set("referer", `${NEON_TRUSTED_AUTH_ORIGIN}/login`);
  }
  return new NextRequest(request, { headers });
}

export { GET };

export async function POST(request: NextRequest, ctx: RouteContext<"/api/auth/[...path]">) {
  const { path } = await ctx.params;
  if (path.join("/") === "sign-up/email") {
    return NextResponse.json(
      { message: "Sign-up is disabled", code: "SIGN_UP_DISABLED" },
      { status: 403 }
    );
  }
  const forwardedRequest = requestForNeonAuth(request);
  if (!forwardedRequest) {
    return NextResponse.json({ message: "Invalid origin", code: "INVALID_ORIGIN" }, { status: 403 });
  }
  return authPost(forwardedRequest, ctx);
}

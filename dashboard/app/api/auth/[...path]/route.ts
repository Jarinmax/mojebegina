import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

// Security Phase 2.7 — účty zakládáme sami ručně (viz Phase 2.4 LoginForm
// komentář), self-service registrace nikdy nebyla součástí appky. Tohle jen
// zavírá samotný auth endpoint, který by jinak sign-up přijal od kohokoli.
const { GET, POST: authPost } = auth.handler();

export { GET };

export async function POST(request: NextRequest, ctx: RouteContext<"/api/auth/[...path]">) {
  const { path } = await ctx.params;
  if (path.join("/") === "sign-up/email") {
    return NextResponse.json(
      { message: "Sign-up is disabled", code: "SIGN_UP_DISABLED" },
      { status: 403 }
    );
  }
  return authPost(request, ctx);
}

// PDF libovolné vydané faktury z iDokladu (i ruční řady 2026xxxx) — stažení
// po přihlášení, jen vystavovatelé faktur. Jde přes společný runner čtení
// iDokladu (oprávnění, limity, záznam v idoklad_read_log, kanál „ui“).
// Odkaz vrací asistentovi nástroj idoklad_invoice_pdf.
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/data/authContext";
import { idokladInvoicePdfPath, runIdokladRead } from "@/lib/idoklad-read/tools";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/rizeni-firmy/faktury/idoklad/[id]/pdf">) {
  const { id } = await ctx.params;
  if (!/^\d{1,10}$/.test(id)) return new NextResponse("Nenalezeno", { status: 404 });
  if (!(await getAuthContext())) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(idokladInvoicePdfPath(Number(id)))}`, request.url));
  }
  const outcome = await runIdokladRead("idoklad_invoice_pdf_file", { id: Number(id) }, "ui");
  if (!outcome.ok) return new NextResponse(outcome.error, { status: outcome.status === "denied" ? 403 : outcome.status === "rate_limited" ? 429 : 502 });
  if (outcome.data.found !== true) return new NextResponse("Faktura v iDokladu není.", { status: 404 });
  const { filename, contentBase64 } = outcome.data as { filename: string; contentBase64: string };
  return new NextResponse(new Uint8Array(Buffer.from(contentBase64, "base64")), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}

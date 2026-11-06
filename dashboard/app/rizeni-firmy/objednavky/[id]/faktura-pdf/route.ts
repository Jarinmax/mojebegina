// PDF vystavené faktury k objednávce — čte se z iDokladu (jen čtení), stejné
// oprávnění jako detail objednávky. Odkaz vrací i asistent po vystavení
// (issue_invoice), uživatel ho otevře po přihlášení do MojeBegina.
import { NextResponse } from "next/server";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";
import { getOrderInvoicePdf } from "@/lib/data/orders";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: RouteContext<"/rizeni-firmy/objednavky/[id]/faktura-pdf">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return new NextResponse("Nenalezeno", { status: 404 });
  try {
    const pdf = await getOrderInvoicePdf(id);
    if (!pdf) return new NextResponse("Faktura k objednávce není vystavená nebo PDF není dostupné.", { status: 404 });
    return new NextResponse(new Uint8Array(pdf.content), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${pdf.filename}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/rizeni-firmy/objednavky/${id}/faktura-pdf`)}`, _request.url));
    if (error instanceof ForbiddenError) return new NextResponse("Nemáte oprávnění.", { status: 403 });
    throw error;
  }
}

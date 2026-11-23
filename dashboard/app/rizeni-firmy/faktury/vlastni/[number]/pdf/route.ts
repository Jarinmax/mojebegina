// PDF vlastní faktury MojeBegina (řada 2026xxxx) — stažení po přihlášení,
// jen vystavovatelé faktur. Vykresluje se vždy ze snapshotu dokladu.
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { db } from "@/lib/db/client";
import { loadOwnDocument, ownDocumentPdf } from "@/lib/eshop/invoicing/ownIssue";
import { ownInvoicePdfPath } from "@/lib/eshop/invoicing/ownB2b";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/rizeni-firmy/faktury/vlastni/[number]/pdf">) {
  const { number } = await ctx.params;
  if (!/^\d{8}$/.test(number)) return new NextResponse("Nenalezeno", { status: 404 });
  const auth = await getAuthContext();
  if (!auth) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(ownInvoicePdfPath(number))}`, request.url));
  if (!isInvoiceIssuer(auth)) return new NextResponse("Faktury smí otevřít jen vystavovatelé faktur.", { status: 403 });
  const doc = await loadOwnDocument(db, number);
  if (!doc) return new NextResponse("Faktura v MojeBegina není.", { status: 404 });
  const pdf = await ownDocumentPdf(db, doc.id);
  if (!pdf) return new NextResponse("Faktura v MojeBegina není.", { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(pdf.contentBase64, "base64")), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${pdf.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}

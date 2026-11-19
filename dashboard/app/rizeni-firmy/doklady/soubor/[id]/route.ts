// Doklady — stažení / zobrazení nahraného dokladu nákladu (privátní Blob).
import { NextResponse } from "next/server";
import { DocumentAccessError, openDocument } from "@/lib/doklady/documents";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/rizeni-firmy/doklady/soubor/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Nenalezeno", { status: 404 });
  try {
    const doc = await openDocument(id);
    if (!doc) return new NextResponse("Doklad nebyl nalezen.", { status: 404 });
    return new NextResponse(doc.stream, {
      headers: {
        "content-type": doc.mimeType,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof DocumentAccessError) return new NextResponse(error.message, { status: 403 });
    throw error;
  }
}

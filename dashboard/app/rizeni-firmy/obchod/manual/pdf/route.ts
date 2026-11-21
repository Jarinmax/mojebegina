import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/data/authContext";
import { canReadSalesManual } from "@/lib/data/salesManualAuth";
import { SALES_MANUAL_PDF_BASE64, SALES_MANUAL_PDF_FILENAME } from "@/lib/obchod/salesManualPdf";

// Stažení PDF manuálu — jen Viner, Lucie a Blahout.
export async function GET() {
  const ctx = await getAuthContext();
  if (!canReadSalesManual(ctx)) {
    return new NextResponse("Manuál pro obchodníky není pro tento účet dostupný.", { status: 403 });
  }
  const body = Buffer.from(SALES_MANUAL_PDF_BASE64, "base64");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${SALES_MANUAL_PDF_FILENAME}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

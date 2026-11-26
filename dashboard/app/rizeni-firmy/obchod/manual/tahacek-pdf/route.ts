import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/data/authContext";
import { canReadSalesManual } from "@/lib/data/salesManualAuth";
import { applyFuelSurchargeFromDb } from "@/lib/eshop/fuelSurchargeServer";
import { CALL_CHEATSHEET_PDF_FILENAME, callCheatsheetPdf } from "@/lib/obchod/callCheatsheet";

export const dynamic = "force-dynamic";

// Stažení PDF taháčku k hovoru — stejný přístup jako manuál (Viner, Lucie, Blahout).
export async function GET() {
  const ctx = await getAuthContext();
  if (!canReadSalesManual(ctx)) {
    return new NextResponse("Manuál pro obchodníky není pro tento účet dostupný.", { status: 403 });
  }
  await applyFuelSurchargeFromDb();
  const bytes = await callCheatsheetPdf();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${CALL_CHEATSHEET_PDF_FILENAME}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

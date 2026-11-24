import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/data/authContext";
import { canReadSalesManual } from "@/lib/data/salesManualAuth";
import { applyFuelSurchargeFromDb } from "@/lib/eshop/fuelSurchargeServer";
import { SALES_MANUAL_LIVE_PDF_FILENAME, salesManualPdf } from "@/lib/obchod/salesManualPdfLive";

export const dynamic = "force-dynamic";

// Stažení PDF manuálu — jen Viner, Lucie a Blahout. PDF se vytvoří při stažení
// z aktuálního textu a aktuálního palivového příplatku (Lucie 24. 11. 2026).
export async function GET() {
  const ctx = await getAuthContext();
  if (!canReadSalesManual(ctx)) {
    return new NextResponse("Manuál pro obchodníky není pro tento účet dostupný.", { status: 403 });
  }
  await applyFuelSurchargeFromDb();
  const bytes = await salesManualPdf();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${SALES_MANUAL_LIVE_PDF_FILENAME}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

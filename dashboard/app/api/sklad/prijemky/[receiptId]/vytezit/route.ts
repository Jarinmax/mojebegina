// Mobilní tok 1.0 — "Načíst údaje z dokladu" (bod 1+2 zadání). Tenká route,
// veškerá logika (oprávnění, čtení stránek z privátního Blobu, volání
// modelu, mapování, idempotentní zápis) žije v
// lib/data/skladExtraction.ts#triggerGoodsReceiptExtraction.
import { NextResponse, type NextRequest } from "next/server";
import { triggerGoodsReceiptExtraction } from "@/lib/data/skladExtraction";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;

  try {
    const result = await triggerGoodsReceiptExtraction(receiptId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Nepřihlášeno." }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "Nemáte oprávnění vytěžit doklad této příjemky." }, { status: 403 });
    }
    throw error;
  }
}

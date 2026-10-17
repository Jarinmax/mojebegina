// Verze obchodních podmínek přijatá u objednávky — uložená v historii
// objednávky (order_activity „created“, metadata.legal) v okamžiku odeslání.
// Bez migrace DB: historie objednávky je neměnný záznam o vzniku objednávky.
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { legalPdf, type LegalAcceptance, type LegalPdf } from "./versions";

type Db = NeonHttpDatabase<typeof schema>;

async function createdMetadata(db: Db, orderId: string): Promise<Record<string, unknown> | null> {
  const rows = (
    await db.execute(sql`
      SELECT metadata FROM order_activity WHERE order_id = ${orderId} AND kind = 'created' ORDER BY created_at LIMIT 1`)
  ).rows as { metadata: Record<string, unknown> | null }[];
  return rows[0]?.metadata ?? null;
}

/**
 * Přijatá verze (náhradní objednávka bez vlastní → verze původní objednávky).
 * null = verze NENÍ DOLOŽENÁ (objednávka z doby před evidencí verzí) — nikdy
 * se nedosazuje aktuální verze jako údaj o tom, co zákazník přijal.
 */
export async function acceptedLegal(db: Db, orderId: string): Promise<LegalAcceptance | null> {
  const meta = await createdMetadata(db, orderId);
  const own = (meta?.legal ?? null) as LegalAcceptance | null;
  if (own) return own;
  const source = typeof meta?.replacementOfOrderId === "string" ? meta.replacementOfOrderId : null;
  if (!source) return null;
  return ((await createdMetadata(db, source))?.legal ?? null) as LegalAcceptance | null;
}

export type OrderLegalDocuments =
  /** PDF přesně té verze, kterou zákazník přijal */
  | { status: "recorded"; pdf: LegalPdf }
  /** verze u objednávky není zaznamenaná — PDF se nepřikládá, v historii „nedoloženo“ */
  | { status: "unrecorded" }
  /** zaznamenaná verze, ale PDF nejde připravit (neznámá verze, otisk) */
  | { status: "error" };

/** Dokumenty přijaté u objednávky (nikdy nevyhodí výjimku). */
export async function acceptedLegalDocuments(db: Db, orderId: string): Promise<OrderLegalDocuments> {
  try {
    const accepted = await acceptedLegal(db, orderId);
    if (!accepted) return { status: "unrecorded" };
    return { status: "recorded", pdf: await legalPdf(accepted.version) };
  } catch (error) {
    console.error("E-shop: PDF obchodních podmínek k objednávce se nepodařilo připravit", orderId, error);
    return { status: "error" };
  }
}

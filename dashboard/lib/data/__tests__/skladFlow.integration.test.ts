// @vitest-environment node
//
// Sklad 1.0 — celý tok nad SKUTEČNOU databází (PGlite se všemi migracemi):
// nahrání fotky → AI vytěžení (návrh) → ruční oprava → potvrzení člověkem
// → skladový pohyb. Mockuje se jen to, co běží mimo databázi: přihlášení,
// Vercel Blob (paměť) a dvě AI volání (OCR a strukturování). Datové funkce
// (lib/data/sklad.ts, skladExtraction.ts) i jejich SQL běží naostro.
//
// db.batch: neon-http ji posílá jako jednu transakci; PGlite drizzle batch
// nemá, proto ji tu napodobuje BEGIN … COMMIT nad stejným spojením.
import { createHash, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { AuthContext } from "../types";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  user: null as AuthContext,
  blobs: new Map<string, Uint8Array>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("../authContext", () => ({ getAuthContext: async () => holder.user }));
vi.mock("@vercel/blob", () => ({
  get: async (pathname: string) => {
    const bytes = holder.blobs.get(pathname);
    if (!bytes) return null;
    return {
      statusCode: 200,
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    };
  },
  del: async (pathname: string) => {
    holder.blobs.delete(pathname);
  },
}));

const ai = vi.hoisted(() => ({ ocr: vi.fn(), structure: vi.fn() }));
vi.mock("../receiptOcrModel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../receiptOcrModel")>()),
  performReceiptOcr: ai.ocr,
}));
vi.mock("../receiptExtractionModel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../receiptExtractionModel")>()),
  extractStructuredReceipt: ai.structure,
}));

import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "@/lib/eshop/__tests__/helpers/migratedDb";

const DB_TEST = { timeout: 120_000 };
const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";

function ctxFor(userId: string, name: string): AuthContext {
  return { userId, systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name, email: "test@example.com" };
}

let pg: PGlite;

async function rows<T>(sqlText: string, params: unknown[] = []): Promise<T[]> {
  return (await pg.query<T>(sqlText, params)).rows;
}

/** Nahraje JPEG do „Blobu“ a zaregistruje ho jako stránku příjemky (stejně jako upload z mobilu). */
async function uploadPage(receiptId: string, seed: number) {
  const { registerGoodsReceiptDocumentPage } = await import("../sklad");
  const jpeg = await sharp({ create: { width: 800 + seed, height: 1200, channels: 3, background: { r: 250, g: 250, b: 250 } } })
    .jpeg()
    .toBuffer();
  const pathname = `sklad/${receiptId}/${randomUUID()}.jpg`;
  holder.blobs.set(pathname, new Uint8Array(jpeg));
  const sha256 = createHash("sha256").update(jpeg).digest("hex");
  return registerGoodsReceiptDocumentPage(receiptId, { pathname, sha256, mimeType: "image/jpeg" });
}

function rawLine(overrides: Record<string, unknown> = {}) {
  return {
    description: "Cukr krystal 1 kg",
    supplierItemCode: "C-1",
    supplierAuxiliaryCode: null,
    packageQuantity: 10,
    unitsPerPackage: 1,
    unit: "kg",
    unitPriceWithoutVat: 20,
    totalWithoutVat: 200,
    vatAmount: 24,
    totalWithVat: 224,
    suggestedCategory: "stock_material",
    suggestedStockItemName: "Cukr",
    suggestedCanonicalUnit: "kg",
    ...overrides,
  };
}

beforeAll(async () => {
  const migrated = await createMigratedDb();
  pg = migrated.pg;
  // neon-http db.batch = jedna transakce; PGlite ji nemá → BEGIN/COMMIT nad týmž spojením.
  holder.db = Object.assign(migrated.db, {
    batch: async (queries: PromiseLike<unknown>[]) => {
      await pg.exec("BEGIN");
      try {
        const results: unknown[] = [];
        for (const query of queries) results.push(await query);
        await pg.exec("COMMIT");
        return results;
      } catch (error) {
        await pg.exec("ROLLBACK");
        throw error;
      }
    },
  });
  holder.user = ctxFor(VINER, "Jaroslav Viner");
}, DB_TEST.timeout);

describe("Sklad 1.0 — vytěžení je jen návrh a zapíše se celé, nebo vůbec", DB_TEST, () => {
  it("nahrání → vytěžení: řádky, hlavička a historie najednou; žádný skladový pohyb", async () => {
    const { createDraftGoodsReceipt, createSupplier } = await import("../sklad");
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const supplier = await createSupplier({ name: "Makro Cash & Carry", ico: "26450691", dic: "" });
    expect(supplier.ok).toBe(true);
    const [location] = await rows<{ id: string }>(`SELECT id FROM stock_locations WHERE code = 'default'`);
    const draft = await createDraftGoodsReceipt({
      supplierId: (supplier as { supplierId: string }).supplierId,
      stockLocationId: location.id,
      documentNumber: null,
      documentDate: null,
      dueDate: null,
      paymentMethod: null,
    });
    expect(draft.ok).toBe(true);
    const receiptId = (draft as { receiptId: string }).receiptId;

    expect(await uploadPage(receiptId, 1)).toMatchObject({ ok: true });

    ai.ocr.mockResolvedValueOnce("MAKRO faktura 2026-1001 … Cukr krystal 10 kg … celkem 268,80 Kč".padEnd(60, "."));
    ai.structure.mockResolvedValueOnce({
      supplierName: "Makro Cash & Carry",
      supplierIco: "26450691",
      supplierDic: null,
      documentNumber: "2026-1001",
      documentDate: "2026-10-19",
      paymentMethod: "karta",
      lines: [rawLine(), rawLine({ description: "Citrony", supplierItemCode: "L-7", packageQuantity: 2, unit: "kg", totalWithoutVat: 40, totalWithVat: 44.8, suggestedStockItemName: "Citrony" })],
      totalWithoutVat: 240,
      totalVat: 28.8,
      totalWithVat: 268.8,
    });

    expect(await triggerGoodsReceiptExtraction(receiptId)).toEqual({ ok: true });

    const [receipt] = await rows<Record<string, unknown>>(
      `SELECT status, extraction_status, document_number, document_date::text AS document_date, document_total_with_vat_hal::int AS total
         FROM goods_receipts WHERE id = $1`,
      [receiptId]
    );
    expect(receipt).toEqual({
      status: "draft",
      extraction_status: "needs_review",
      document_number: "2026-1001",
      document_date: "2026-10-19",
      total: 26880,
    });
    const lines = await rows<{ raw_description: string; vat_confirmed: boolean }>(
      `SELECT raw_description, vat_confirmed FROM goods_receipt_lines WHERE receipt_id = $1 ORDER BY position`,
      [receiptId]
    );
    expect(lines).toEqual([
      { raw_description: "Cukr krystal 1 kg", vat_confirmed: false },
      { raw_description: "Citrony", vat_confirmed: false },
    ]);
    const activity = await rows<{ kind: string; actor_type: string }>(
      `SELECT kind, actor_type FROM goods_receipt_activity WHERE receipt_id = $1 ORDER BY created_at`,
      [receiptId]
    );
    expect(activity).toEqual([
      { kind: "created", actor_type: "user" },
      { kind: "line_added", actor_type: "system" },
    ]);
    expect(await rows(`SELECT 1 FROM stock_movements WHERE receipt_id = $1`, [receiptId])).toEqual([]);
  });

  it("chyba uprostřed zápisu (neplatný řádek) → nezapíše se ANI JEDEN řádek ani hlavička, stav 'failed'", async () => {
    const { createDraftGoodsReceipt } = await import("../sklad");
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const [{ id: supplierId }] = await rows<{ id: string }>(`SELECT id FROM suppliers LIMIT 1`);
    const [location] = await rows<{ id: string }>(`SELECT id FROM stock_locations WHERE code = 'default'`);
    const draft = (await createDraftGoodsReceipt({
      supplierId,
      stockLocationId: location.id,
      documentNumber: null,
      documentDate: null,
      dueDate: null,
      paymentMethod: null,
    })) as { receiptId: string };
    const upload = await uploadPage(draft.receiptId, 2);
    expect(upload, JSON.stringify(upload)).toMatchObject({ ok: true });

    ai.ocr.mockResolvedValueOnce("Účtenka … dva řádky … druhý poškozený".padEnd(60, "."));
    // Druhý řádek projde aplikační sanitizací, ale v DB porušuje CHECK
    // (množství 1e9 × 1e9 přeteče numeric(14,6)) — dřív by první řádek
    // zůstal zapsaný a doklad napůl.
    ai.structure.mockResolvedValueOnce({
      supplierName: null,
      supplierIco: null,
      supplierDic: null,
      documentNumber: "X-1",
      documentDate: null,
      paymentMethod: null,
      lines: [rawLine(), rawLine({ description: "Rozbitý řádek", packageQuantity: 1e9, unitsPerPackage: 1e9 })],
      totalWithoutVat: null,
      totalVat: null,
      totalWithVat: null,
    });
    const result = await triggerGoodsReceiptExtraction(draft.receiptId);
    expect(result).toMatchObject({ ok: false, kind: "technical" });

    expect(await rows(`SELECT 1 FROM goods_receipt_lines WHERE receipt_id = $1`, [draft.receiptId])).toEqual([]);
    const [receipt] = await rows<Record<string, unknown>>(
      `SELECT extraction_status, document_number FROM goods_receipts WHERE id = $1`,
      [draft.receiptId]
    );
    expect(receipt).toEqual({ extraction_status: "failed", document_number: null });
  });
});

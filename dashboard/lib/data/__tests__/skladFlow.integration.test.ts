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

const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
const STRELEC = "fdc7b836-2325-4568-b9b7-5ac579cd8972";

async function asUser<T>(userId: string, name: string, fn: () => Promise<T>): Promise<T> {
  const previous = holder.user;
  holder.user = ctxFor(userId, name);
  try {
    return await fn();
  } finally {
    holder.user = previous;
  }
}

async function movementsOf(receiptId: string) {
  return rows<{ direction: string; quantity: string; corrects: boolean; stock_item_id: string }>(
    `SELECT direction, quantity::text AS quantity, corrects_movement_id IS NOT NULL AS corrects, stock_item_id
       FROM stock_movements WHERE receipt_id = $1 ORDER BY recorded_at, direction`,
    [receiptId]
  );
}

function lineInput(line: Record<string, unknown>, overrides: Record<string, string>) {
  return {
    rawDescription: String(line.raw_description),
    supplierItemCode: String(line.supplier_item_code ?? ""),
    supplierAuxiliaryCode: "",
    rawPackageQuantity: String(line.raw_package_quantity),
    rawUnitsPerPackage: String(line.raw_units_per_package),
    rawUnit: String(line.raw_unit),
    normalizedUnit: String(line.normalized_unit),
    unitPriceWithoutVat: String(line.unit_price_without_vat),
    totalWithoutVatHal: (Number(line.total_without_vat_hal) / 100).toFixed(2),
    totalWithVatHal: (Number(line.total_with_vat_hal) / 100).toFixed(2),
    lineKind: String(line.line_kind),
    stockItemId: String(line.stock_item_id ?? ""),
    ...overrides,
  };
}

describe("Sklad 1.0 — nahrání → vytěžení → ruční oprava → potvrzení → storno", DB_TEST, () => {
  it("celý tok: jediný skladový pohyb, druhé potvrzení nic nezdvojí, storno vytvoří jediný opačný pohyb", async () => {
    const sklad = await import("../sklad");
    const { triggerGoodsReceiptExtraction, confirmGoodsReceiptLineMapping } = await import("../skladExtraction");

    const supplier = (await sklad.createSupplier({ name: "Velkoobchod Novák", ico: "12345678", dic: "" })) as { supplierId: string };
    const [location] = await rows<{ id: string }>(`SELECT id FROM stock_locations WHERE code = 'default'`);
    const { receiptId } = (await sklad.createDraftGoodsReceipt({
      supplierId: supplier.supplierId,
      stockLocationId: location.id,
      documentNumber: null,
      documentDate: null,
      dueDate: null,
      paymentMethod: null,
    })) as { receiptId: string };

    // 1) nahrání fotky
    expect(await uploadPage(receiptId, 10)).toMatchObject({ ok: true });

    // 2) vytěžení — AI špatně přečte množství cukru (1 místo 10 balení);
    //    druhý řádek je soukromý nákup (do skladu se nezapíše)
    ai.ocr.mockResolvedValueOnce("Faktura 77/2026 … Cukr 10× … Káva … celkem 254,40 Kč".padEnd(60, "."));
    ai.structure.mockResolvedValueOnce({
      supplierName: "Velkoobchod Novák",
      supplierIco: "12345678",
      supplierDic: null,
      documentNumber: "77/2026",
      documentDate: "2026-10-18",
      paymentMethod: null,
      lines: [
        rawLine({ description: "Cukr krystal", packageQuantity: 1, totalWithoutVat: 20, totalWithVat: 22.4 }),
        rawLine({ description: "Káva do auta", supplierItemCode: "K-1", packageQuantity: 1, unit: "ks", totalWithoutVat: 26.55, totalWithVat: 30.4, suggestedCategory: "non_stock_private" }),
      ],
      totalWithoutVat: 226.55,
      totalVat: 27.85,
      totalWithVat: 254.4,
    });
    expect(await triggerGoodsReceiptExtraction(receiptId)).toEqual({ ok: true });
    const [sugar, coffee] = await rows<Record<string, unknown>>(
      `SELECT * FROM goods_receipt_lines WHERE receipt_id = $1 ORDER BY position`,
      [receiptId]
    );

    // návrh sám o sobě potvrdit nejde (DPH ani karta nejsou potvrzené člověkem)
    let checks = (await sklad.getGoodsReceiptConfirmationCheck(receiptId))!;
    expect(checks.blockers.map((b) => b.code)).toEqual(["vat_unconfirmed", "unmapped"]);
    expect(checks.warnings.map((w) => w.key)).toEqual(["totals_mismatch:25440:5280"]);
    expect(checks.warnings[0].message).toBe(
      "Součet řádků 52,80 Kč nesouhlasí s celkem na dokladu 254,40 Kč (rozdíl −201,60 Kč). Zkontrolujte, že žádný řádek nechybí ani nepřebývá."
    );
    expect(await sklad.confirmGoodsReceipt(receiptId, { acknowledgedWarnings: ["totals_mismatch:25440:5280"] })).toMatchObject({ ok: false });
    expect(await movementsOf(receiptId)).toEqual([]);

    // 3) ruční oprava: 10 balení, 200 / 224 Kč; karta suroviny; DPH u obou řádků
    expect(
      await sklad.updateGoodsReceiptLine(receiptId, String(sugar.id), lineInput(sugar, { rawPackageQuantity: "10", totalWithoutVatHal: "200", totalWithVatHal: "224" }))
    ).toEqual({ ok: true });
    const card = (await sklad.createStockItem({ name: "Cukr", canonicalUnit: "kg", kind: "stock_material" })) as { stockItemId: string };
    expect(await confirmGoodsReceiptLineMapping(receiptId, String(sugar.id), { stockItemId: card.stockItemId, lineKind: "stock_material", rememberMapping: true })).toEqual({ ok: true });
    expect(await confirmGoodsReceiptLineMapping(receiptId, String(coffee.id), { stockItemId: null, lineKind: "non_stock_private", rememberMapping: false })).toEqual({ ok: true });
    expect(await sklad.reviewGoodsReceiptLineVat(receiptId, String(sugar.id), { totalWithoutVatHal: "200", totalWithVatHal: "224" })).toEqual({ ok: true });
    expect(await sklad.reviewGoodsReceiptLineVat(receiptId, String(coffee.id), { totalWithoutVatHal: "26.55", totalWithVatHal: "30.40" })).toEqual({ ok: true });

    checks = (await sklad.getGoodsReceiptConfirmationCheck(receiptId))!;
    expect(checks).toMatchObject({ blockers: [], warnings: [], linesTotalHal: 25440, documentTotalHal: 25440 });

    // 4) Střelec (jen čtení) ani nikdo bez oprávnění potvrdit nemůže
    await expect(asUser(STRELEC, "Jiří Střelec", () => sklad.confirmGoodsReceipt(receiptId, { acknowledgedWarnings: [] }))).rejects.toThrow();

    // 5) potvrzení → jediný skladový pohyb (káva je soukromá), 10 kg cukru
    expect(await sklad.confirmGoodsReceipt(receiptId, { acknowledgedWarnings: [] })).toEqual({ ok: true, movements: 1 });
    expect(await movementsOf(receiptId)).toEqual([{ direction: "in", quantity: "10.000000", corrects: false, stock_item_id: card.stockItemId }]);
    const [confirmed] = await rows<Record<string, unknown>>(
      `SELECT status, total_with_vat_hal::int AS total, confirmed_by_user_id FROM goods_receipts WHERE id = $1`,
      [receiptId]
    );
    expect(confirmed).toEqual({ status: "confirmed", total: 25440, confirmed_by_user_id: VINER });

    // 6) druhé potvrzení nic nezdvojí
    const again = await sklad.confirmGoodsReceipt(receiptId, { acknowledgedWarnings: [] });
    expect(again).toMatchObject({ ok: false, error: "Příjemka už byla potvrzena nebo stornována." });
    expect(await movementsOf(receiptId)).toHaveLength(1);

    // 7) storno smí jen Viner/Königsbergová; Blahout ne
    await expect(asUser(BLAHOUT, "Blahout", () => sklad.voidGoodsReceipt(receiptId, "chyba"))).rejects.toThrow();
    expect(await sklad.voidGoodsReceipt(receiptId, "Doklad patří jiné provozovně")).toEqual({ ok: true, corrections: 1 });
    const afterVoid = await movementsOf(receiptId);
    expect(afterVoid).toHaveLength(2);
    expect(afterVoid.filter((m) => m.corrects)).toEqual([{ direction: "out", quantity: "10.000000", corrects: true, stock_item_id: card.stockItemId }]);
    const [balance] = await rows<{ q: string }>(`SELECT current_quantity::text AS q FROM stock_item_balances WHERE stock_item_id = $1`, [card.stockItemId]);
    expect(Number(balance.q)).toBe(0);

    // 8) druhé storno nic nezdvojí
    expect(await sklad.voidGoodsReceipt(receiptId, "znovu")).toEqual({ ok: false, error: "Příjemka už je stornovaná." });
    expect(await movementsOf(receiptId)).toHaveLength(2);

    const history = await rows<{ kind: string }>(`SELECT kind FROM goods_receipt_activity WHERE receipt_id = $1 ORDER BY created_at`, [receiptId]);
    expect(history.map((h) => h.kind)).toEqual(["created", "line_added", "confirmed", "voided"]);
  });
});

// --- Přímé založení příjemky do DB pro kontroly potvrzení -----------------

async function seedReceipt(opts: {
  supplierId: string;
  number: string | null;
  date: string | null;
  documentTotalHal: number | null;
  lines: Array<{ grossHal: number; unit?: string; cardId: string }>;
}): Promise<string> {
  const [location] = await rows<{ id: string }>(`SELECT id FROM stock_locations WHERE code = 'default'`);
  const [receipt] = await rows<{ id: string }>(
    `INSERT INTO goods_receipts (supplier_id, supplier_name_snapshot, stock_location_id, document_number, document_date, document_total_with_vat_hal, created_by_user_id)
     VALUES ($1, 'Dodavatel', $2, $3, $4, $5, $6) RETURNING id`,
    [opts.supplierId, location.id, opts.number, opts.date, opts.documentTotalHal, VINER]
  );
  let position = 0;
  for (const line of opts.lines) {
    position += 1;
    await pg.query(
      `INSERT INTO goods_receipt_lines (receipt_id, position, raw_description, raw_package_quantity, raw_units_per_package, raw_unit,
         normalized_quantity, normalized_unit, unit_price_without_vat, total_without_vat_hal, vat_hal, total_with_vat_hal,
         computed_vat_rate_percent, vat_confirmed, stock_item_id, line_kind, mapping_source)
       VALUES ($1, $2, $3, 1, 1, $4, 1, $4, 1, $5, 0, $5, 0, true, $6, 'stock_material', 'manual')`,
      [receipt.id, position, `Položka ${position}`, line.unit ?? "kg", line.grossHal, line.cardId]
    );
  }
  return receipt.id;
}

describe("Sklad 1.0 — kontroly před potvrzením (součet, jednotky, duplicity)", DB_TEST, () => {
  let supplierId: string;
  let cardId: string;

  beforeAll(async () => {
    [{ id: supplierId }] = await rows<{ id: string }>(
      `INSERT INTO suppliers (name, name_normalized, ico) VALUES ('Penny Market', 'penny market', '64945880') RETURNING id`
    );
    [{ id: cardId }] = await rows<{ id: string }>(
      `INSERT INTO stock_items (name, canonical_unit, kind) VALUES ('Mouka', 'kg', 'stock_material') RETURNING id`
    );
  });

  it("nesoulad součtu a doklad bez čísla: bez výslovného souhlasu NEPROJDE; souhlas k jiným hodnotám neplatí; se souhlasem projde a uloží se do historie", async () => {
    const sklad = await import("../sklad");
    const receiptId = await seedReceipt({ supplierId, number: null, date: "2026-10-01", documentTotalHal: 10000, lines: [{ grossHal: 9000, cardId }] });

    const checks = (await sklad.getGoodsReceiptConfirmationCheck(receiptId))!;
    expect(checks.blockers).toEqual([]);
    expect(checks.warnings.map((w) => w.key)).toEqual(["totals_mismatch:10000:9000", "document_number_missing"]);

    const noAck = await sklad.confirmGoodsReceipt(receiptId, { acknowledgedWarnings: [] });
    expect(noAck).toMatchObject({ ok: false });
    expect((noAck as { checks: { warnings: unknown[] } }).checks.warnings).toHaveLength(2);

    // souhlas k jinému nesouladu (mezitím se změnil řádek) neplatí
    const stale = await sklad.confirmGoodsReceipt(receiptId, { acknowledgedWarnings: ["totals_mismatch:10000:8000", "document_number_missing"] });
    expect(stale.ok).toBe(false);
    // jen jedno ze dvou varování nestačí
    expect((await sklad.confirmGoodsReceipt(receiptId, { acknowledgedWarnings: ["document_number_missing"] })).ok).toBe(false);
    expect(await movementsOf(receiptId)).toEqual([]);

    const ok = await sklad.confirmGoodsReceipt(receiptId, { acknowledgedWarnings: ["totals_mismatch:10000:9000", "document_number_missing"] });
    expect(ok).toEqual({ ok: true, movements: 1 });
    const [activity] = await rows<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM goods_receipt_activity WHERE receipt_id = $1 AND kind = 'confirmed'`,
      [receiptId]
    );
    expect(activity.metadata).toMatchObject({
      acknowledgedWarnings: ["totals_mismatch:10000:9000", "document_number_missing"],
      linesTotalHal: 9000,
      documentTotalHal: 10000,
      movements: 1,
    });
  });

  it("chybějící celková částka dokladu je varování k odsouhlasení (součet nejde ověřit)", async () => {
    const sklad = await import("../sklad");
    const receiptId = await seedReceipt({ supplierId, number: "P-1", date: "2026-10-02", documentTotalHal: null, lines: [{ grossHal: 1500, cardId }] });
    const checks = (await sklad.getGoodsReceiptConfirmationCheck(receiptId))!;
    expect(checks.warnings.map((w) => w.key)).toEqual(["document_total_missing:1500"]);
    expect(checks.warnings[0].message).toBe("Celková částka dokladu není zadaná — součet řádků 15,00 Kč nelze ověřit proti dokladu.");
  });

  it("jednotka řádku jiná než jednotka karty je překážka (nejde odsouhlasit)", async () => {
    const sklad = await import("../sklad");
    const receiptId = await seedReceipt({ supplierId, number: "P-2", date: "2026-10-03", documentTotalHal: 500, lines: [{ grossHal: 500, unit: "bg", cardId }] });
    const checks = (await sklad.getGoodsReceiptConfirmationCheck(receiptId))!;
    expect(checks.blockers).toEqual([
      { code: "unit_mismatch", message: "Jednotka řádku neodpovídá jednotce skladové karty u: „Položka 1“ (bg × kg) — přepočtěte množství na jednotku karty." },
    ]);
    const result = await sklad.confirmGoodsReceipt(receiptId, { acknowledgedWarnings: ["unit_mismatch"] });
    expect(result.ok).toBe(false);
    expect(await movementsOf(receiptId)).toEqual([]);
  });

  it("duplicita: dodavatel + číslo + datum + částka = překážka; stejné číslo s jinou částkou = varování; stejné datum a částka bez čísla = varování", async () => {
    const sklad = await import("../sklad");
    const original = await seedReceipt({ supplierId, number: "U-555", date: "2026-10-05", documentTotalHal: 4200, lines: [{ grossHal: 4200, cardId }] });
    expect(await sklad.confirmGoodsReceipt(original, { acknowledgedWarnings: [] })).toEqual({ ok: true, movements: 1 });

    // úplně stejný doklad → překážka, souhlas nepomůže
    const same = await seedReceipt({ supplierId, number: "u-555 ", date: "2026-10-05", documentTotalHal: 4200, lines: [{ grossHal: 4200, cardId }] });
    const sameChecks = (await sklad.getGoodsReceiptConfirmationCheck(same))!;
    expect(sameChecks.blockers.map((b) => b.code)).toEqual(["duplicate"]);
    expect(sameChecks.blockers[0].message).toContain("č. U-555, 2026-10-05, 42,00 Kč");
    expect((await sklad.confirmGoodsReceipt(same, { acknowledgedWarnings: sameChecks.warnings.map((w) => w.key) })).ok).toBe(false);

    // stejné číslo, jiný den (pokladna čísla opakuje) → varování, se souhlasem projde
    const sameNumber = await seedReceipt({ supplierId, number: "U-555", date: "2026-10-06", documentTotalHal: 1000, lines: [{ grossHal: 1000, cardId }] });
    const numberChecks = (await sklad.getGoodsReceiptConfirmationCheck(sameNumber))!;
    expect(numberChecks.blockers).toEqual([]);
    expect(numberChecks.warnings.map((w) => w.key)).toEqual([`same_number:${original}`]);
    expect((await sklad.confirmGoodsReceipt(sameNumber, { acknowledgedWarnings: [] })).ok).toBe(false);
    expect(await sklad.confirmGoodsReceipt(sameNumber, { acknowledgedWarnings: [`same_number:${original}`] })).toEqual({ ok: true, movements: 1 });

    // bez čísla, stejné datum i částka jako potvrzený doklad → dvě varování
    const noNumber = await seedReceipt({ supplierId, number: null, date: "2026-10-05", documentTotalHal: 4200, lines: [{ grossHal: 4200, cardId }] });
    const noNumberChecks = (await sklad.getGoodsReceiptConfirmationCheck(noNumber))!;
    expect(noNumberChecks.warnings.map((w) => w.key)).toEqual(["document_number_missing", `same_date_total:${original}`]);

    // po stornu originálu se stejný doklad potvrdit smí (oprava přes storno)
    expect(await sklad.voidGoodsReceipt(original, "nahrazeno opravou")).toEqual({ ok: true, corrections: 1 });
    // zbývá jen varování o mezitím potvrzeném dokladu se stejným číslem (jiný den)
    const afterVoid = await sklad.confirmGoodsReceipt(same, { acknowledgedWarnings: [`same_number:${sameNumber}`] });
    expect(afterVoid, JSON.stringify(afterVoid)).toEqual({ ok: true, movements: 1 });
  });

  it("DB pojistka: úplně stejný potvrzený doklad nepustí ani přímý zápis mimo aplikaci", async () => {
    const a = await seedReceipt({ supplierId, number: "Z-1", date: "2026-10-07", documentTotalHal: 700, lines: [{ grossHal: 700, cardId }] });
    const b = await seedReceipt({ supplierId, number: "Z-1", date: "2026-10-07", documentTotalHal: 700, lines: [{ grossHal: 700, cardId }] });
    const confirm = `UPDATE goods_receipts SET status = 'confirmed', confirmed_by_user_id = 'x', confirmed_at = now(), total_with_vat_hal = 700 WHERE id = $1`;
    await pg.query(confirm, [a]);
    await expect(pg.query(confirm, [b])).rejects.toThrow(/goods_receipts_confirmed_document_once_key/);
  });

  it("hlavička dokladu: oprava čísla, data a celkové částky jen u návrhu; neplatné datum se odmítne", async () => {
    const sklad = await import("../sklad");
    const receiptId = await seedReceipt({ supplierId, number: null, date: null, documentTotalHal: null, lines: [{ grossHal: 1234, cardId }] });
    expect(await sklad.updateGoodsReceiptHeader(receiptId, { documentNumber: " F-9 ", documentDate: "2026-02-30", documentTotalWithVat: "12,34" })).toEqual({
      ok: false,
      error: "Datum dokladu musí být platné datum.",
    });
    expect(await sklad.updateGoodsReceiptHeader(receiptId, { documentNumber: " F-9 ", documentDate: "2026-10-09", documentTotalWithVat: "12,34" })).toEqual({ ok: true });
    const checks = (await sklad.getGoodsReceiptConfirmationCheck(receiptId))!;
    expect(checks).toMatchObject({ blockers: [], warnings: [], documentTotalHal: 1234 });
    expect(await sklad.confirmGoodsReceipt(receiptId, { acknowledgedWarnings: [] })).toEqual({ ok: true, movements: 1 });
    expect(await sklad.updateGoodsReceiptHeader(receiptId, { documentNumber: "F-10", documentDate: "", documentTotalWithVat: "" })).toEqual({
      ok: false,
      error: "Hlavičku lze upravit jen u návrhu příjemky.",
    });
  });
});

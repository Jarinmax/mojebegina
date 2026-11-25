// Sklad surovin a obalů přes asistenta (Lucie 25. 11. 2026) — příjem zadaný
// SLOVY v chatu („přišlo 2 × 5 l jablečno-malinové šťávy“), bez dodacího
// listu. Používá stávající Sklad 1.0 (lib/data/sklad.ts): dodavatel → návrh
// příjemky → ruční řádky → revize DPH → potvrzení. Každá z těch funkcí si
// sama kontroluje oprávnění (skladAuth), takže asistent smí jen to, co smí
// přihlášený člověk v Řízení firmy → Sklad.
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { goodsReceiptActivity } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/data/authContext";
import { canConfirmGoodsReceipt, canViewPricesAndOriginal } from "@/lib/data/skladAuth";
import {
  addManualGoodsReceiptLine,
  confirmGoodsReceipt,
  createDraftGoodsReceipt,
  createStockItem,
  createSupplier,
  getGoodsReceiptConfirmationCheck,
  listStockItems,
  listStockLocations,
  listSuppliers,
  reviewGoodsReceiptLineVat,
} from "@/lib/data/sklad";
import { STOCK_ITEM_KINDS, type StockItemKind } from "@/lib/data/skladValidation";
import { ArgError, idempotencyKey } from "../args";
import { defineTool, type AgentTool, type ToolOutcome } from "../define";

const PAGE = "https://moje.begina.cz/rizeni-firmy/sklad";
const DENIED = "Sklad smí přes asistenta zapisovat jen Jaroslav Viner, Lucie Königsbergová a Jaroslav Blahout.";
const KEY_ACTIVITY = "agent_idempotency";

const norm = (s: string) => s.trim().toLocaleLowerCase("cs").replace(/\s+/g, " ");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UNIT_RE = /^[a-z][a-z0-9_]*$/;

type ReceiptLineArg = {
  name: string;
  kind: StockItemKind;
  unit: string;
  packages: number;
  unitsPerPackage: number;
  packageLabel: string;
  totalKc: number;
};

type ReceiptArgs = {
  supplierName: string;
  documentNumber: string | null;
  documentDate: string | null;
  lines: ReceiptLineArg[];
  key: string;
};

function positive(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) throw new ArgError(`${label} musí být kladné číslo.`);
  return n;
}

export function parseReceiptArgs(args: Record<string, unknown>): ReceiptArgs {
  const supplierName = typeof args.supplier_name === "string" ? args.supplier_name.trim() : "";
  if (!supplierName) throw new ArgError("Chybí supplier_name (od koho to přišlo).");
  const documentNumber = typeof args.document_number === "string" && args.document_number.trim() ? args.document_number.trim().slice(0, 100) : null;
  const documentDate = typeof args.document_date === "string" && args.document_date.trim() ? args.document_date.trim() : null;
  if (documentDate && !DATE_RE.test(documentDate)) throw new ArgError("document_date musí být RRRR-MM-DD.");
  const raw = Array.isArray(args.lines) ? (args.lines as Record<string, unknown>[]) : [];
  if (raw.length === 0 || raw.length > 30) throw new ArgError("lines musí mít 1–30 položek.");
  const lines = raw.map((l, i) => {
    const name = typeof l.name === "string" ? l.name.trim() : "";
    if (!name) throw new ArgError(`Položka ${i + 1}: chybí name.`);
    const kind = (typeof l.kind === "string" ? l.kind : "stock_material") as StockItemKind;
    if (!STOCK_ITEM_KINDS.includes(kind)) throw new ArgError(`Položka ${i + 1}: kind musí být ${STOCK_ITEM_KINDS.join(", ")}.`);
    const unit = typeof l.unit === "string" ? l.unit.trim().toLowerCase() : "";
    if (!UNIT_RE.test(unit)) throw new ArgError(`Položka ${i + 1}: unit musí být např. kg, l, ks.`);
    const totalKc = typeof l.total_kc === "number" ? l.total_kc : Number(String(l.total_kc ?? "").replace(",", "."));
    if (!Number.isFinite(totalKc) || totalKc < 0) throw new ArgError(`Položka ${i + 1}: total_kc musí být nezáporné číslo.`);
    return {
      name,
      kind,
      unit,
      packages: positive(l.packages, `Položka ${i + 1}: packages`),
      unitsPerPackage: positive(l.units_per_package, `Položka ${i + 1}: units_per_package`),
      packageLabel: typeof l.package_label === "string" && l.package_label.trim() ? l.package_label.trim() : "balení",
      totalKc,
    };
  });
  return { supplierName, documentNumber, documentDate, lines, key: idempotencyKey(args) };
}

async function findReceiptByKey(key: string): Promise<string | null> {
  const [row] = await db
    .select({ receiptId: goodsReceiptActivity.receiptId })
    .from(goodsReceiptActivity)
    .where(and(eq(goodsReceiptActivity.kind, KEY_ACTIVITY), sql`${goodsReceiptActivity.metadata}->>'key' = ${key}`))
    .limit(1);
  return row?.receiptId ?? null;
}

type BalanceRow = { name: string; unit: string; kind: string; quantity: string | number | null; last_in: string | null };

async function stockBalances(): Promise<BalanceRow[]> {
  const result = await db.execute<BalanceRow>(sql`
    SELECT i.name, i.canonical_unit AS unit, i.kind,
           COALESCE(SUM(CASE WHEN m.direction = 'in' THEN m.quantity ELSE -m.quantity END), 0) AS quantity,
           MAX(CASE WHEN m.direction = 'in' THEN m.occurred_at END)::text AS last_in
    FROM stock_items i
    LEFT JOIN stock_movements m ON m.stock_item_id = i.id
    WHERE i.is_active
    GROUP BY i.id, i.name, i.canonical_unit, i.kind
    ORDER BY i.name`);
  return result.rows;
}

export const SKLAD_TOOLS: AgentTool[] = [
  defineTool({
    name: "list_stock",
    title: "Sklad surovin a obalů — stav",
    description: "JEN ČTENÍ — skladové karty surovin a obalů a jejich aktuální množství (součet příjmů a výdejů) s datem posledního příjmu.",
    write: false,
    visible: (ctx) => canViewPricesAndOriginal(ctx),
    properties: {},
    required: [],
    parse: () => null,
    execute: async () => {
      const ctx = await getAuthContext();
      if (!ctx || !canViewPricesAndOriginal(ctx)) return { ok: false, error: DENIED };
      const rows = await stockBalances();
      return {
        ok: true,
        summary: { items: rows.length },
        data: { items: rows.map((r) => ({ name: r.name, unit: r.unit, kind: r.kind, quantity: Number(r.quantity ?? 0), lastReceipt: r.last_in })), url: PAGE },
      };
    },
  }),
  defineTool({
    name: "record_stock_receipt",
    title: "Sklad — zapsat příjem surovin/obalů",
    description:
      "ZÁPIS — zapíše a rovnou potvrdí příjem surovin nebo obalů na sklad, zadaný slovy (dodací list není potřeba). Skladová karta i dodavatel se najdou podle názvu, nebo se založí. Každá položka: name (název skladové karty, např. „Kapsička stříbrná 250 ml“), kind (stock_material = surovina, operating_supply = obal/provozní, resale_goods = zboží), unit (skladová jednotka: kg, l, ks), packages (počet balení), units_per_package (kolik jednotek je v balení), package_label (např. „balení 25 ks“), total_kc (cena celkem v Kč za položku; Begina je neplátce DPH, celé jako cena). Před zápisem uživateli ukaž náhled (dodavatel, položky, množství, ceny) a volej až po jeho „ano“. Storno jde jen v Řízení firmy → Sklad.",
    write: true,
    visible: (ctx) => canConfirmGoodsReceipt(ctx),
    properties: {
      supplier_name: { type: "string", description: "Od koho to přišlo (např. „Obalia“, „Allegro“)." },
      document_number: { type: "string", description: "Číslo objednávky nebo dokladu, když je (nepovinné)." },
      document_date: { type: "string", description: "Datum dokladu/příjmu RRRR-MM-DD (nepovinné)." },
      lines: {
        type: "array",
        description: "Položky příjmu.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            kind: { type: "string", enum: [...STOCK_ITEM_KINDS] },
            unit: { type: "string", description: "kg, l, ks…" },
            packages: { type: "number" },
            units_per_package: { type: "number" },
            package_label: { type: "string" },
            total_kc: { type: "number" },
          },
          required: ["name", "kind", "unit", "packages", "units_per_package", "total_kc"],
        },
      },
    },
    required: ["supplier_name", "lines"],
    parse: parseReceiptArgs,
    execute: async (input): Promise<ToolOutcome> => {
      const ctx = await getAuthContext();
      if (!ctx || !canConfirmGoodsReceipt(ctx)) return { ok: false, error: DENIED };

      const existing = await findReceiptByKey(input.key);
      if (existing) {
        return { ok: true, summary: { created: false }, data: { created: false, receiptId: existing, message: "Tento příjem už byl zapsaný dřív (stejný idempotency_key) — nic se nezapsalo podruhé.", url: `${PAGE}/prijemky/${existing}` } };
      }

      const suppliers = await listSuppliers();
      let supplierId = suppliers.find((s) => norm(s.name) === norm(input.supplierName))?.id ?? null;
      if (!supplierId) {
        const created = await createSupplier({ name: input.supplierName, ico: "", dic: "" });
        if (!created.ok) return { ok: false, error: created.error };
        supplierId = created.supplierId;
      }
      const [location] = await listStockLocations();
      if (!location) return { ok: false, error: "Ve skladu chybí skladová lokace." };

      const draft = await createDraftGoodsReceipt({
        supplierId,
        stockLocationId: location.id,
        documentNumber: input.documentNumber,
        documentDate: input.documentDate,
        dueDate: null,
        paymentMethod: null,
      });
      if (!draft.ok) return { ok: false, error: draft.error };
      const receiptId = draft.receiptId;
      await db.insert(goodsReceiptActivity).values({
        receiptId,
        actorType: "user",
        authorUserId: ctx.userId,
        authorName: ctx.name,
        kind: KEY_ACTIVITY,
        metadata: { key: input.key, source: "agent" },
      });

      const fail = (error: string): ToolOutcome => ({ ok: false as const, error: `${error} Návrh příjemky zůstal neuložený na skladě: ${PAGE}/prijemky/${receiptId}` });
      const items = await listStockItems();
      const written: Array<{ name: string; quantity: number; unit: string; totalKc: number }> = [];
      for (const line of input.lines) {
        let item = items.find((i) => norm(i.name) === norm(line.name));
        if (item && item.canonicalUnit !== line.unit) return fail(`Skladová karta „${item.name}“ vede ${item.canonicalUnit}, ne ${line.unit}.`);
        if (!item) {
          const created = await createStockItem({ name: line.name, canonicalUnit: line.unit, kind: line.kind });
          if (!created.ok) return fail(created.error);
          item = { id: created.stockItemId, name: line.name, canonicalUnit: line.unit, kind: line.kind };
          items.push(item);
        }
        const quantity = line.packages * line.unitsPerPackage;
        const total = line.totalKc.toFixed(2);
        const added = await addManualGoodsReceiptLine(receiptId, {
          rawDescription: line.name,
          supplierItemCode: "",
          supplierAuxiliaryCode: "",
          rawPackageQuantity: String(line.packages),
          rawUnitsPerPackage: String(line.unitsPerPackage),
          rawUnit: line.packageLabel,
          normalizedUnit: line.unit,
          unitPriceWithoutVat: String(Math.round((line.totalKc / quantity) * 10000) / 10000),
          totalWithoutVatHal: total,
          totalWithVatHal: total,
          lineKind: item.kind,
          stockItemId: item.id,
        });
        if (!added.ok) return fail(added.error);
        const vat = await reviewGoodsReceiptLineVat(receiptId, added.lineId, { totalWithoutVatHal: total, totalWithVatHal: total });
        if (!vat.ok) return fail(vat.error);
        written.push({ name: item.name, quantity, unit: item.canonicalUnit, totalKc: line.totalKc });
      }

      const checks = await getGoodsReceiptConfirmationCheck(receiptId);
      if (!checks) return fail("Příjemku se nepodařilo zkontrolovat.");
      if (checks.blockers.length > 0) return fail(checks.blockers.map((b) => b.message).join(" "));
      const confirmed = await confirmGoodsReceipt(receiptId, { acknowledgedWarnings: checks.warnings.map((w) => w.key) });
      if (!confirmed.ok) return fail(confirmed.error);

      return {
        ok: true,
        summary: { created: true, movements: confirmed.movements },
        data: {
          created: true,
          receiptId,
          supplier: input.supplierName,
          lines: written,
          totalKc: Math.round(written.reduce((s, l) => s + l.totalKc, 0) * 100) / 100,
          message: `Příjem zapsán na sklad (${confirmed.movements} položek).`,
          url: `${PAGE}/prijemky/${receiptId}`,
        },
      };
    },
  }),
];

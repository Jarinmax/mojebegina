// POKLADNA BISTRA — čtení a zápis (menu, účtenky, uzávěrka, zápis do Financí).
// Volající MUSÍ předem ověřit oprávnění (lib/pokladna/posAuth.ts).
import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { economyEntries, posDayCloses, posItems, posReceiptLines, posReceipts } from "@/lib/db/schema";
import { todayPrague } from "@/lib/projekt/projectServer";
import { monthlyIncome, summarizeDay, type DaySummary, type PosPaymentMethod } from "./pos";

export { todayPrague };

export const POS_SYNC_KEY = "pos_economy_sync";
export const NO_POS_TABLES = "Pokladna v databázi ještě není — tabulky se založí samy při příštím nasazení (migrace 0068).";

export async function posTablesExist(): Promise<boolean> {
  const result = await db.execute(sql`SELECT to_regclass('public.pos_receipts') IS NOT NULL AS present`);
  return (result.rows?.[0] as { present?: boolean } | undefined)?.present === true;
}

// --- Menu ------------------------------------------------------------

export type PosItem = { id: string; category: string; name: string; priceHal: number; sortOrder: number; active: boolean };

export async function listItems(activeOnly: boolean): Promise<PosItem[]> {
  const rows = await db
    .select()
    .from(posItems)
    .where(activeOnly ? eq(posItems.active, true) : undefined)
    .orderBy(asc(posItems.category), asc(posItems.sortOrder), asc(posItems.name));
  return rows.map((r) => ({ id: r.id, category: r.category, name: r.name, priceHal: r.priceHal, sortOrder: r.sortOrder, active: r.active }));
}

export async function saveItem(input: { id?: string; category: string; name: string; priceHal: number; sortOrder: number }): Promise<void> {
  if (input.id) {
    await db
      .update(posItems)
      .set({ category: input.category, name: input.name, priceHal: input.priceHal, sortOrder: input.sortOrder, updatedAt: new Date() })
      .where(eq(posItems.id, input.id));
  } else {
    await db.insert(posItems).values({ category: input.category, name: input.name, priceHal: input.priceHal, sortOrder: input.sortOrder });
  }
}

export async function setItemActive(id: string, active: boolean): Promise<void> {
  await db.update(posItems).set({ active, updatedAt: new Date() }).where(eq(posItems.id, id));
}

// --- Účtenky ---------------------------------------------------------

export type NewReceipt = {
  lines: Array<{ itemId: string; quantity: number }>;
  paymentMethod: PosPaymentMethod;
  cashGivenHal: number | null;
  note: string | null;
  cashierUserId: string;
  cashierName: string | null;
};

export type CreateResult = { ok: true; id: string; year: number; seq: number; totalHal: number } | { ok: false; error: string };

/** Ceny se berou z menu v databázi (ne z tabletu); pořadové číslo v roce. */
export async function createReceipt(input: NewReceipt): Promise<CreateResult> {
  const qty = new Map<string, number>();
  for (const l of input.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0 || l.quantity > 999) return { ok: false, error: "Neplatný počet kusů." };
    qty.set(l.itemId, (qty.get(l.itemId) ?? 0) + l.quantity);
  }
  if (qty.size === 0) return { ok: false, error: "Účet je prázdný." };
  const items = await db.select().from(posItems).where(inArray(posItems.id, [...qty.keys()]));
  if (items.length !== qty.size || items.some((i) => !i.active)) return { ok: false, error: "Některá položka už v menu není — obnovte stránku." };
  const lines = items.map((i) => ({ itemId: i.id, name: i.name, unitPriceHal: i.priceHal, quantity: qty.get(i.id)!, lineTotalHal: i.priceHal * qty.get(i.id)! }));
  const totalHal = lines.reduce((s, l) => s + l.lineTotalHal, 0);
  if (input.paymentMethod === "cash" && input.cashGivenHal !== null && input.cashGivenHal < totalHal) return { ok: false, error: "Zákazník dal méně, než je k zaplacení." };

  const businessDate = todayPrague();
  const year = Number(businessDate.slice(0, 4));
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = crypto.randomUUID();
    try {
      const [{ seq }] = (
        await db.execute(sql`SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM pos_receipts WHERE year = ${year}`)
      ).rows as Array<{ seq: number | string }>;
      await db.batch([
        db.insert(posReceipts).values({
          id,
          year,
          seq: Number(seq),
          businessDate,
          paymentMethod: input.paymentMethod,
          totalHal,
          cashGivenHal: input.paymentMethod === "cash" ? input.cashGivenHal : null,
          note: input.note,
          cashierUserId: input.cashierUserId,
          cashierName: input.cashierName,
          eetStatus: "pending",
        }),
        db.insert(posReceiptLines).values(lines.map((l) => ({ ...l, receiptId: id }))),
      ]);
      return { ok: true, id, year, seq: Number(seq), totalHal };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("pos_receipts_year_seq")) throw error;
    }
  }
  return { ok: false, error: "Účtenku se nepodařilo uložit (souběh), zkuste to znovu." };
}

export type ReceiptDetail = {
  id: string;
  year: number;
  seq: number;
  businessDate: string;
  createdAt: Date;
  paymentMethod: PosPaymentMethod;
  totalHal: number;
  cashGivenHal: number | null;
  note: string | null;
  cashierName: string | null;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  lines: Array<{ name: string; unitPriceHal: number; quantity: number; lineTotalHal: number }>;
};

export async function getReceipt(id: string): Promise<ReceiptDetail | null> {
  const [r] = await db.select().from(posReceipts).where(eq(posReceipts.id, id)).limit(1);
  if (!r) return null;
  const lines = await db.select().from(posReceiptLines).where(eq(posReceiptLines.receiptId, id)).orderBy(asc(posReceiptLines.name));
  return {
    id: r.id,
    year: r.year,
    seq: r.seq,
    businessDate: r.businessDate,
    createdAt: r.createdAt,
    paymentMethod: r.paymentMethod as PosPaymentMethod,
    totalHal: r.totalHal,
    cashGivenHal: r.cashGivenHal,
    note: r.note,
    cashierName: r.cashierName,
    cancelledAt: r.cancelledAt,
    cancelledByName: r.cancelledByName,
    cancelReason: r.cancelReason,
    lines: lines.map((l) => ({ name: l.name, unitPriceHal: l.unitPriceHal, quantity: l.quantity, lineTotalHal: l.lineTotalHal })),
  };
}

export type ReceiptRow = { id: string; year: number; seq: number; createdAt: Date; paymentMethod: PosPaymentMethod; totalHal: number; cancelled: boolean; cashierName: string | null };

export async function listDayReceipts(businessDate: string): Promise<ReceiptRow[]> {
  const rows = await db.select().from(posReceipts).where(eq(posReceipts.businessDate, businessDate)).orderBy(desc(posReceipts.createdAt));
  return rows.map((r) => ({
    id: r.id,
    year: r.year,
    seq: r.seq,
    createdAt: r.createdAt,
    paymentMethod: r.paymentMethod as PosPaymentMethod,
    totalHal: r.totalHal,
    cancelled: r.cancelledAt !== null,
    cashierName: r.cashierName,
  }));
}

/** Storno jen v den tržby a jen před uzávěrkou (pak by nesedla uzávěrka). */
export async function cancelReceipt(id: string, reason: string, byName: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const [r] = await db.select().from(posReceipts).where(eq(posReceipts.id, id)).limit(1);
  if (!r) return { ok: false, error: "Účtenka neexistuje." };
  if (r.cancelledAt) return { ok: false, error: "Účtenka už je stornovaná." };
  if (r.businessDate !== todayPrague()) return { ok: false, error: "Stornovat jde jen dnešní účtenku." };
  if (await getDayClose(r.businessDate)) return { ok: false, error: "Den už je uzavřený — storno po uzávěrce nejde." };
  await db.update(posReceipts).set({ cancelledAt: new Date(), cancelledByName: byName, cancelReason: reason }).where(eq(posReceipts.id, id));
  return { ok: true };
}

// --- Uzávěrka a Finance ---------------------------------------------

export type DayClose = { businessDate: string; cashHal: number; cardHal: number; qrHal: number; receiptCount: number; cashCountedHal: number | null; note: string | null; closedByName: string | null; closedAt: Date };

export async function getDayClose(businessDate: string): Promise<DayClose | null> {
  const [c] = await db.select().from(posDayCloses).where(eq(posDayCloses.businessDate, businessDate)).limit(1);
  return c ? { ...c } : null;
}

export async function daySummary(businessDate: string): Promise<DaySummary> {
  const receipts = await listDayReceipts(businessDate);
  return summarizeDay(receipts);
}

export async function closeDay(input: { businessDate: string; cashCountedHal: number | null; note: string | null; byName: string | null }): Promise<{ ok: true; summary: DaySummary; synced: boolean } | { ok: false; error: string }> {
  if (await getDayClose(input.businessDate)) return { ok: false, error: "Tento den už je uzavřený." };
  const summary = await daySummary(input.businessDate);
  await db.insert(posDayCloses).values({
    businessDate: input.businessDate,
    cashHal: summary.cashHal,
    cardHal: summary.cardHal,
    qrHal: summary.qrHal,
    receiptCount: summary.receiptCount,
    cashCountedHal: input.cashCountedHal,
    note: input.note,
    closedByName: input.byName,
  });
  const synced = await economySyncEnabled() ? await syncMonthToEconomy(input.businessDate.slice(0, 7)) : false;
  return { ok: true, summary, synced };
}

export async function listMonthCloses(month: string): Promise<DayClose[]> {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const rows = await db
    .select()
    .from(posDayCloses)
    .where(and(gte(posDayCloses.businessDate, `${month}-01`), lt(posDayCloses.businessDate, next)))
    .orderBy(asc(posDayCloses.businessDate));
  return rows.map((c) => ({ ...c }));
}

export async function economySyncEnabled(): Promise<boolean> {
  try {
    const result = await db.execute(sql`SELECT value FROM eshop_settings WHERE key = ${POS_SYNC_KEY} LIMIT 1`);
    return (result.rows?.[0] as { value?: string } | undefined)?.value === "on";
  } catch {
    return false;
  }
}

export async function setEconomySync(on: boolean, byName: string | null): Promise<void> {
  await db.execute(sql`
    INSERT INTO eshop_settings (key, value, updated_at, updated_by)
    VALUES (${POS_SYNC_KEY}, ${on ? "on" : "off"}, now(), ${byName})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
  `);
}

/** Jeden řádek „Tržby bistro“ za měsíc (source pokladna, ref bistro-RRRR-MM) — přepíše se po každé uzávěrce. */
export async function syncMonthToEconomy(month: string): Promise<boolean> {
  const income = monthlyIncome(month, await listMonthCloses(month));
  if (!income) return false;
  await db
    .insert(economyEntries)
    .values({
      kind: "income",
      entryDate: income.entryDate,
      title: "Tržby bistro",
      amountHal: income.amountHal,
      paymentForm: "hotově, QR, kartou",
      note: income.note,
      source: "pokladna",
      sourceRef: `bistro-${month}`,
    })
    .onConflictDoUpdate({
      target: [economyEntries.source, economyEntries.sourceRef],
      set: { entryDate: income.entryDate, amountHal: income.amountHal, note: income.note, updatedAt: new Date(), deletedAt: null },
    });
  return true;
}

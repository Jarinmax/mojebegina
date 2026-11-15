// EKONOMIKA 1.0 — čtení a zápis příjmů a nákladů. Volající MUSÍ předem
// ověřit isInvoiceIssuer (jen Jaroslav a Lucie).
import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { economyEntries } from "@/lib/db/schema";
import type { EconomyKind, EconomyRow } from "./economy";

/** false = tabulka v databázi ještě není (skript 114 nebyl spuštěn). */
export async function economyTableExists(): Promise<boolean> {
  const result = await db.execute(sql`SELECT to_regclass('public.economy_entries') IS NOT NULL AS present`);
  const row = (result.rows?.[0] ?? null) as { present?: boolean } | null;
  return row?.present === true;
}

export async function loadEconomyYear(year: number): Promise<EconomyRow[]> {
  const rows = await db
    .select()
    .from(economyEntries)
    .where(and(isNull(economyEntries.deletedAt), gte(economyEntries.entryDate, `${year}-01-01`), lt(economyEntries.entryDate, `${year + 1}-01-01`)))
    .orderBy(asc(economyEntries.entryDate), asc(economyEntries.createdAt));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as EconomyKind,
    entryDate: row.entryDate,
    title: row.title,
    counterparty: row.counterparty,
    amountHal: row.amountHal,
    amountNoShippingHal: row.amountNoShippingHal,
    paymentForm: row.paymentForm,
    invoiceNumber: row.invoiceNumber,
    note: row.note,
    source: row.source,
  }));
}

export type NewEconomyEntry = {
  kind: EconomyKind;
  entryDate: string;
  title: string;
  counterparty: string | null;
  amountHal: number;
  amountNoShippingHal: number | null;
  paymentForm: string | null;
  invoiceNumber: string | null;
  note: string | null;
  createdByUserId: string;
};

export async function insertEconomyEntry(entry: NewEconomyEntry): Promise<void> {
  await db.insert(economyEntries).values({ ...entry, source: "manual" });
}

export async function softDeleteEconomyEntry(id: string): Promise<void> {
  await db.update(economyEntries).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(economyEntries.id, id), isNull(economyEntries.deletedAt)));
}

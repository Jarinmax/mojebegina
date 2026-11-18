import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { invoices, orderActivity, orders } from "@/lib/db/schema";

// „Faktura poslána“ zaškrtnutá automaticky po odeslání faktury e-mailem
// z MojeBegina (Lucie 18. 11. 2026). Samostatný modul bez vazby na
// lib/data/orders.ts, aby ho mohly volat e-maily e-shopu i nástroje asistenta.

type Db = NeonHttpDatabase<typeof schema>;

/**
 * Faktura odešla e-mailem z MojeBegina → „Faktura poslána“ se zaškrtne samo
 * (jen když ještě zaškrtnutá není). Volá se po úspěšném odeslání; chyba
 * zápisu nesmí shodit odeslání — proto vlastní try/catch.
 */
export async function recordInvoiceEmailed(
  database: Db,
  orderIds: string[],
  to: string[],
  actor: { userId: string | null; name: string | null }
): Promise<void> {
  if (orderIds.length === 0) return;
  try {
    const updated = await database
      .update(orders)
      .set({
        invoiceSentAt: new Date(),
        invoiceSentByUserId: actor.userId,
        invoiceSentByName: actor.name ?? "MojeBegina (automaticky)",
        invoiceSentTo: to.join(", ") || null,
        invoiceSentMethod: "email",
      })
      .where(and(inArray(orders.id, orderIds), isNull(orders.invoiceSentAt)))
      .returning({ id: orders.id });
    if (updated.length === 0) return;
    await database.insert(orderActivity).values(
      updated.map((row) => ({
        orderId: row.id,
        actorType: actor.userId ? "user" : "system",
        authorUserId: actor.userId,
        authorName: actor.name ?? "MojeBegina",
        kind: "invoice_sent_marked",
        metadata: { method: "email", to },
      }))
    );
  } catch (error) {
    console.error("Faktura poslána: zaškrtnutí po odeslání e-mailu se nepodařilo", orderIds, error);
  }
}

/** Objednávky v MojeBegina, ke kterým patří faktura s tímto číslem (iDoklad). */
export async function orderIdsForInvoiceNumber(database: Db, invoiceNumber: string): Promise<string[]> {
  const rows = await database
    .select({ orderId: invoices.orderId })
    .from(invoices)
    .where(
      and(
        eq(invoices.invoiceNumber, invoiceNumber),
        isNotNull(invoices.orderId),
        eq(invoices.documentType, "invoice"),
        ne(invoices.docState, "void")
      )
    );
  return [...new Set(rows.map((r) => r.orderId).filter((v): v is string => v !== null))];
}

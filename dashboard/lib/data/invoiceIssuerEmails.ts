// E-maily účtů vystavovatelů faktur (invoiceAuth.ts: Jaroslav Viner, Lucie
// Königsbergová) — smí si navzájem posílat kopie faktur z iDokladu
// (send_idoklad_invoice_email; rozhodnutí majitele 12. 11. 2026).
import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { INVOICE_ISSUERS } from "./invoiceAuth";

export async function invoiceIssuerEmails(): Promise<string[]> {
  const rows = await db.select({ email: userProfiles.email }).from(userProfiles).where(inArray(userProfiles.userId, [...INVOICE_ISSUERS.keys()]));
  return rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean);
}

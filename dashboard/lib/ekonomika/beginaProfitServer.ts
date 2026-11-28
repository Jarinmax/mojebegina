// Načtení faktur roku pro Zisk Beginy (Lucie 28. 11. 2026).
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { ProfitInvoice } from "./beginaProfit";

export async function loadProfitInvoices(year: number): Promise<ProfitInvoice[]> {
  const [own, archive] = await Promise.all([
    db.execute(sql`
      SELECT number, extract(month FROM issue_date)::int AS month, snapshot->'lines' AS lines
      FROM own_invoice_documents
      WHERE state = 'issued' AND coalesce(snapshot->>'kind', 'invoice') = 'invoice' AND extract(year FROM issue_date) = ${year}`),
    db.execute(sql`
      SELECT number, extract(month FROM issue_date)::int AS month,
             coalesce((SELECT jsonb_agg(jsonb_build_object('name', i->>'Name', 'quantity', (i->>'Amount')::numeric, 'totalKc', (i->'Prices'->>'TotalWithVat')::numeric))
                       FROM jsonb_array_elements(raw->'Items') i), '[]'::jsonb) AS lines
      FROM idoklad_archive
      WHERE doc_kind = 'invoice' AND extract(year FROM issue_date) = ${year}`),
  ]);
  type Row = { number: string; month: number; lines: { name: string; quantity: number | string; totalKc: number | string }[] | null };
  const ownRows = own.rows as Row[];
  const ownNumbers = new Set(ownRows.map((r) => r.number));
  const toInvoice = (r: Row): ProfitInvoice => ({
    number: r.number,
    month: Number(r.month),
    lines: (r.lines ?? []).map((l) => ({ name: String(l.name ?? ""), quantity: Number(l.quantity) || 0, totalKc: Number(l.totalKc) || 0 })),
  });
  return [...ownRows.map(toInvoice), ...(archive.rows as Row[]).filter((r) => !ownNumbers.has(r.number)).map(toInvoice)];
}

// Přiřazení kontaktu bez vlastníka tomu, kdo se mu dovolal (rozhodnutí
// Jaroslava Vinera 16. 11. 2026): nové leady (např. z formuláře Meta) jsou
// neutrální, mezi všemi leady. Kdo zavolá a DOVOLÁ SE, tomu se kontakt
// přiřadí — „potenciálně jeho klient“. Vedení ho může kdykoli přeřadit
// (assignLeadOwner). Kontakt, který už vlastníka má, se nemění.
//
// Jeden SQL příkaz: podmíněná změna vlastníka (jen když je prázdný) + záznam
// do historie — souběžné dva hovory přiřadí kontakt jen jednou.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export type ClaimVia = "daily_call" | "lead_detail";

export async function claimUnownedLeadOnReach(
  leadId: string,
  caller: { userId: string; name: string | null },
  via: ClaimVia
): Promise<boolean> {
  const name = caller.name ?? "volající";
  const res = await db.execute<{ id: string }>(sql`
    WITH upd AS (
      UPDATE leads SET owner_user_id = ${caller.userId}, updated_at = now()
       WHERE id = ${leadId}::uuid AND owner_user_id IS NULL
      RETURNING id
    )
    INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata)
    SELECT id, ${caller.userId}, ${caller.name}, 'owner_assigned',
           ${`Kontakt bez vlastníka přiřazen: ${name} — dovolal/a se mu.`},
           jsonb_build_object('ownerUserId', ${caller.userId}::text, 'ownerName', ${name}::text, 'reason', 'reached_call', 'via', ${via}::text)
      FROM upd
    RETURNING lead_id AS id`);
  return res.rows.length > 0;
}

// Jardova karta (audit 15. 11. 2026, rozhodnutí vedení téhož dne) — hlídaná
// migrace a jednorázový úklid dat při buildu na Vercelu, stejný princip jako
// ostatní scripts/migrate-*.mjs:
//   1. migrace 0041: orders.source_lead_id (objednávka soukromé osoby ↔ kontakt)
//      a 0042: seller_reward_assignments (evidence typu odměňování, bod 4 dohody),
//      a 0043: potvrzení návrhu vedením (prodejce typ jen navrhuje),
//   2. úklid dat v JEDNÉ transakci; každý krok je hlídaný podmínkou, takže
//      opakované spuštění nic nezmění a nic se nemaže:
//      a) Jardova karta spolupracovníka (kvůli evidenci výplat odměn),
//      b) VIP Dogs ↔ kontakt Tatiana Lisichkina (převedení na zákazníka),
//      c) objednávka 70000013 ↔ kontakt Monika Chuda (soukromá osoba, bez IČO),
//      d) kontakt „Jaroslav Viner“ (vtip, ne Jardův kontakt) → vlastník Viner,
//      e) VIP Dogs (Tatiana) a Monika Chuda jako „Nový zákazník“ — rozpracované
//         kontakty potvrzené při podpisu dohody 14. 11. 2026 (bod 6),
//         rozhodnutí vedení 15. 11. 2026.
//      Ke každé změně se zapíše záznam do historie kontaktu.
//   • Preview: jen na Neon větvi Preview (DATABASE_URL na produkční timeline →
//     nic se nezmění). Jinde (lokálně, testy) nic.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182"; // ověřeno read-only 27. 10. 2026

export const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
export const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
export const JARDA_CARD_ID = "6a617264-612d-4000-8000-000000000001";
// ID ověřená read-only v Production 15. 11. 2026
export const LEAD_TATIANA = "59d3e1f5-efab-4771-a798-d4a63052abbb";
export const ORG_VIP_DOGS = "62e8cddb-a7b1-4941-a052-2e98658917af";
export const LEAD_MONIKA = "46ab2978-2504-47e8-8733-6196e3f8a890";
export const ORDER_MONIKA = "b6e7f691-46f6-4002-9234-e7ee232b54cb";
export const LEAD_VINER_JOKE = "60258664-f3fa-417d-8987-aadbf59b4dc8";

const AUTHOR_NAME = "Jaroslav Viner (úklid Jardovy karty 15. 11. 2026)";

export const statementsOf = (text) =>
  text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

const read = (rel) => readFile(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

/** Úklid dat: každý příkaz je samostatný a hlídaný podmínkou (idempotentní). */
export function cleanupStatements() {
  return [
    // a) Jardova karta spolupracovníka — sazby odměn žijí v kódu podle smlouvy,
    //    default_commission_percent se pro Jardu nepoužívá.
    {
      query: `INSERT INTO collaborator_cards (id, display_name, assignee_user_id, supplier_contact_name, default_commission_percent, created_by)
              SELECT $1::uuid, 'Jaroslav Blahout – obchod a volání', $2::text, NULL, 0, $3::text
              WHERE NOT EXISTS (SELECT 1 FROM collaborator_cards WHERE id = $1::uuid OR assignee_user_id = $2::text)`,
      params: [JARDA_CARD_ID, BLAHOUT, VINER],
    },
    // b) VIP Dogs ↔ Tatiana: jen pokud kontakt ještě není převedený a firma existuje
    {
      query: `WITH upd AS (
                UPDATE leads SET converted_organization_id = $2::uuid, stage = 'converted', updated_at = now()
                 WHERE id = $1::uuid AND converted_organization_id IS NULL
                   AND EXISTS (SELECT 1 FROM organizations WHERE id = $2::uuid)
                RETURNING id, (SELECT stage FROM leads WHERE id = $1::uuid) AS old_stage
              )
              INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata)
              SELECT id, $3::text, $4::text, 'converted',
                     'Propojeno se zákazníkem VIP Dogs (objednávka 70000011 z e-shopu, 10. 11. 2026).',
                     jsonb_build_object('organizationId', $2::text, 'linkedExisting', true, 'from', old_stage, 'reason', 'audit_2026_11_15')
                FROM upd`,
      params: [LEAD_TATIANA, ORG_VIP_DOGS, VINER, AUTHOR_NAME],
    },
    // c) Monika Chuda: objednávka bez organizace → vazba na kontakt
    {
      query: `UPDATE orders SET source_lead_id = $2::uuid
               WHERE id = $1::uuid AND source_lead_id IS NULL AND buyer_organization_id IS NULL
                 AND EXISTS (SELECT 1 FROM leads WHERE id = $2::uuid)`,
      params: [ORDER_MONIKA, LEAD_MONIKA],
    },
    {
      query: `WITH upd AS (
                UPDATE leads SET stage = 'converted', updated_at = now()
                 WHERE id = $1::uuid AND stage <> 'converted'
                   AND EXISTS (SELECT 1 FROM orders WHERE id = $2::uuid AND source_lead_id = $1::uuid)
                RETURNING id, (SELECT stage FROM leads WHERE id = $1::uuid) AS old_stage
              )
              INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata)
              SELECT id, $3::text, $4::text, 'converted',
                     'Zákaznice (soukromá osoba, bez IČO) — objednávka 70000013 z e-shopu, 13. 11. 2026.',
                     jsonb_build_object('orderId', $2::text, 'privatePerson', true, 'from', old_stage, 'reason', 'audit_2026_11_15')
                FROM upd`,
      params: [LEAD_MONIKA, ORDER_MONIKA, VINER, AUTHOR_NAME],
    },
    // d) kontakt „Jaroslav Viner“ — není Jardův, patří Vinerovi
    {
      query: `WITH upd AS (
                UPDATE leads SET owner_user_id = $2::text, updated_at = now()
                 WHERE id = $1::uuid AND owner_user_id = $3::text
                RETURNING id
              )
              INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata)
              SELECT id, $2::text, $4::text, 'owner_assigned',
                     'Nejde o Jardův kontakt (vtip, shoduje se s testovacími objednávkami vedení) — vyřazeno z Jardových přehledů.',
                     jsonb_build_object('ownerUserId', $2::text, 'ownerName', 'Jaroslav Viner', 'reason', 'audit_2026_11_15')
                FROM upd`,
      params: [LEAD_VINER_JOKE, VINER, BLAHOUT, AUTHOR_NAME],
    },
    // e) evidence odměňování rozpracovaných kontaktů (bod 6 dohody)
    ...[LEAD_TATIANA, LEAD_MONIKA].map((leadId) => ({
      query: `INSERT INTO seller_reward_assignments (lead_id, seller_user_id, reward_type, basis, recorded_at, note, recorded_by, confirmed_at, confirmed_by)
              SELECT $1::uuid, $2::text, 'new', 'confirmed_at_signing', '2026-11-14T12:00:00Z'::timestamptz,
                     'Rozpracovaný kontakt potvrzený při podpisu dohody 14. 11. 2026 (bod 6) jako Nový zákazník.', $3::text,
                     '2026-11-14T12:00:00Z'::timestamptz, $3::text
              WHERE EXISTS (SELECT 1 FROM leads WHERE id = $1::uuid AND owner_user_id = $2::text)
                AND NOT EXISTS (SELECT 1 FROM seller_reward_assignments WHERE lead_id = $1::uuid AND cancelled_at IS NULL)`,
      params: [leadId, BLAHOUT, VINER],
    })),
  ];
}

export async function runJardaCardMigration() {
  const env = process.env.VERCEL_ENV;
  if (env !== "production" && env !== "preview") {
    console.log("Jarda card migration: skipped outside Vercel Production/Preview.");
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("Jarda card migration: DATABASE_URL is missing.");
  }

  const sql = neon(process.env.DATABASE_URL);
  const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
  if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
    console.log("Jarda card migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
    return;
  }

  const [{ has0041 }] = await sql.query(
    `select count(*)::int > 0 as has0041 from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'source_lead_id'`,
  );
  if (has0041) {
    console.log(`Jarda card migration (${env}): 0041 already applied.`);
  } else {
    const statements = statementsOf(await read("../drizzle/0041_jarda_karta_zdroj_objednavky.sql"));
    await sql.transaction((tx) => statements.map((s) => tx.query(s)));
    console.log(`Jarda card migration (${env}): schema 0041 applied (orders.source_lead_id).`);
  }

  const [{ has0042 }] = await sql.query(
    `select count(*)::int > 0 as has0042 from information_schema.tables
      where table_schema = 'public' and table_name = 'seller_reward_assignments'`,
  );
  if (has0042) {
    console.log(`Jarda card migration (${env}): 0042 already applied.`);
  } else {
    const statements = statementsOf(await read("../drizzle/0042_jarda_karta_evidence_odmenovani.sql"));
    await sql.transaction((tx) => statements.map((s) => tx.query(s)));
    console.log(`Jarda card migration (${env}): schema 0042 applied (seller_reward_assignments).`);
  }

  const [{ has0043 }] = await sql.query(
    `select count(*)::int > 0 as has0043 from information_schema.columns
      where table_schema = 'public' and table_name = 'seller_reward_assignments' and column_name = 'confirmed_at'`,
  );
  if (has0043) {
    console.log(`Jarda card migration (${env}): 0043 already applied.`);
  } else {
    const statements = statementsOf(await read("../drizzle/0043_jarda_karta_potvrzeni_navrhu.sql"));
    await sql.transaction((tx) => statements.map((s) => tx.query(s)));
    console.log(`Jarda card migration (${env}): schema 0043 applied (proposal confirmation).`);
  }

  await sql.transaction((tx) => cleanupStatements().map(({ query, params }) => tx.query(query, params)));
  console.log(`Jarda card migration (${env}): data cleanup checked (idempotent).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runJardaCardMigration();
}

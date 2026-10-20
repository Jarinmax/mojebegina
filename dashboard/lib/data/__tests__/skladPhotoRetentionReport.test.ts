// Report uchovávání originálních fotek (docs/sklad/30_retence_fotek_report.sql)
// — jen čtení, stejné rozhodnutí jako lib/sklad/photoRetention.ts. Nad PGlite
// se všemi migracemi; nic se nemaže.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMigratedDb } from "@/lib/eshop/__tests__/helpers/migratedDb";

const DOCS = path.join(__dirname, "../../../docs/sklad");
const DB_TEST = { timeout: 120_000 };

describe("30_retence_fotek_report.sql — jen čtení, stejné rozhodnutí jako lib/sklad/photoRetention.ts", DB_TEST, () => {
  it("potvrzená příjemka se drží do konce 10. roku, starý potvrzený doklad a opuštěný návrh jsou kandidáti; report nic nemění", async () => {
    const { pg } = await createMigratedDb();
    const [location] = (await pg.query<{ id: string }>(`SELECT id FROM stock_locations WHERE code = 'default'`)).rows;
    const [supplier] = (await pg.query<{ id: string }>(`INSERT INTO suppliers (name, name_normalized) VALUES ('S', 's') RETURNING id`)).rows;
    const receipt = async (status: string, documentDate: string | null, confirmedAt: string | null, updatedAt: string) => {
      const [r] = (
        await pg.query<{ id: string }>(
          `INSERT INTO goods_receipts (supplier_id, supplier_name_snapshot, stock_location_id, status, document_date, confirmed_at, confirmed_by_user_id, created_by_user_id, updated_at)
           VALUES ($1, 'S', $2, $3, $4, $5, CASE WHEN $5::timestamptz IS NULL THEN NULL ELSE 'u' END, 'u', $6) RETURNING id`,
          [supplier.id, location.id, status, documentDate, confirmedAt, updatedAt]
        )
      ).rows;
      const [d] = (
        await pg.query<{ id: string }>(`INSERT INTO goods_receipt_documents (receipt_id, kind, uploaded_by_user_id) VALUES ($1, 'receipt', 'u') RETURNING id`, [r.id])
      ).rows;
      await pg.query(`INSERT INTO goods_receipt_document_pages (document_id, page_number, storage_key, sha256, mime_type) VALUES ($1, 1, $2, md5($2), 'image/jpeg')`, [
        d.id,
        `sklad/${r.id}/x.jpg`,
      ]);
      return r.id;
    };
    const recent = await receipt("confirmed", "2026-10-01", "2026-10-02T10:00:00Z", "2026-10-02T10:00:00Z");
    const old = await receipt("confirmed", "2010-05-01", "2010-05-02T10:00:00Z", "2010-05-02T10:00:00Z");
    const abandoned = await receipt("draft", null, null, "2020-01-01T00:00:00Z");
    const fresh = await receipt("draft", null, null, new Date().toISOString());

    const counts = async () =>
      (await pg.query<{ n: number }>(`SELECT (SELECT count(*) FROM goods_receipt_document_pages) + (SELECT count(*) FROM goods_receipts) AS n`)).rows[0].n;
    const before = await counts();
    const { rows } = await pg.query<{ prijemka: string; drzet_do: string | null; rozhodnuti: string }>(
      readFileSync(path.join(DOCS, "30_retence_fotek_report.sql"), "utf8")
    );
    const byId = Object.fromEntries(rows.map((r) => [r.prijemka, r]));
    expect(byId[recent].rozhodnuti).toBe("držet");
    expect(String(byId[recent].drzet_do)).toMatch(/2036/);
    expect(byId[old].rozhodnuti).toBe("kandidát: účetní lhůta uplynula");
    expect(byId[abandoned].rozhodnuti).toBe("kandidát: nepotvrzený návrh bez změny 180+ dní");
    expect(byId[fresh].rozhodnuti).toBe("držet");
    expect(await counts()).toBe(before);
  });
});

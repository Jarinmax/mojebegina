// Ověření REÁLNÉHO blokování advisory locku (buildGoodsReceiptAdvisoryLockQuery,
// lib/data/sklad.ts) proti SKUTEČNÉ Postgres databázi se DVĚMA SKUTEČNÝMI,
// nezávislými TCP spojeními.
//
// Proč to nejde ani mock transportem (skladAtomicity.test.ts apod.), ani
// PGlite (skladReextractionPglite.test.ts apod.):
//   - Mock transport dokazuje jen tvar SQL a orchestraci appky (že se
//     zámek posílá JAKO SOUČÁST db.batch před zápisem) — mock neumí
//     simulovat, že druhé "spojení" na stejný klíč SKUTEČNĚ čeká.
//   - PGlite běží jen nad JEDNÍM připojením/procesem — nemůže mít dvě
//     paralelní transakce, co by se o zámek reálně přetahovaly.
//   - Appka v produkci mluví s Neonem přes HTTP driver
//     (@neondatabase/serverless, neon-http) — každý db.batch() je JEDEN
//     HTTP požadavek, co server-side běží jako jedna transakce na jednom
//     poolovaném spojení PO CELOU DOBU HTTP odpovědi. Dvě souběžné
//     HTTP žádosti o db.batch([zámek, zápis]) nad STEJNÝM receiptId jsou
//     tedy z pohledu Postgresu identické dvěma souběžným `pg` spojením,
//     co obě běží `BEGIN; SELECT pg_advisory_xact_lock(...); …` — přesně
//     to tenhle skript simuluje dvěma opravdovými `pg.Client` spojeními.
//
// NENÍ součástí `npm test` / CI (vitest). Vyžaduje skutečnou, multi-
// -connection Postgres databázi — v tomhle sandboxu lokální PostgreSQL 16
// (service postgresql start), migrovanou přes drizzle/0000..0024 *.sql do
// databáze "sklad_concurrency_test" (uživatel postgres/testpass,
// localhost:5432). Skript sám NEPROVÁDÍ žádnou migraci, nesahá na
// Preview/Production, nevolá žádné AI. Vytvoří si jen svůj vlastní
// dočasný dodavatele/příjemku/řádek (čistě pro test) a na konci je smaže.
//
// Spuštění:
//   node --experimental-strip-types scripts/sklad-advisory-lock-check/check.mts [connectionString]
//
// Bez argumentu použije výchozí lokální testovací DB popsanou výš.
import { Client } from "pg";

const connectionString = process.argv[2] ?? "postgresql://postgres:testpass@localhost:5432/sklad_concurrency_test";

let failures = 0;

function ok(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` (${detail})` : ""}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Stejná funkce/klíč jako buildGoodsReceiptAdvisoryLockQuery (sklad.ts):
// hashtextextended(receiptId, 0), celý text konzumovaný jako klíč.
function lockQuery(receiptId: string) {
  return { text: "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", values: [receiptId] };
}

// Vrátí Promise, co se vyřeší s "timeout", pokud se `p` nestihne vyřešit
// do `ms` — jinak s "resolved". Použité k ověření, že zámek SKUTEČNĚ
// blokuje (čekáme přiměřeně dlouho a kontrolujeme, že se to NEVYŘEŠILO).
async function raceAgainstTimeout<T>(p: Promise<T>, ms: number): Promise<"resolved" | "timeout"> {
  let settled: "resolved" | "timeout" | null = null;
  const timeoutPromise = sleep(ms).then(() => {
    if (settled === null) settled = "timeout";
  });
  const wrapped = p.then(() => {
    if (settled === null) settled = "resolved";
  });
  await Promise.race([timeoutPromise, wrapped]);
  return settled!;
}

async function scenarioLockBlocksAndRefreshesSnapshot() {
  console.log("\nScénář 1: zámek NA STEJNÉM klíči skutečně blokuje druhé spojení, a to po odblokování dostane ČERSTVÝ snímek (ne ten z doby před čekáním).");
  const key = `scenario1-${crypto.randomUUID()}`;
  const a = new Client({ connectionString });
  const b = new Client({ connectionString });
  await a.connect();
  await b.connect();
  try {
    await a.query("BEGIN");
    await a.query(lockQuery(key));
    console.log("  → spojení A získalo zámek a transakci NEKOMITUJE (simuluje probíhající zápis).");

    await b.query("BEGIN");
    const bLockPromise = b.query(lockQuery(key));
    const outcome = await raceAgainstTimeout(bLockPromise, 400);
    ok("spojení B na STEJNÉM klíči po 400ms ještě NEMÁ zámek (opravdu čeká, ne jen honor system)", outcome === "timeout");

    await a.query("COMMIT");
    console.log("  → spojení A komitovalo (zámek se uvolnil).");

    const unblockOutcome = await raceAgainstTimeout(bLockPromise, 2000);
    ok("spojení B dostalo zámek krátce PO komitu A (ne dřív)", unblockOutcome === "resolved");
    await bLockPromise;

    await b.query("COMMIT");
  } finally {
    await a.end();
    await b.end();
  }
}

async function scenarioDifferentKeysDoNotBlock() {
  console.log("\nScénář 2: zámky na RŮZNÝCH klíčích (různá receiptId) se NEBLOKUJÍ navzájem.");
  const keyX = `scenario2-x-${crypto.randomUUID()}`;
  const keyY = `scenario2-y-${crypto.randomUUID()}`;
  const a = new Client({ connectionString });
  const c = new Client({ connectionString });
  await a.connect();
  await c.connect();
  try {
    await a.query("BEGIN");
    await a.query(lockQuery(keyX));
    console.log("  → spojení A držÍ zámek pro receiptId X (nekomituje).");

    await c.query("BEGIN");
    const start = Date.now();
    await c.query(lockQuery(keyY));
    const elapsedMs = Date.now() - start;
    ok("zámek pro JINÉ receiptId Y se získal rychle (appka nezamyká globálně)", elapsedMs < 200, `${elapsedMs}ms`);

    await c.query("COMMIT");
    await a.query("COMMIT");
  } finally {
    await a.end();
    await c.end();
  }
}

type Snapshot = { count: string; maxUpdatedAt: string | null };

async function readLinesSnapshot(client: Client, receiptId: string): Promise<Snapshot> {
  const res = await client.query<{ count: string; max_updated_at: string | null }>(
    `SELECT count(*) AS count, max(updated_at)::text AS max_updated_at FROM goods_receipt_lines WHERE receipt_id = $1`,
    [receiptId]
  );
  return { count: res.rows[0].count, maxUpdatedAt: res.rows[0].max_updated_at };
}

// Konec-ku-konci simulace PŘESNĚ té rasové podmínky, kterou tahle ochrana
// uzavírá: acceptGoodsReceiptReextraction (sklad.ts) se rozhoduje podle
// snímku (count, max(updated_at)) zachyceného DŘÍV — a tahle simulace
// dokazuje, že i když se mezitím (zrovna BĚHEM čekání na zámek) řádek
// ručně upraví, zámek-pak-čerstvý-snímek appce zaručí, že porovnání po
// odemčení uvidí TU úpravu, ne starý stav — takže appka přepsání výsledkem
// nového čtení bezpečně odmítne.
async function scenarioEndToEndManualEditDuringAccept(receiptId: string, lineId: string, storedSnapshot: Snapshot) {
  console.log("\nScénář 3 (reálné schéma, konec-ku-konci): ruční úprava řádku BĚHEM čekání na zámek se v porovnání po odemčení SKUTEČNĚ projeví.");
  const manualEdit = new Client({ connectionString });
  const accept = new Client({ connectionString });
  await manualEdit.connect();
  await accept.connect();
  try {
    // Spojení "manualEdit" = stejný vzor jako updateGoodsReceiptLine
    // (sklad.ts): zámek JAKO SAMOSTATNÝ příkaz, pak zápis, v JEDNÉ
    // transakci — tady jen roztažené v čase (BEGIN…COMMIT ručně), aby šlo
    // simulovat souběh se "accept" spojením.
    await manualEdit.query("BEGIN");
    await manualEdit.query(lockQuery(receiptId));
    console.log("  → 'ruční úprava' získala zámek a zatím NEKOMITUJE.");

    await accept.query("BEGIN");
    const acceptLockPromise = accept.query(lockQuery(receiptId));
    const outcome = await raceAgainstTimeout(acceptLockPromise, 400);
    ok("'převzetí' (accept) čeká na zámek, dokud 'ruční úprava' nedoběhne", outcome === "timeout");

    // Teprve TEĎ (zámek stále u 'ruční úpravy') se řádek doopravdy upraví
    // — trigger goods_receipt_lines_bump_updated_at (migrace 0024) sám
    // nastaví updated_at, stejně jako by to udělala appka.
    await manualEdit.query(`UPDATE goods_receipt_lines SET raw_description = 'Ručně upraveno během čekání' WHERE id = $1`, [lineId]);
    await manualEdit.query("COMMIT");
    console.log("  → 'ruční úprava' upravila řádek a komitovala.");

    const unblockOutcome = await raceAgainstTimeout(acceptLockPromise, 2000);
    ok("'převzetí' dostalo zámek krátce po komitu ruční úpravy", unblockOutcome === "resolved");
    await acceptLockPromise;

    // Přesně ten samý dotaz, co dělá acceptGoodsReceiptReextraction uvnitř
    // atomického zápisu PO zámku — ČERSTVÝ snímek, NOVÝ příkaz v téže
    // (accept) transakci, po úspěšném získání zámku.
    const freshSnapshot = await readLinesSnapshot(accept, receiptId);
    const matchesStored = freshSnapshot.count === storedSnapshot.count && freshSnapshot.maxUpdatedAt === storedSnapshot.maxUpdatedAt;
    ok(
      "čerstvý snímek PO odemčení se LIŠÍ od snímku uloženého před ruční úpravou (appka by převzetí odmítla)",
      !matchesStored,
      `uložené maxUpdatedAt=${storedSnapshot.maxUpdatedAt}, čerstvé=${freshSnapshot.maxUpdatedAt}`
    );

    await accept.query("ROLLBACK");
  } finally {
    await manualEdit.end();
    await accept.end();
  }
}

async function main() {
  console.log(`Připojuji se k: ${connectionString.replace(/:[^:@/]+@/, ":***@")}`);
  const setup = new Client({ connectionString });
  await setup.connect();

  let supplierId: string;
  let stockLocationId: string;
  let receiptId: string;
  let lineId: string;

  try {
    const loc = await setup.query<{ id: string }>(`SELECT id FROM stock_locations LIMIT 1`);
    if (loc.rows.length === 0) {
      throw new Error("Žádná stock_location v databázi — migrace 0023 neproběhla (chybí seedovaná výchozí lokace).");
    }
    stockLocationId = loc.rows[0].id;

    const supplier = await setup.query<{ id: string }>(
      `INSERT INTO suppliers (name, name_normalized) VALUES ('Advisory lock check — dočasný dodavatel', $1) RETURNING id`,
      [`advisory-lock-check-${crypto.randomUUID()}`]
    );
    supplierId = supplier.rows[0].id;

    const receipt = await setup.query<{ id: string }>(
      `INSERT INTO goods_receipts (supplier_id, supplier_name_snapshot, stock_location_id, status, created_by_user_id, reextraction_status, reextraction_claimed_at)
       VALUES ($1, 'Advisory lock check — dočasný dodavatel', $2, 'draft', 'advisory-lock-check-script', 'ready', now())
       RETURNING id`,
      [supplierId, stockLocationId]
    );
    receiptId = receipt.rows[0].id;

    const line = await setup.query<{ id: string }>(
      `INSERT INTO goods_receipt_lines (
         receipt_id, "position", raw_description, raw_package_quantity, raw_units_per_package, raw_unit,
         normalized_quantity, normalized_unit, unit_price_without_vat, total_without_vat_hal, vat_hal, total_with_vat_hal,
         computed_vat_rate_percent, line_kind
       ) VALUES ($1, 1, 'Testovací řádek', 1, 1, 'ks', 1, 'ks', 10, 1000, 210, 1210, 21, 'stock_material')
       RETURNING id`,
      [receiptId]
    );
    lineId = line.rows[0].id;

    const storedSnapshot = await readLinesSnapshot(setup, receiptId);
    console.log(`Dočasná příjemka připravena (receiptId=${receiptId}, lineId=${lineId}, storedSnapshot=${JSON.stringify(storedSnapshot)}).`);

    await scenarioLockBlocksAndRefreshesSnapshot();
    await scenarioDifferentKeysDoNotBlock();
    await scenarioEndToEndManualEditDuringAccept(receiptId, lineId, storedSnapshot);
  } finally {
    console.log("\nMažu dočasná testovací data…");
    if (receiptId! !== undefined) {
      await setup.query(`DELETE FROM goods_receipt_lines WHERE receipt_id = $1`, [receiptId]);
      await setup.query(`DELETE FROM goods_receipts WHERE id = $1`, [receiptId]);
    }
    if (supplierId! !== undefined) {
      await setup.query(`DELETE FROM suppliers WHERE id = $1`, [supplierId]);
    }
    await setup.end();
  }

  console.log(`\n${failures === 0 ? "VŠECHNY kontroly PROŠLY" : `${failures} kontrol(a) SELHALO`} — reálná dvě-spojení Postgres databáze, ne mock.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Skript selhal s chybou:", error);
  process.exit(1);
});

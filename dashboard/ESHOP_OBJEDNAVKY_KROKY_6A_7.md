# ESHOP 1.0, kroky 6a + 7 — číslo objednávky a objednávka bez organizace

Stav (28. 9. 2026): implementováno na větvi `claude/great-bell-ffjwo3`.
**Migrace 0018 + 0019 spuštěné vedením na Neon Preview větvi
`preview/claude/great-bell-ffjwo3` (`br-curly-base-b2blmhjg`) a ověřené
read-only** (0018: bigint / index 1 / 0 čísel / bez řady; 0019: YES / 2 /
0 bez organizace / 3 objednávky). **Produkční `main` beze změny.** Claude má k Neonu jen
read-only přístup — migrace spouští vedení. Návrh: `ESHOP_SCHEMA_PROPOSAL.md`,
oddíly 3.9 a 3.11.

**Co to NENÍ:** zápis z pokladny, ostré platby, zapnuté číslování (krok 6b
až v den přepnutí z WooCommerce).

## Co se změnilo

| Migrace | Změna |
|---|---|
| `0018_eshop_1_0_order_number` | `orders.order_number` (bigint, NULL) + jedinečný index `orders_order_number_key`. **Bez řady čísel** — všechny objednávky zůstávají bez čísla. |
| `0019_eshop_1_0_orders_guest` | `orders.buyer_organization_id` smí být NULL (soukromý zákazník). CHECK `orders_manual_requires_org` (ruční objednávka musí mít organizaci), CHECK `orders_guest_requires_contact` (objednávka bez organizace musí mít e-mail). |

Kód MojeBegina:
- `lib/data/orderBuyer.ts` (nové, bez DB): „Soukromý zákazník“ místo
  organizace, id organizací bez NULL, formát „č. 5094“.
- Objednávky (`lib/data/orders.ts`, `OrderCard`, detail): u objednávky bez
  organizace název „Soukromý zákazník“ a jméno kontaktu; číslo objednávky
  se ukáže, jen když existuje (dnes nikde).
- CRM (`lib/data/leads.ts`): noví zákazníci, hledání duplicit podle
  kontaktu a statistiky zákazníků objednávky bez organizace přeskočí.
  (Postgres by NULL v `IN (…)` stejně ignoroval — úprava je typová
  pojistka, chování CRM se nemění.)
- Partnerský program, ruční zakládání objednávek (organizace povinná),
  faktury: beze změny.

## ⚠ Pořadí

Kód čte sloupec `order_number` → **Objednávky a Řízení firmy v Preview
spadnou, dokud neproběhne 0018.** Proto 0018 hned po nasazení (nebo
i před ním — stávajícímu kódu nový sloupec nevadí). 0019 až po ověření, že
Preview s novým kódem běží. Produkce: 0018 + 0019 před mergem do `main`.

## Postup — Preview větev `preview/claude/great-bell-ffjwo3` (`br-curly-base-b2blmhjg`)

1. **Kontrola před** (jen čtení). Očekáváno (ověřeno read-only 28. 9.):
   **krok_0016_hotovy 1, order_number 0, organizace_nepovinna NO,
   bez_organizace 0, objednavky 3**.

   ```sql
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'channel') AS krok_0016_hotovy,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number') AS order_number,
  (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'buyer_organization_id') AS organizace_nepovinna,
  (SELECT count(*) FROM orders WHERE buyer_organization_id IS NULL) AS bez_organizace,
  (SELECT count(*) FROM orders) AS objednavky;
   ```

2. **Migrace 0018** — celý obsah `drizzle/0018_eshop_1_0_order_number.sql`:

   ```sql
ALTER TABLE "orders" ADD COLUMN "order_number" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders" USING btree ("order_number");
   ```

   Kontrola: **order_number bigint, index_cisla 1, ocislovane 0,
   rada_cisel 0, objednavky 3**.

   ```sql
SELECT
  (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number') AS order_number,
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orders_order_number_key') AS index_cisla,
  (SELECT count(order_number) FROM orders) AS ocislovane,
  (SELECT count(*) FROM pg_class WHERE relkind = 'S' AND relname LIKE '%order_number%') AS rada_cisel,
  (SELECT count(*) FROM orders) AS objednavky;
   ```

3. Preview: Řízení firmy → Objednávky → detail se načtou jako dřív.

4. **Migrace 0019** — celý obsah `drizzle/0019_eshop_1_0_orders_guest.sql`:

   ```sql
ALTER TABLE "orders" ALTER COLUMN "buyer_organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_manual_requires_org" CHECK ("orders"."channel" <> 'manual' OR "orders"."buyer_organization_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_requires_contact" CHECK ("orders"."buyer_organization_id" IS NOT NULL OR "orders"."contact_email" IS NOT NULL);
   ```

   Kontrola: **organizace_nepovinna YES, omezeni 2, bez_organizace 0,
   objednavky 3**.

   ```sql
SELECT
  (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'buyer_organization_id') AS organizace_nepovinna,
  (SELECT count(*) FROM pg_constraint WHERE conname IN ('orders_manual_requires_org', 'orders_guest_requires_contact')) AS omezeni,
  (SELECT count(*) FROM orders WHERE buyer_organization_id IS NULL) AS bez_organizace,
  (SELECT count(*) FROM orders) AS objednavky;
   ```

5. Preview: Objednávky, ruční objednávka (organizace dál povinná), CRM
   Zákazníci — beze změny.

**Návrat** (v tomto pořadí): `docs/eshop-schema-draft/07_orders_guest_down.sql`,
`06a_order_number_column_down.sql`. Krok 7 je vratný jen dokud neexistuje
objednávka bez organizace (pak návrat selže a nic nesmaže); 6a dokud
nikdo neviděl žádné číslo.

## Ověřeno (bez Neonu)

- 289/289 testů (+17 nových): migrace 0018/0019 na PGlite s daty jako
  v Preview (existující objednávky beze změny a bez čísla; žádná řada
  čísel, nová objednávka bez čísla; číslo jedinečné; soukromý zákazník
  s e-mailem projde; ruční bez organizace a soukromý bez e-mailu
  odmítnuty; ostatní tabulky beze změny; návrat 07 → 06a přesný; návrat 07
  s objednávkou bez organizace selže). Skutečné `listOrders`,
  `getOrderDetail`, `findDuplicateOrganizations`, `listCustomers`,
  `getCustomerDetail` nad PGlite s objednávkou soukromého zákazníka;
  kontrolní běh se starým kódem potvrdil, že test chybu zachytí.
- Typecheck, lint, `next build`; drizzle-kit bez nevygenerovaných změn.

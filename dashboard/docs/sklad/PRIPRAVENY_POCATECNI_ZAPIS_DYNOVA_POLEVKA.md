# Připravený počáteční zápis — Dýňová polévka (šarže L-20261106-DYN-01)

**STAV: POUZE PŘIPRAVENO. NIC Z TOHOTO SE DOSUD NEPROVEDLO.** Nepouštět bez
samostatného výslovného schválení (a bez nasazení Skladu 1.0 + 1.1 do
Production — ty teď v Production ještě neexistují, viz níže).

Zadání: 38 kusů Dýňové polévky (1 ks = 1 Bag-in-Box 3 l) z jednoho výrobního
běhu v noci z 5. na 6. 11. 2026, šarže `L-20261106-DYN-01`; rezervovat 30 ks
pro objednávku 5228 (Food Fest Crew) a 1 ks pro objednávku 5227 (Kafe
Patro); volná zásoba po rezervacích = 7 ks.

## Ověřeno (read-only, Production, 6. 11. 2026)

| Co | Zjištění |
|---|---|
| Skladové tabulky (`stock_items`, `stock_locations`, `stock_batches`, `stock_reservations`) | **0** — Sklad 1.0 i 1.1 v Production ještě neexistují (PR #56 nesloučeno) |
| `product_variants.id = 67d70837-4015-420e-847b-7e4c59733cb8` | existuje — „3 l Rodinná zásoba (bag-in-box)", `volume_ml = 3000` → potvrzuje „1 ks = 1 BiB 3 l" |
| Objednávky s `order_number` 5227 nebo 5228 | **0** — neexistují |
| Objednávky s `order_number` 5220–5235 (okolí) | **0** — žádná v tomto rozsahu |
| `max(orders.order_number)` v Production | `70000008` (11 objednávek celkem) |

**Blokátor:** 5227 a 5228 jsou čísla objednávek z WooCommans/WooCommerce, ne
z interní řady MojeBegina (ta začíná na 70000001). Objednávky 5227/5228
musí nejdřív proběhnout importem WooCommerce (stejný mechanismus jako dřívější
import objednávky 5217 — `importExternalOrder` / MCP nástroj pro import
objednávek), než na ně půjde cokoliv rezervovat. Rezervace podle
`order_number` (ne UUID) je v `reserveStockForOrder` navržena přesně proto,
aby šla zadat lidským číslem objednávky — ale objednávka musí v databázi
existovat.

## Co ještě chybí (uživatel sám uvedl, stále neurčeno)

- **Datum minimální trvanlivosti/spotřeby** (`best_before_at`) šarže.
- **Skladová lokace** (`stock_location_id`) — po nasazení Skladu 1.0 bude
  existovat výchozí lokace `code = 'default'`; pokud se má použít jiná
  (konkrétní výrobní/skladová hala), je potřeba ji nejdřív založit nebo
  potvrdit, že se má použít výchozí.
- **Odpovědná osoba** (`responsible_user_id`) — kdo za tuto výrobu/dávku
  odpovídá. Platné hodnoty jsou omezené na `UPLOAD_ROLE_USER_IDS` v
  `lib/data/skladFinishedGoods.ts`: Jaroslav Viner, Lucie Königsbergová,
  Jaroslav Blahout.

## Krok 1 — příjem výroby (`record_production_batch`)

Jakmile jsou doplněny `best_before_at`, `stock_location_id` a
`responsible_user_id` (a existuje `stock_items` karta „Dýňová polévka" druhu
`finished_good` s `linked_product_variant_id = 67d70837-4015-420e-847b-7e4c59733cb8`,
kterou je potřeba založit v administraci skladu, pokud ještě neexistuje):

```json
{
  "stock_item_id": "<id karty „Dýňová polévka" druhu finished_good>",
  "quantity": 38,
  "batch_code": "L-20261106-DYN-01",
  "produced_at": "2026-11-06",
  "best_before_at": "<CHYBÍ>",
  "stock_location_id": "<CHYBÍ>",
  "responsible_user_id": "<CHYBÍ>",
  "note": "Noční výrobní běh 5.–6. 11. 2026, 1 ks = 1 Bag-in-Box 3 l.",
  "idempotency_key": "<nové UUID>"
}
```

Zapíše jediný append-only pohyb `production_in` (+38 ks na kartě na dané
lokaci); šarže se založí v `stock_batches`.

## Krok 2 — rezervace (`reserve_stock_for_order`, 2×) — ZABLOKOVÁNO

Teprve až objednávky 5227 a 5228 existují v `orders` (po WooCommerce
importu):

```json
{
  "stock_item_id": "<stejné id jako výše>",
  "stock_location_id": "<stejné id jako výše>",
  "order_number": 5228,
  "quantity": 30,
  "batch_id": "<id šarže z kroku 1>",
  "idempotency_key": "<nové UUID>"
}
```

```json
{
  "stock_item_id": "<stejné id jako výše>",
  "stock_location_id": "<stejné id jako výše>",
  "order_number": 5227,
  "quantity": 1,
  "batch_id": "<id šarže z kroku 1>",
  "idempotency_key": "<nové UUID>"
}
```

Po obou rezervacích: fyzický stav 38, rezervováno 31, volný stav 7 — přesně
podle zadání. Výdej (`record_stock_dispatch`) až po potvrzeném
předání/závozu, až nastane.

## Pořadí před spuštěním (shrnutí)

1. Schválit a nasadit Sklad 1.0 (PR #56) a Sklad 1.1 (tato větev) do Production.
2. Založit kartu „Dýňová polévka" (druh `finished_good`, vazba na variantu `67d70837-...`).
3. Doplnit datum trvanlivosti, lokaci, odpovědnou osobu.
4. Doimportovat objednávky 5227 a 5228 z WooCommerce.
5. Teprve pak spustit Krok 1 a Krok 2 — a to vždy jen po výslovném schválení.

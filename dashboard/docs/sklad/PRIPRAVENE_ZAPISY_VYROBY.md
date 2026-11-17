# Připravené zápisy výroby (šarže hotových výrobků)

**STAV: POUZE PŘIPRAVENO. NIC Z TOHOTO SE DOSUD NEPROVEDLO.** Nepouštět bez
samostatného výslovného schválení Jaroslava Vinera.

Postup a pravidla jsou ze **Skladu 1.1** (větev `feature/sklad-1-1-hotove-vyrobky`):
jedna várka = jeden zápis `record_production_batch` = jedna nová šarže
v `stock_batches` + jeden append-only pohyb `production_in`. Existující pohyby
se nikdy nepřepisují; oprava = nový pohyb (`inventory_correction` s důvodem,
storno = `void_reversal`).

Formát označení šarže: `L-RRRRMMDD-KÓD-NN` (datum výroby, kód výrobku, pořadí
várky toho dne), stejně jako první šarže `L-20261106-DYN-01`. DB a appka
kontrolují jen znaky (`^[A-Z0-9][A-Z0-9-]*$`) a jedinečnost; formát se
dodržuje tímto seznamem.

## Stav Production (ověřeno jen čtením 11. 11. a znovu 17. 11. 2026)

| Co | Zjištění |
|---|---|
| Sklad 1.0 (`stock_items`, `stock_locations`, `stock_movements`, příjemky) | **nasazen**, 0 skladových pohybů |
| Sklad 1.1 (`stock_batches`, `stock_reservations`, druh `finished_good`) | **není nasazen** → zápis zatím nejde provést |
| Skladová lokace | jediná: `default` „Výchozí sklad“, id `05de79d2-4bca-4845-809c-9610085686b8` |
| Karta „Dýňová polévka“ (`finished_good`, vazba na balení `67d70837-…`) | **neexistuje** (druh `finished_good` přijde se Skladem 1.1) |
| Dýňová polévka | `products.shelf_life_days = 14`; jediné aktivní balení `67d70837-4015-420e-847b-7e4c59733cb8` (3 l) |

Pozn.: větev Skladu 1.1 číslovala migraci jako 0030, ale v `main` už je 0030
Sklad 1.0 a další migrace až po 0035 → před nasazením je potřeba ji
přečíslovat a sloučit s `main`.

## Přehled šarží

| Šarže | Výrobek | Kusy | Vyrobeno | Spotřebujte do | Stav |
|---|---|---|---|---|---|
| `L-20261106-DYN-01` | Dýňová polévka, BiB 3 l | 38 | noc 5./6. 11. 2026 | **neurčeno** (19. nebo 20. 11.) | připraveno — viz `PRIPRAVENY_POCATECNI_ZAPIS_DYNOVA_POLEVKA.md` ve větvi Skladu 1.1 |
| `L-20261110-DYN-01` | Dýňová polévka, BiB 3 l | 17 | 10. 11. 2026 | 24. 11. 2026 | připraveno — níže |
| `L-20261117-MEL-01` | Meduňkový sirup s levandulí: 2 × begina 3 l, 9 × sáček 650 ml, 2 × sáček 100 ml (ochutnávky) | 13 | 17. 11. 2026 | **chybí** (sirupy nemají trvanlivost v systému) | připraveno — níže, **blokuje i omezení Skladu 1.1** |

## L-20261110-DYN-01 — Dýňová polévka, 17 ks

Zadání (Jaroslav Viner, 11. 11. 2026): „Včera jsem dělal další várku,
17 begin dýňové polívky.“

- **17 ks = 17 × Bag-in-Box 3 l** — jediné aktivní balení Dýňové polévky.
- **Vyrobeno 10. 11. 2026** („včera“). Jednodenní běh, takže datum
  spotřeby nezávisí na tom, jestli se počítá od začátku, nebo od konce výroby.
- **Spotřebujte do 24. 11. 2026** = 10. 11. + 14 dní (`shelf_life_days`).
- **Pořadí 01** — první várka Dýňové 10. 11. (jiná várka ten den nehlášena).
- **Odpovědná osoba:** Jaroslav Viner (vařil sám).
- **Lokace:** `default` „Výchozí sklad“ (jiná zatím neexistuje).
- `idempotency_key` je pevně daný předem, takže opakované odeslání téhož
  zápisu (např. po výpadku spojení) nezaloží druhou šarži.

### Krok 1 — příjem výroby (`record_production_batch`)

Až bude Sklad 1.1 nasazený a karta „Dýňová polévka“ založená:

```json
{
  "stock_item_id": "<id karty „Dýňová polévka“ druhu finished_good, balení 67d70837-4015-420e-847b-7e4c59733cb8>",
  "quantity": 17,
  "batch_code": "L-20261110-DYN-01",
  "produced_at": "2026-11-10",
  "best_before_at": "2026-11-24",
  "stock_location_id": "05de79d2-4bca-4845-809c-9610085686b8",
  "responsible_user_id": "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c",
  "note": "Výrobní běh 10. 11. 2026, 1 ks = 1 Bag-in-Box 3 l, 17 ks (51 l).",
  "idempotency_key": "eca99e68-9e25-4ee7-be36-c334faa3f9c7"
}
```

Výsledek: nová šarže `L-20261110-DYN-01` a jeden pohyb `production_in`
+17 ks na kartě Dýňové polévky ve Výchozím skladu. Se šarží
`L-20261106-DYN-01` se nic neslučuje, obě zůstávají samostatně dohledatelné.

## L-20261117-MEL-01 — Meduňkový sirup s levandulí, jedna várka ve 3 baleních

Zadání (Jaroslav Viner, 17. 11. 2026): „udělal jsem meduňko levandulový
sirup … 2 3-litrové beginy, 2 malé 100 ml sáčky na ochutnávky a pak
kapsičky 650 ml 9 těch 650.“

- **Jedna várka = jedna šarže = jedno označení na všech 13 kusech**, ať je
  to begina, nebo sáček. Celkem 2 × 3 l + 9 × 0,65 l + 2 × 0,1 l = 12,05 l.
- **Kód výrobku `MEL`** (MEduňka + Levandule), navržen 17. 11., čeká na
  potvrzení. Po první šarži se už nemění.
- **Vyrobeno 17. 11. 2026**, pořadí 01. **Odpovědná osoba:** Jaroslav Viner.
- **Minimální trvanlivost: CHYBÍ.** Sirupy nemají `shelf_life_days`
  a na obalu má být „Minimální trvanlivost do: …“ (den, měsíc, rok).
  Datum musí určit výrobce podle receptury/ověření; zápis bez něj
  nejde provést.
- **Lokace:** `default` „Výchozí sklad“ (`05de79d2-4bca-4845-809c-9610085686b8`).

Balení a skladové karty (druh `finished_good`, karty zatím neexistují):

| Balení | Kusů | Varianta v e-shopu | Karta |
|---|---|---|---|
| begina 3 l | 2 | `cfd5ee82-082d-4707-a7b4-efb5f668d9a1` (SKU `medunkovy-sirup-s-levanduli-3l`) | založit |
| sáček 650 ml | 9 | `911cb423-a884-4821-a2b7-6bd1f7cbadc4` (SKU `medunkovy-sirup-s-levanduli-750ml`, štítek 650 ml) | založit |
| sáček 100 ml — ochutnávky | 2 | **žádná** (100 ml se prodává jen v ochutnávkovém setu 5 × 100 ml, ten je zatím skrytý a v Production není) | založit kartu bez vazby na e-shop, např. „Meduňkový sirup s levandulí – sáček 100 ml (ochutnávky)“ |

### ⚠ Omezení Skladu 1.1, které tuhle šarži blokuje

`stock_batches` má **jedinečné `batch_code` přes celou tabulku**
(`stock_batches_code_key`) a každá šarže patří **jedné** skladové kartě.
Jedna várka naplněná do tří balení ale potřebuje tři karty se **stejným**
označením šarže. Druhý a třetí zápis by DB odmítla („Šarže už existuje“).

Vymýšlet označení pro každé balení zvlášť (např. `-3L`, `-650`) **ne**:
na obalech musí být stejná šarže, jinak se při kontrole nebo stažení
rozpadne dohledání várky.

Návrh opravy ve větvi Skladu 1.1 před nasazením (jedna změna, nic dalšího
se nemění):

```sql
DROP INDEX stock_batches_code_key;
CREATE UNIQUE INDEX stock_batches_item_code_key ON stock_batches (stock_item_id, batch_code);
```

…a v `recordProductionBatch` u chyby jedinečnosti hlášku „šarže už
u tohoto výrobku/balení existuje“. Označení pak zůstává jedinečné
v rámci karty a celou várku najde dotaz podle `batch_code`. Než se tohle
rozhodne a opraví, zapsat šarži jde jen pro jedno balení.

### Krok 1 — tři zápisy `record_production_batch` (po opravě výše)

Stejné `batch_code`, `produced_at`, `best_before_at` a poznámka; každý
zápis má vlastní předem daný `idempotency_key`.

```json
{
  "stock_item_id": "<karta Meduňkový sirup s levandulí – begina 3 l (varianta cfd5ee82-082d-4707-a7b4-efb5f668d9a1)>",
  "quantity": 2,
  "batch_code": "L-20261117-MEL-01",
  "produced_at": "2026-11-17",
  "best_before_at": "<CHYBÍ>",
  "stock_location_id": "05de79d2-4bca-4845-809c-9610085686b8",
  "responsible_user_id": "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c",
  "note": "Várka 17. 11. 2026, 12,05 l: 2 × begina 3 l, 9 × sáček 650 ml, 2 × sáček 100 ml (ochutnávky). Tento zápis: begina 3 l.",
  "idempotency_key": "6825e419-6e2f-4a48-ac91-05a6632e4c78"
}
```

```json
{
  "stock_item_id": "<karta Meduňkový sirup s levandulí – sáček 650 ml (varianta 911cb423-a884-4821-a2b7-6bd1f7cbadc4)>",
  "quantity": 9,
  "batch_code": "L-20261117-MEL-01",
  "produced_at": "2026-11-17",
  "best_before_at": "<CHYBÍ>",
  "stock_location_id": "05de79d2-4bca-4845-809c-9610085686b8",
  "responsible_user_id": "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c",
  "note": "Várka 17. 11. 2026, 12,05 l: 2 × begina 3 l, 9 × sáček 650 ml, 2 × sáček 100 ml (ochutnávky). Tento zápis: sáček 650 ml.",
  "idempotency_key": "62ebb822-61c1-4e9f-8516-3cd293785327"
}
```

```json
{
  "stock_item_id": "<karta Meduňkový sirup s levandulí – sáček 100 ml (ochutnávky), bez vazby na e-shop>",
  "quantity": 2,
  "batch_code": "L-20261117-MEL-01",
  "produced_at": "2026-11-17",
  "best_before_at": "<CHYBÍ>",
  "stock_location_id": "05de79d2-4bca-4845-809c-9610085686b8",
  "responsible_user_id": "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c",
  "note": "Várka 17. 11. 2026, 12,05 l: 2 × begina 3 l, 9 × sáček 650 ml, 2 × sáček 100 ml (ochutnávky). Tento zápis: sáček 100 ml na ochutnávky, neprodává se.",
  "idempotency_key": "e450e4c1-295d-42a2-ac3c-887f74a3cdeb"
}
```

Až se ochutnávkové sáčky rozdají: výdej `record_stock_dispatch` (2 ks,
poznámka kde a komu, např. „ochutnávka – trh …“), aby sklad seděl
a šarže zůstala dohledatelná i u rozdaných kusů.

## Pořadí před spuštěním

1. Ve Skladu 1.1 povolit stejné označení šarže na více kartách (oprava výše),
   sloučit s `main` (přečíslování migrace) a nasadit do Production.
2. Založit karty (druh `finished_good`): Dýňová polévka 3 l (`67d70837-…`),
   Meduňkový s levandulí 3 l (`cfd5ee82-…`), 650 ml (`911cb423-…`) a 100 ml (ochutnávky).
3. Rozhodnout datum spotřeby `L-20261106-DYN-01` (19. nebo 20. 11. 2026)
   a minimální trvanlivost `L-20261117-MEL-01`; potvrdit kód `MEL`.
4. Teprve po výslovném schválení zapsat šarže v pořadí výroby:
   `L-20261106-DYN-01`, `L-20261110-DYN-01`, `L-20261117-MEL-01`.

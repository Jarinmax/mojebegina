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

## Stav Production (ověřeno jen čtením 11. 11. 2026)

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

## Pořadí před spuštěním

1. Sloučit Sklad 1.1 s `main` (přečíslování migrace) a nasadit do Production.
2. Založit kartu „Dýňová polévka“ (druh `finished_good`, vazba na balení `67d70837-…`).
3. Rozhodnout datum spotřeby první šarže (19. nebo 20. 11. 2026).
4. Teprve po výslovném schválení zapsat šarže v pořadí výroby:
   `L-20261106-DYN-01`, pak `L-20261110-DYN-01`.

# Číslování objednávek při přechodu z WooCommerce — návrh

Stav: **NÁVRH, nic se nemění.** START zatím neschválen (rozhodnutí vedení
10. 10. 2026: nejdřív zjistit skutečné číslování ve WooCommerce).
Číslovací SQL (`docs/eshop-production/20–29_numbering_*.sql`) se neupravuje
ani nespouští.

## Co víme (ověřeno 10. 10. 2026)

| Fakt | Zdroj |
|---|---|
| Production: číslování **vypnuté** (`order_number_seq` neexistuje), 3 objednávky bez čísla: 2 import (The Cup), 1 e-shop (stornovaná, VS 70000001) | Neon, jen čtení |
| UNIQUE index na `orders.order_number` existuje | Neon, jen čtení |
| WooCommerce byl kolem 26. 9. 2026 u objednávky **č. 5093** | `ESHOP_AUDIT.md` |
| Nový e-shop (`moje.begina.cz/eshop`) a WooCommerce **přijímají objednávky souběžně** (oba veřejné) — nový zatím bez čísel, jen VS 7xxxxxxx | Production přepínače |
| Variabilní symboly: nový systém `7xxxxxxx` (8 číslic), WooCommerce převodem obvykle číslo objednávky (4 číslice) → **párování plateb se nepomíchá** | kód / `ESHOP_PREVOD_QR.md` |
| Faktury: vlastní řada iDokladu (7277293), na číslech objednávek nezávisí | `ESHOP_FAKTURACE_NAVRH.md` |

**Audit 10. 10. 2026** (`docs/begina-cutover/audit-2026-10-10.md`): veřejně
**žádný doplněk pro čísla objednávek** (doplňky: WooCommerce, WooPayments,
Flexible Shipping, Ecomail, Elementor, CookieYes) → téměř jistě výchozí
WooCommerce: **číslo objednávky = ID záznamu WordPressu**. Nejvyšší veřejná
ID: stránka 3552 (3/2026), produkt 3256 (2/2026); objednávka č. 5093
(9/2026) leží nad nimi → objednávky berou čísla ze stejné řady. Elementor
při úpravách stránek zakládá revize, které také spotřebují ID.

**Neznámé:** zda WooCommerce používá doplněk pro souvislá čísla (audit ho veřejně nenašel). Bez něj je
číslo objednávky = ID záznamu WordPressu (sdílené s příspěvky, stránkami,
obrázky, revizemi) → **příští objednávka po návratu na WooCommerce nedostane
„max + 1“, ale další volné ID WordPressu**, které může být výrazně výš než
poslední objednávka. Zjistí `scripts/begina-cutover/wp-audit.mts`
(doplňky, nejvyšší veřejná ID) + jeden údaj z administrace (níže).

## Návrh bezpečné návaznosti

1. **START = nejvyšší z čísel** (a) poslední objednávka WooCommerce,
   (b) nejvyšší ID záznamu WordPressu (bez doplňku), **+ rezerva na
   případný návrat**, zaokrouhleno nahoru na stovky. Rezervu navrhnu
   v číslech, až budou známé (a) a (b).
   - S doplňkem pro souvislá čísla stačí (a) + rezerva.
2. **Nové objednávky dostanou čísla zpětně podle data** (skript 21): dnešní
   e-shopová objednávka (stornovaná) START+1, další podle data. Kontrolní
   dotaz `20_numbering_before.sql` dnes vrátí `eshop = 1` (dokument čekal 0)
   — to je v pořádku, jen jiná očekávaná hodnota.
3. **Návrat na WooCommerce:** číslování **nevypínat** (`29_numbering_rollback.sql`
   NEspouštět). Vypne se jen nový e-shop (`ESHOP_PUBLIC`, `ESHOP_ORDER_WRITE`)
   a zapne pokladna WooCommerce. Přidělená čísla zůstanou, ruční objednávky
   v MojeBegina číslují dál. Kolize hrozí, jen kdyby WooCommerce během
   návratu došel až ke STARTu — proto rezerva.
4. **Opětovné přepnutí po návratu:** skript 21 se znovu nespouští (sám to
   odmítne). Před zapnutím ověřit (jen čtení) `nejvyšší číslo WooCommerce <
   poslední číslo řady`; kdyby ne, řadu jen **zvýšit** (nový pojistný skript
   „jen nahoru“ — připravím na pokyn).
5. **Den přepnutí:** pokladna WooCommerce vypnout → počkat na rozběhnuté
   platby → odečíst skutečné poslední číslo → spustit 20/21/22.

## Co je potřeba od vedení

- **WordPress → WooCommerce → Objednávky:** číslo nejnovější objednávky
  a zda jsou čísla posledních objednávek souvislá (např. 5091, 5092, 5093)
  nebo skáčou (5088, 5101, 5117…). Screenshot seznamu stačí.
- Případně **WordPress → Pluginy:** je aktivní doplněk typu „Sequential
  Order Numbers“ / „Custom Order Numbers“? (Pokud audit nenajde veřejně.)

# Pilot: faktura k objednávce WooCommerce #5215 (Food Fest Crew s.r.o.) z MojeBegina

Rozhodnutí majitele 19. 10. 2026: fakturu k #5215 nevystaví Lucie ručně, ale
MojeBegina přes existující integraci iDokladu (první skutečná faktura).

## Ověřené údaje (WooCommerce, detail objednávky #5215, 19. 10. 2026)

| | |
|---|---|
| Odběratel | Food Fest Crew s.r.o., IČO 08911088, DIČ CZ08911088 |
| Kontakt | Tomáš Herout, tom.herout@seznam.cz, +420 723 141 743 |
| Fakturační adresa (WooCommerce) | 251, 691 22 Pasohlávky → sídlo v MojeBegina **„Pasohlávky 251, 691 22 Pasohlávky“** |
| Položky | Dýňová polévka 379 Kč × 30 = 11 370 Kč; Chlazená přeprava 1 277 Kč |
| Celkem / zaplaceno | 12 647 Kč, kartou 19. 10. 2026 v 6:23 (WooPayments `pi_3US86dCEhzAMgcfb0ufGppo3`) |

## Co faktura bude obsahovat

- Řada **E-shop Begina (7277293)**, číslo přidělí iDoklad (náhled: 9260001).
- Odběratel = firma: název, IČO, DIČ, sídlo; kontaktní osoba Tomáš Herout.
  Kontakt v iDokladu se najde **podle IČO** (z faktury 20260184) — nový se nezakládá.
- **VS 5215**, číslo objednávky 5215, popis „Objednávka 5215 (begina.cz)“.
- Položky: 30× Dýňová polévka à 379 Kč, Doprava: Chlazená přeprava 1 277 Kč.
- Datum vystavení = DUZP = 19. 10. 2026, úhrada kartou, stav uhrazeno.
- PDF pošle MojeBegina Tomášovi e-mailem „Faktura k objednávce 5215“ (iDoklad nic neposílá).

## Pojistky proti dvojí faktuře

- před vystavením hledání faktury s VS 5215 v iDokladu (Lucie ji nevystavila),
- jedna faktura na objednávku, zámek proti souběhu, uložené ID z iDokladu,
- víc kontaktů se stejným IČO = stop bez zápisu,
- import 5215 jen jednou (unikátní `external_woocommerce_id`, pojistka ve skriptu).

## Postup (pořadí je závazné, každý krok jen se souhlasem)

1. **Neon main:** `60_firmy_migrace_0022.sql` (prázdný sloupec DIČ + unikátní index;
   stávající kód to neruší). Musí běžet **před** nasazením kódu.
2. **Sloučit PR a nasadit Production** (fakturace zůstává `manual`).
3. **MojeBegina → Obchod → lead „Tomáš Herout“ → Převést na zákazníka:**
   název `Food Fest Crew s.r.o.`, IČO `08911088`, sídlo `Pasohlávky 251, 691 22 Pasohlávky`,
   kontakt Tomáš Herout / tom.herout@seznam.cz. Lead zůstane, propojí se s firmou.
4. **Neon main:** `61_food_fest_5215_before.sql` → čekáno `1 | 1 | ano | 0 | 0`,
   pak `62_food_fest_5215.sql`, pak `63_food_fest_5215_after.sql` → `1 | CZ08911088 | 12647 | 1 | paid | 0`.
5. **Detail objednávky** (Objednávky → „Objednávka z WooCommerce č. 5215“): zkontrolovat
   návrh faktury (odběratel, IČO, DIČ, položky, VS 5215) → **jednou** „Vystavit fakturu v iDokladu“.
6. Kontrola v iDokladu (řada E-shop Begina, uhrazeno, žádný e-mail z iDokladu) a e-mail Tomášovi.

Návrat importu (jen dokud není vystavená faktura): `69_food_fest_5215_rollback.sql`.
Na Preview se do iDokladu nikdy nic neodesílá — tam jde ověřit jen návrh faktury.

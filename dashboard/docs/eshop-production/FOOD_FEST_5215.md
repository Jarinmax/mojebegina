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
- **duplicita mimo MojeBegina** — projdou se faktury firmy v iDokladu od dne úhrady
  (jakákoli řada):
  - vystavené MojeBegina (ID uložené u jiné objednávky) = jiné objednávky, **neblokují**,
  - cizí faktura s VS / číslem objednávky / číslem v popisu této objednávky = **stop** (duplicita),
  - cizí faktura se **stejnou částkou** bez odkazu = **stop** (nejasné → ruční kontrola),
  - ostatní cizí faktury (jiná částka, jiný odkaz) = jiné objednávky, neblokují.
  Stop platí jen pro dané vystavení — další objednávky firmy se vystavují dál,
- import 5215 jen jednou (unikátní `external_woocommerce_id`, pojistka ve skriptu).

## Kolize migrace 0022 s PR #21 (ChatGPT pilot)

PR #21 (Draft) má vlastní `0022_gpt_mcp_pilot` a `0023_customer_card_preview`;
v Production ani jedna neběžela (ověřeno read-only 19. 10.: tabulky `agent_*`,
`organization_activity`, `customer_card_preview_log` neexistují). Tento PR jde do
`main` první, takže **0022 = firmy na faktuře**. PR #21 se při sloučení s `main`
přečísluje na 0023/0024 a znovu vygeneruje snapshoty (`drizzle-kit generate`) — jeho
produkční SQL skripty jsou samostatné, na čísle souboru nezávisí. Do větve PR #21
tento PR nesahá.

### Evidence migrací Drizzle

Production nemá tabulku `__drizzle_migrations` (ověřeno read-only 20. 10.) — migrace se
na Neon nikdy nespouštěly přes `drizzle-kit migrate`, vždy ručními SQL skripty (0013–0021
stejně). `drizzle/` + `meta/` slouží ke generování dalších migrací a k testům; build
(`next build`) ani nasazení migrace nespouští. Skript 60 = přesně DDL z `0022`
(generálka nad kopií Production porovná výsledné schéma se schématem kódu).
Kompatibilita s PR #21: jeho migrace `0022_gpt_mcp_pilot` + `0023_customer_card_preview`
se po této 0022 aplikují bez konfliktu (ověřeno nad PGlite 20. 10.).

## Zákaznická karta bez duplicity

Rozhodnutí 20. 10. 2026: firma **nevznikne ručním převodem leadu v aplikaci**, ale
skriptem `65_food_fest_crew_a_5215_MAIN.sql` — v jedné transakci a bez ručního přepisování:

- založí **Food Fest Crew s.r.o.** (IČO 08911088, DIČ CZ08911088, sídlo
  „Pasohlávky 251, 691 22 Pasohlávky“, stav „Zákazník Begina“, obchodník a „získal“ z leadu),
- převede lead Tomáše Herouta (`cb5b6742…`, tom.herout@seznam.cz): fáze „převeden“,
  propojení s firmou, záznam v historii leadu („Import WooCommerce (skript 65)“). Lead zůstává,
- **nezaloží uživatelský účet** — Tomáš nedostane účet, heslo ani pozvánku
  (pozvat se dá později ručně),
- naimportuje objednávku 5215 (stejná data jako dřívější skript 62, ten je nahrazen).

Pojistky (každá = stop, nic se nezmění): chybí migrace 60; firma s IČO 08911088 už je;
objednávka 5215 už je; fakturační zákazník s IČO už je; lead s tím e-mailem není právě
jeden; lead `cb5b6742…` nemá e-mail tom.herout@seznam.cz nebo už je převedený; platba
nesedí s cenou. Druhé spuštění se tedy vždy zastaví.

Fakturační zákazník (invoice_customers) = firma podle IČO, jeden na IČO.

## Postup (pořadí je závazné, každý krok jen se souhlasem)

1. ~~Neon main: `60_firmy_migrace_0022.sql`~~ — hotovo 20. 10. 2026.
2. ~~Sloučit PR #24 a nasadit Production~~ — hotovo 20. 10. 2026 (fakturace `manual`).
3. **Neon main:** `64_food_fest_crew_a_5215_before.sql` → čekáno `1 | 1 | 0 | ano | 0 | 0`.
   Jiný výsledek = nespouštět dál.
4. **Neon main:** `65_food_fest_crew_a_5215_MAIN.sql` → hláška „Hotovo: Food Fest Crew s.r.o. založena…“.
5. **Neon main:** `68_food_fest_crew_a_5215_after.sql` →
   `1 | CZ08911088 | ano | 1 | 0 | 1 | 12647 | 1 | paid | 0`.
6. **Ověřit v iDokladu (Lucie / ty):** Faktury vydané → hledat „Food Fest“ a „5215“ —
   žádná faktura k 5215 (integrace to před vystavením zkontroluje také — VS, číslo
   objednávky, popis a stejná částka).
7. **Detail objednávky** (Objednávky → „Objednávka z WooCommerce č. 5215“): zkontrolovat
   návrh faktury (odběratel, IČO, DIČ, položky, VS 5215) → **jednou** „Vystavit fakturu v iDokladu“.
8. Kontrola v iDokladu (řada E-shop Begina, uhrazeno, žádný e-mail z iDokladu) a e-mail Tomášovi.

Návrat (jen dokud není vystavená faktura): `69_food_fest_5215_rollback.sql` — smaže
import 5215; firmu ze skriptu 65 smaže také a lead vrátí do původní fáze (jen pokud
k firmě mezitím nic nepřibylo — jinak se zastaví celý). Po návratu platí znovu krok 3.
Na Preview se do iDokladu nikdy nic neodesílá — tam jde ověřit jen návrh faktury.

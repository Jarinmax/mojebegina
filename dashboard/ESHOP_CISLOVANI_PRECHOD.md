# Číslování objednávek — vlastní řada 70000001+ (číslo objednávky = VS)

Stav: **NÁVRH ke schválení, nic se nemění.** Návrh vedení 10. 10. 2026:
vlastní řada od 70000001, nezávislá na ID WordPressu. Připravené skripty
`docs/eshop-production/30–39_cislovani_vs*.sql`, test
`lib/eshop/__tests__/numberingVs.test.ts`. Starší postup 20–29 (START
navazující na WooCommerce) se po schválení **nespouští**.

## Ověřený stav (10. 10. 2026)

| Fakt | Zdroj |
|---|---|
| WooCommerce: poslední objednávka **#5208** (8. 10. 2026), předchozí #5207, #5206, #5202; celkem 56 | vedení |
| Čísla WooCommerce skáčou (5202 → 5206) = ID WordPressu (žádný doplněk pro čísla); šablona Elementoru má ID 5100 | audit webu |
| Production: `order_number` u všech objednávek prázdné, `order_number_seq` neexistuje | Neon, jen čtení |
| Production: 2× import The Cup (bez čísla i VS), 1× e-shop **stornovaná, VS 70000001**, nezaplacená | Neon, jen čtení |
| `payment_vs_seq` = 1 (další VS 70000002), VS je unikátní a neměnný, formát `7xxxxxxx` | Neon + migrace 0020 |
| Stripe: tabulka plateb prázdná; Stripe páruje platbu podle interního id objednávky, číslo je jen v textu položky | Neon + `lib/eshop/stripe/payment.ts` |
| iDoklad: e-shopové faktury žádné (2 importované The Cup); faktura nese VS = `payment_vs`, číslo objednávky jako `OrderNumber`; číslo faktury je vlastní řada iDokladu | Neon + `lib/eshop/invoicing` |

## Návrh: jedna řada pro číslo objednávky i VS

- **E-shopová objednávka: číslo = její VS** (70000002 má VS 70000002).
  Zákazník, MojeBegina, banka, Stripe i faktura vidí jedno číslo.
- **Ruční objednávka v MojeBegina:** další číslo z téže řady, VS se jí
  nezapisuje (B2B platí podle faktury). Žádné číslo tak nevznikne dvakrát.
- **Import (The Cup):** bez čísla jako dosud.
- **Řada nezávisí na WordPressu:** 8 číslic proti 4 číslicím WooCommerce →
  žádná kolize čísel ani VS v bance, žádná rezerva, návrat na WooCommerce
  je bez rizika pro číslování.
- **Kód aplikace se nemění** — číslo doplní trigger v databázi (pokladna
  číslo po uložení čte z databáze).

Proč ne dvě samostatné řady (číslo 70000001+ a VS 70000001+): rozešly by
se hned první ruční objednávkou (číslo bez VS) → „objednávka č. 70000005
s VS 70000004“ a stejné číslo by patřilo dvěma různým objednávkám
(převod platby v MojeBegina hledá podle čísla i VS).

### 70000001, nebo 70000002?

**Doporučuji: testovací objednávka si nechá 70000001, první nová dostane
70000002** (automaticky, řada už je na 1).

- VS 70000001 už existuje, je neměnný a mohl odejít v e-mailu / QR.
  Jiné číslo by u ní znamenalo „číslo ≠ VS“ (pojistka by to odmítla).
- Aby nová objednávka měla 70000001, musel by se VS testovací objednávky
  přepsat nebo objednávka smazat — zbytečný zásah do historie. Ztráta
  jednoho čísla nic nestojí.
- V přehledu bude „č. 70000001, Stornováno“.

## Postup (Neon SQL Editor, Production — až po schválení)

Zapnout lze kdykoli **před** přepnutím DNS (nezávisí na WooCommerce).

1. `30_cislovani_vs_before.sql` → očekáváno `0 | 0 | 2 | 1 | 0 | 0 | 0 | 70000001`
   (přibylé e-shopové / ruční objednávky jsou v pořádku; `eshop_bez_vs`
   a `s_cislem` musí být 0).
2. `31_cislovani_vs.sql` — jedna transakce; při jakékoli odchylce skončí
   „zastavuji“ a nezmění nic. Pojistky: chybí řada VS, existuje řada Preview,
   už zapnuto, některá objednávka už číslo má, e-shop bez VS.
3. `32_cislovani_vs_after.sql` → očekáváno `1 | 3 | 2 | 0 | 0 | 70000001 | 70000002`.
4. Kontrola v MojeBegina: Objednávky → „č. 70000001“ u stornované.
   První skutečná objednávka: číslo = VS v e-mailu, na stránce i v QR.

Návrat: `39_cislovani_vs_rollback.sql` — nové objednávky přestanou dostávat
číslo (VS dál ano), přidělená čísla zůstanou. Řada se nevrací → žádné číslo
nevznikne dvakrát. (Skript 31 pak znovu nepůjde — přidělená čísla
existují; znovuzapnutí připravím na pokyn.)

Ověřeno testem nad kopií schématu (PGlite, všechny migrace, data jako
v Production): kontroly před/po, 70000001 → 70000002, ruční 70000003 bez
VS, žádné číslo dvakrát, číslo nejde změnit ani vložit jiné než VS / mimo
70000001–79999999, druhé spuštění odmítne, návrat, ruční objednávky
z doby před zapnutím, odmítnutí na DB s řadou Preview.

## Rizika

| Riziko | Dopad | Ošetření |
|---|---|---|
| Číslo se nevrací — neúspěšné uložení „spotřebuje“ číslo | mezery v řadě | u objednávek nevadí; souvislou řadu mají faktury (iDoklad) |
| Ruční objednávky berou čísla z téže řady | e-shopová čísla nejdou po jedné | záměr — jedno číslo nikdy dvakrát |
| Preview má řadu 900001+ (`order_number_seq`) | skript 31 tam nejde (pojistka) | Preview zůstává; případně samostatný skript na pokyn |
| Trigger mimo Drizzle schéma | generování migrací ho „nevidí“ | stejně jako u VS (0020); hlídá test |
| Zákazníci zvyklí na „#52xx“ | nové číslo je 8místné | „Číslo objednávky“ = „VS“ všude |
| Kapacita | 9 999 999 objednávek | dost |

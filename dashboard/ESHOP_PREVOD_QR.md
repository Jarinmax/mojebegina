# ESHOP 1.0 — bankovní převod, QR Platba a číslování objednávek (jen Preview)

Stav (2. 10. 2026): implementováno na větvi `claude/great-bell-ffjwo3`.
**Production beze změny** — tam se číslování zapne až v den přepnutí
z WooCommerce (start = nejvyšší číslo z WooCommerce).

## Rozhodnutí vedení (2. 10. 2026)

- Číslování a QR platba v jednom kroku; **VS = číslo objednávky**.
- Preview: testovací řada od **900001**.
- Splatnost převodu **5 dní**; po splatnosti se objednávka jen označí
  („Po splatnosti“ v MojeBegina), nic se automaticky neruší.
- Po ručním označení Zaplaceno v MojeBegina dostane zákazník e-mail
  „Platbu jsme přijali“ — nejvýš jednou.
- QR na stránce objednávky i v potvrzovacím e-mailu.

## Jak to funguje

- **Číslo objednávky** přidělí databáze při uložení (sekvence
  `order_number_seq`, výchozí hodnota sloupce) — atomicky, bez kolizí ani
  při souběžných objednávkách. Jedna řada pro e-shop i ruční objednávky;
  importované (The Cup) zůstávají bez čísla. Dokud skript na daném
  prostředí neběžel, objednávky číslo nemají a všude se ukazuje krátká
  reference (tak je to dnes v Production).
- **Účet** se bere z proměnných prostředí (`ESHOP_BANK_ACCOUNT`,
  `ESHOP_BANK_IBAN`), není v kódu. IBAN se ověřuje kontrolním součtem —
  překlep = QR se neukáže.
- **QR Platba** (český standard SPAYD, čtou ho všechny české bankovní
  aplikace): IBAN, částka, CZK, datum platby, VS, zpráva „BEGINA OBJEDNAVKA
  900001“. Jen když je IBAN i číslo objednávky. **Datum platby v QR = den
  vytvoření objednávky** (český čas; rozhodnutí vedení 3. 10. 2026) —
  některé bankovní aplikace ho použijí jako datum odeslání platby. Interní
  splatnost +5 dní („Zaplaťte prosím do …“, „Po splatnosti“) je oddělená. Testy QR obrázek čtou zpět
  a ověřují přesný obsah (z e-mailu i ze stránky).
- **E-mail:** QR je obrázek vložený do zprávy přes Content-ID (`cid:`) —
  zobrazí se i v klientech, které blokují externí obrázky; data: URL by
  Gmail/Outlook nezobrazily. Účet, IBAN, částka, VS a splatnost jsou vždy
  i textem.
- **Stránka objednávky** `/eshop/objednavka/<id>`: platební údaje + QR,
  splatnost, po splatnosti upozornění. Z pokladny vede tlačítko
  „Platební údaje a QR kód“.
- **MojeBegina:** štítek „Po splatnosti“ v seznamu i detailu, v detailu
  splatnost a VS. Ruční Zaplaceno → e-mail „Platbu jsme přijali“ (jen
  e-shop; u karty jen když zákazník ještě nedostal potvrzení o zaplacení;
  přepnutí tam a zpět nic dalšího nepošle; výpadek e-mailu stav neshodí,
  jen varování v historii).

## Postup — Preview

### 1. Vercel → Environment Variables (jen Preview)

| Proměnná | Hodnota |
|---|---|
| `ESHOP_BANK_ACCOUNT` | číslo účtu v tuzemském tvaru, např. `123456789/0100` |
| `ESHOP_BANK_IBAN` | IBAN téhož účtu, např. `CZ65 0800 0000 1920 0014 5399` (mezery nevadí) |

Uložit → Redeploy posledního nasazení větve.

### 2. Neon → SQL Editor → větev `preview/claude/great-bell-ffjwo3`

Kontrola před, skript, kontrola po — viz zpráva Claude (2. 10. 2026);
skript je `docs/eshop-schema-draft/06b_order_number_cutover_up.sql`
s `<MAX_WOO_ORDER_NUMBER>` = `900000`. Návrat:
`06b_order_number_cutover_down.sql` (přidělená čísla zůstanou).

### 3. Test

1. Pokladna → Bankovní převod → Objednat → „Platební údaje a QR kód“:
   číslo objednávky 9000xx, QR, účet, VS, splatnost (+5 dní).
2. E-mail [TEST] „Přijali jsme vaši objednávku 9000xx“ s QR → naskenovat
   bankovní aplikací (nic neodesílat) → sedí účet, částka, VS.
3. MojeBegina → detail objednávky → Platba: Zaplaceno → přijde
   „Platbu za objednávku 9000xx jsme přijali“; přepnout zpět a znovu →
   nic dalšího.

## Ověřeno (bez sítě)

- 33 nových testů: IBAN/kontrolní součet, splatnost, po splatnosti,
  SPAYD (vč. času těsně před půlnocí), QR čitelný zpět; skript číslování
  nad PGlite s daty jako na Preview (pořadí podle data, import bez čísla,
  souběžné objednávky, CHECK, opakované spuštění, pojistka vyššího čísla,
  návrat); pokladna → číslo 900001 → e-mail s QR (přečten zpět) → ruční
  Zaplaceno → „Platbu jsme přijali“ jednou; karta; výpadek e-mailu.
- Prohlížeč (aplikace + testovací DB v paměti se zapnutým číslováním):
  pokladna → „Platební údaje a QR kód“ → stránka s QR; QR ze screenshotu
  se přečte na správnou platbu.
- **Neověřeno:** skenování skutečnou bankovní aplikací a skutečné
  doručení e-mailu s QR — první test v Preview.

## Rozhodnutí o VS a fakturaci (vedení 3. 10. 2026) — zatím neimplementováno

- **Varianta A:** VS je samostatný platební identifikátor objednávky, uloží se
  natrvalo do `orders.payment_vs` při vytvoření objednávky; zákazník platí
  tímto VS (dnes se VS dopočítává z čísla objednávky — změní se s migrací).
- Po potvrzení platby vznikne faktura s **vlastním číslem**, která ponese
  stejné `payment_vs`. Platba ↔ objednávka ↔ faktura jednoznačně propojené.
- Samostatná tabulka **`payments`** (přijaté platby) připravená na pozdější
  automatické párování bankovních transakcí (VS + částka, jedinečné ID
  transakce).
- **Fakturace se zatím neimplementuje** — čeká na potvrzení číselné řady
  faktur a způsobu napojení na e-doklad. Faktury The Cup 20260152
  a 20260153 se **nepovažují** za řadu, ve které e-shop pokračuje
  (potvrdí Lucie).
- Finální schéma a workflow (5. 10. 2026, směr schválen, schéma k odsouhlasení):
  `ESHOP_FAKTURACE_NAVRH.md`.

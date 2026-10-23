# Úpravy budoucích faktur MojeBegina (po faktuře 9260001)

Návrh 20. 10. 2026 podle kontroly první faktury 9260001 (Food Fest Crew, objednávka 5215).
Faktura **9260001 zůstává beze změny** (nemaže se, nepřečíslovává, znovu neposílá).
Úpravy platí jen pro faktury vystavené po sloučení a nasazení.

| | Dosud (9260001) | Nově |
|---|---|---|
| Text za položkami | výchozí text agendy iDokladu (o nedodržení splatnosti) | **úplně nahrazen**: jen „Faktura je již uhrazena – neplaťte.“ + ověřená dodací adresa |
| Položka dopravy | „Doprava: Chlazená přeprava“ | **„Chlazená přeprava“** (název dopravy) |
| Fakturační adresa | firma: sídlo; osoba: adresa z pokladny | beze změny (odběratel) |
| Dodací adresa | na faktuře chyběla | **„Dodací adresa: příjemce, ulice, PSČ obec“** — jen z explicitních polí objednávky, jinak STOP |
| Datum vystavení | den úhrady (9260001: 19. 10.) | **skutečný den vystavení** |
| Splatnost | den úhrady | den vystavení |
| DUZP | den úhrady | **zatím beze změny (den úhrady)** — čeká na rozhodnutí Jaroslava a Lucie (datum dodání / jiný rozhodný den) |
| Datum úhrady | den úhrady | beze změny — den skutečné úhrady (např. platba kartou 19. 10.) |
| Kopie e-mailu s fakturou | — | **skrytá kopie (Bcc)** na `ESHOP_EMAIL_INVOICE_COPY_TO` |

Text „před položkami“ z agendy zůstává.

## Dodací adresa — pravidla

- Jen z explicitních polí objednávky: příjemce `recipient_name`, adresa `recipient_address`,
  kód dopravy `shipping_method_code`. **Nikdy z poznámky zákazníka** ani z fakturační adresy.
- Osobní odběr = jen kód `osobni-odber` (pokladna e-shopu). Vše ostatní, včetně importů
  z WooCommerce bez kódu dopravy, je **zásilka**.
- Zásilka se vystaví jen s ověřenou dodací adresou; jinak blokující chyba
  „… — opravit u objednávky, faktura se do té doby nevystaví“ (nic se nepošle do iDokladu):
  - adresa chybí (`delivery_address_missing`),
  - nejde rozdělit na ulici, PSČ a obec (`delivery_address_unparsed`),
  - před číslem není ulice ani obec, např. „251, 691 22 Pasohlávky“ (`delivery_address_unreliable`),
  - chybí příjemce (`delivery_recipient_missing`).
- Odběratel (fakturační adresa) = firma se sídlem z karty firmy, resp. osoba s adresou
  z pokladny (pokladna sbírá jednu adresu). Existující kontakt v iDokladu se nepřepisuje.
- iDoklad má `DeliveryAddressId`, ale jen pro adresy uložené u kontaktu (zápis do
  kontaktů MojeBegina nemá povolený) — proto adresa v textu za položkami.

### Objednávka 5215 (čteno z Production 20. 10. 2026, beze změny)

| Pole | Hodnota |
|---|---|
| Fakturační adresa (sídlo firmy) | Pasohlávky 251, 691 22 Pasohlávky |
| `recipient_name` | Tomáš Herout |
| `recipient_address` | 251, 691 22 Pasohlávky |
| `customer_note` | Prosím o dovoz do Drnholce do areálu Světa bludišť , děkuji. |
| Doprava | Chlazená přeprava (kód dopravy prázdný = zásilka) |

Podle nových pravidel by 5215 skončila STOPem (`delivery_address_unreliable`) — skutečné
místo doručení (Drnholec, areál Světa bludišť) je jen v poznámce, a z ní se nic neodvozuje.

## Kopie e-mailu s fakturou

- Vercel: `ESHOP_EMAIL_INVOICE_COPY_TO=viner.jaroslav@gmail.com, lucie.konigsbergova@seznam.cz`
  (nastaví majitel; adresy nejsou v kódu).
- Jen u e-mailu s PDF faktury, jako **skrytá kopie**; adresa, která už je v „Komu“, se nezdvojí.
- Preview: kopie jen na adresy z `ESHOP_EMAIL_TEST_RECIPIENTS`. Prázdná proměnná = bez kopie.
- Historie objednávky u odeslaného e-mailu zapisuje i skryté kopie.

## Data

- Návrh se při vystavení vždy sestaví znovu → datum vystavení = den kliknutí na
  „Vystavit fakturu v iDokladu“ (režim `manual`), resp. den automatického vystavení (`on`).
- Pojistky proti dvojí faktuře dál počítají od dne úhrady.

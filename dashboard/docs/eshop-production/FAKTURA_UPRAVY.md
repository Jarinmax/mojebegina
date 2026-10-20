# Úpravy budoucích faktur MojeBegina (po faktuře 9260001)

Návrh 20. 10. 2026 podle kontroly první faktury 9260001 (Food Fest Crew, objednávka 5215).
Faktura **9260001 zůstává beze změny** (nemaže se, nepřečíslovává, znovu neposílá).
Úpravy platí jen pro faktury vystavené po sloučení a nasazení.

| | Dosud (9260001) | Nově |
|---|---|---|
| Text na faktuře | — | za položkami: **„Faktura je již uhrazena – neplaťte.“** |
| Položka dopravy | „Doprava: Chlazená přeprava“ | **„Chlazená přeprava“** (název dopravy; bez názvu „Doprava“) |
| Fakturační adresa | firma: sídlo; osoba: adresa z pokladny | beze změny (odběratel) |
| Dodací adresa | na faktuře chyběla | zvlášť, za položkami: **„Dodací adresa: příjemce, adresa“**; osobní odběr: „Doručení: způsob dopravy“ |
| Datum vystavení | den úhrady (9260001: 19. 10.) | **den, kdy se faktura vystavuje** |
| DUZP / splatnost | den úhrady | den vystavení |
| Datum úhrady | den úhrady | beze změny — **den skutečné úhrady** (např. platba kartou 19. 10.) |
| Kopie e-mailu s fakturou | — | **skrytá kopie (Bcc)** na adresy z `ESHOP_EMAIL_INVOICE_COPY_TO` |

Text agendy „za položkami“ z iDokladu (je-li nastavený) zůstává — připojí se za naše řádky.
Text „před položkami“ z agendy beze změny.

## Kopie e-mailu s fakturou (Jaroslav Viner, Lucie Königsbergová)

- Nová proměnná prostředí ve Vercelu: `ESHOP_EMAIL_INVOICE_COPY_TO` = e-mailové adresy
  oddělené čárkou. Adresy do kódu nepíšeme — doplní je majitel.
- Kopie jde jen u e-mailu, který nese PDF faktury, jako **skrytá kopie** (zákazník
  adresy Beginy nevidí). Adresa, která už je v „Komu“, se nezdvojí.
- Preview (testovací režim): kopie dostanou jen adresy z `ESHOP_EMAIL_TEST_RECIPIENTS`.
- Prázdná proměnná = bez kopie (dnešní stav). Historie objednávky u odeslaného e-mailu
  zapisuje i seznam skrytých kopií.

## Fakturační vs. dodací adresa

- Odběratel na faktuře = kontakt v iDokladu: **firma podle IČO se sídlem**, osoba
  s adresou z pokladny. Pokladna dnes sbírá jen jednu adresu (doručovací), takže
  u soukromé osoby jsou obě stejné; u firmy se liší (sídlo × místo doručení).
- Dodací adresa = příjemce a adresa z objednávky (`recipient_name`, `recipient_address`),
  vytištěná v textu za položkami. iDoklad má pole `DeliveryAddressId`, ale jen pro
  doručovací adresy uložené u kontaktu — jejich zakládání by znamenalo měnit
  kontakty v iDokladu (zápis, který MojeBegina nemá povolený), proto text.
- Existující kontakt v iDokladu (nalezený podle IČO) se nepřepisuje — na faktuře
  bude adresa, kterou má kontakt v iDokladu.

## Data

- Návrh faktury se při vystavení vždy sestaví znovu z aktuálních údajů, takže datum
  vystavení je den kliknutí na „Vystavit fakturu v iDokladu“ (režim `manual`) nebo
  den automatického vystavení (režim `on`).
- Pojistky proti dvojí faktuře dál počítají od dne úhrady (VS 31 dní zpět, faktury
  firmy od dne úhrady).

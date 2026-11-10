# Alergeny a tvrzení — interní posouzení (stav 10. 11. 2026)

Interní přehled pro vedení (Jarin, Lucie). Na web se nic z toho nepíše.

## 1. Upozornění dodavatelů (cross-contact)

| Surovina | Dodavatel | Upozornění | Produkty |
|---|---|---|---|
| lahůdkové droždí (sušené neaktivní kvasnice, není kvasnicový extrakt) | Bazar Zdrowia | možná kontaminace lepkem při balení | Dýňová polévka, Kulajda, Gulášová polévka z hlívy ústřičné |

Výroba navíc probíhá ve společném prostoru s lepkem a mlékem (sdělení vedení).

**Čeká na posouzení kontaminace (cross-contact):** Dýňová, Kulajda, Gulášová z hlívy
(lahůdkové droždí) a všech 6 polévek kvůli sdílenému provozu (lepek, mléko).
Do dokončení: žádné „bez lepku“, „přirozeně bezlepková“ ani obecné „může obsahovat“.

## 2. Produkty s neúplnými povinnými údaji → objednání blokováno

| Produkt | Co chybí | Úkol | Stav na e-shopu |
|---|---|---|---|
| Kosmopolitan | etiketa jablečné šťávy (složení, siřičitany); specifikace grepového esenciálního oleje (potravinářské použití) | BEG-02 | „Připravujeme“, nejde objednat |

Brusinková šťáva vyřešena 10. 11. 2026: etiketa Naturalne Tłoczone,
„100% sok z żurawiny“, NFC, pasterizovaná, siřičitany neuvedeny.

Mechanismus: `allergens = NULL` → `isOrderable()` = false (karta, košík,
pokladna i serverová kontrola v `lib/eshop/pricing.ts`). Řádek Alergeny se
nezobrazí, žádné veřejné „Ověřujeme“.

Lady Carneval — „aromata“ jsou převzata ze složení Aperolu (hotový výrobek);
k doložení specifikace (BEG-02), objednání se neblokuje.

## 3. Chybějící specifikace nakupovaných surovin

Bez nich nelze potvrdit „bez barviv“ ani „bez přidaného glutamátu“ a nelze
plně uzavřít kontrolu alergenů v podsložkách:

- přírodní aroma (Dýňová, Tomatová, Tomatová s červenou řepou, Kosmopolitan)
- pasírovaná rajčata, rajčatový protlak
- paprika uzená, paprika sladká, chilli, další koření a směsi
- hlíva ústřičná (zpracovaná?), žampiony
- lahůdkové droždí — technický list (podíl volného glutamátu)
- jablečná šťáva, šťáva z granátového jablka (složení, siřičitany)
- třtinový cukr (etiketa)

### Vyřešené podklady (etikety dodány 10. 11. 2026)

| Surovina | Výrobce | Etiketa | Alergeny |
|---|---|---|---|
| brusinková šťáva | Naturalne Tłoczone | 100% šťáva z brusinek, NFC, lisovaná za studena, pasterizovaná | žádné uvedeny |
| citronová šťáva | Naturalne Tłoczone | 100% šťáva z citronů, NFC, pasterizovaná | žádné uvedeny |
| grapefruitová šťáva | Naturalne Tłoczone | 100% šťáva z grapefruitů, NFC, pasterizovaná | žádné uvedeny |
| pomerančová šťáva | Belfood (Jurajskie Wzgórza) | 100% pomerančová šťáva **z koncentrátu**, pasterizovaná | žádné uvedeny |

Pomerančová šťáva je z koncentrátu (vyhl. 248/2018 Sb. § 2 písm. i)) —
doporučení: ve složení Svařáku Deluxe uvádět „pomerančová šťáva
z koncentrátu“ (zatím neměněno, čeká na rozhodnutí).

## 4. Tvrzení — rozhodnutí

| Tvrzení | Stav |
|---|---|
| „přirozeně bezlepková“ (6 polévek) | ODSTRANIT — skript 83 |
| „bez lepku“ | nepoužívat (nař. 828/2014: ≤ 20 mg/kg + zvládnutá kontaminace) |
| „bez alergenů“, „Ověřujeme“ | nepoužívat |
| „bez barviv“ (polévky) | nezveřejňovat, chybí specifikace (bod 3) |
| „bez přidaného glutamátu“ | nezveřejňovat — lahůdkové droždí je přirozený zdroj glutamátu; riziko zavádějícího tvrzení (čl. 7 nař. 1169/2011) |
| „bez konzervantů“ | nepoužívat |
| „bez přídatných látek“, „bez éček“ | nikdy (polévky obsahují E 435 a kyselinu askorbovou) |
| „čistá filtrovaná voda“ | PONECHAT (rozhodnutí vedení 10. 11. 2026) u výrobků, které ji obsahují; podmínka vyhl. 417/2016 Sb. § 2 odst. 4 písm. b): mít doložitelnou filtraci (typ filtru, údržba, rozbor vody) |
| „bez mléčných výrobků“ (úvod kategorie) | odpovídá recepturám; riziko kvůli sdílené výrobě s mlékem — viz bod 1 |

## 5. Ke kontrole (mimo polévky, zatím neměněno)

- Výhoda „bez umělých aromat a barviv“ u 20 produktů (sirupy, čaje, ovocné
  nápoje, Svařák, Kosmopolitan). Nařízení 1334/2008 kategorii „umělé aroma“
  nezná; u Lady Carneval jsou barviva E110/E124 (tam tvrzení není).
- Úvod Sirupů: „bez umělých aromat, barviv a zbytečných konzervantů“ —
  „zbytečných“ naznačuje, že nějaké konzervanty obsahují.

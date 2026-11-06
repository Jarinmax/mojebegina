# Obchodní podmínky: znění, formulář pro odstoupení, PDF v potvrzení

Schváleno majitelem 26. 10. 2026 (body 1–4). Kód: `lib/eshop/content/termsVersions.ts`,
`lib/eshop/content/withdrawalForm.ts`, `lib/eshop/legal/termsPdf.ts`,
`lib/eshop/email/orderEmails.ts`.

## Co se změnilo

| | 1. znění `2026-09-22` | 2. znění `2026-10-27` |
|---|---|---|
| Text čl. I–XIII | dodaný vedením 3. 10. 2026 | beze změny, jen v čl. VII nová věta: „K odstoupení může spotřebitel využít vzorový formulář, který je přílohou těchto obchodních podmínek. Jeho použití není povinné.“ |
| Příloha | — | Vzorový formulář pro odstoupení od smlouvy (nepovinné číslo objednávky) |
| Účinnost | 22. září 2026 | 27. října 2026, upravit na skutečný den nasazení (viz níže) |

**Právní základ formuláře:** nařízení vlády č. 29/2023 Sb. ve znění nařízení
č. 66/2026 Sb. (účinné od 19. 6. 2026). Dříve citované nařízení č. 363/2013 Sb.
je zrušené. Adresáta doplňuje obchodník. Jediný doplněk proti vzoru je řádek
„Číslo objednávky (nepovinné)“.

**Ověřit před sloučením:** text formuláře porovnat s úplným zněním přílohy
v e-Sbírce (https://www.e-sbirka.cz/sb/2023/29). Z prostředí, kde PR vznikl, se
e-Sbírka otevřít nedala (síťová politika). Sporné bývá hlavně slovo u podpisu:
„zasílán na listině“ / „v listinné podobě“. Kdyby se znění lišilo, opraví se
`withdrawalForm.ts` a znovu se zapíše otisk 2. znění v testu (2. znění ještě
nikde neplatilo).

## Uchování znění platného při objednávce

1. Každé znění je v kódu **neměnné**. Test `termsVersions.test.ts` hlídá otisk
   SHA-256 textu i PDF každého znění, takže úprava už platného znění neprojde.
   Nový text patří do nového znění s vlastním datem.
2. Objednávka si **při vzniku zapíše znění**, se kterým zákazník v pokladně
   souhlasil (`order_activity` „created“, `metadata.termsVersion`). Objednávky
   z doby před touto změnou mají 1. znění, jiné tehdy neexistovalo.
3. **Potvrzovací e-mail** nese PDF právě tohoto znění: u převodu hned po
   objednávce, u karty po zaplacení (i kdyby mezitím začalo platit nové znění).
   Do historie (`email_sent.metadata.attachments`) se zapíše znění, název
   souboru, velikost a **SHA-256 odeslaného PDF**.
4. PDF je deterministické, takže pro každé znění jde kdykoli znovu vytvořit
   bajt po bajtu. Trvale je ke stažení na `begina.cz/obchodni-podminky/<znění>.pdf`
   (na moje.begina.cz pod `/eshop/…`), odkaz je i na stránce podmínek
   a v e-mailu.
5. Když se PDF nepodaří vytvořit, potvrzení odejde i tak (s odkazem ke
   stažení). Historie objednávky v MojeBegina pak ukáže „⚠ PDF obchodních
   podmínek se nepodařilo přiložit“.

## Kontrola v MojeBegina (po nasazení)

Detail objednávky → Historie:
- „založil(a) objednávku (souhlas s obchodními podmínkami ve znění 2026-10-27)“
- „odeslal(a) e-mail: potvrzení zákazníkovi (…) — přílohy: obchodní podmínky ve znění 2026-10-27 (PDF)“

## Datum účinnosti

Platí poslední znění v `TERMS_VERSIONS` od okamžiku nasazení. Datum
účinnosti 2. znění je nastavené na 27. 10. 2026. Pokud se nasadí později,
před sloučením se změní `id` a `effectiveLabel` na den nasazení a v testu se
přepíše otisk 2. znění.

## Nový text podmínek v budoucnu

1. Do `TERMS_VERSIONS` přidat nové znění (`id` = den účinnosti), staré nechat.
2. Spustit testy. Test vypíše chybějící otisk nového znění, ten se doplní do
   `FROZEN`. Otisky starších znění se nemění.
3. Nové znění platí pro objednávky po nasazení. Starší objednávky dál dostávají
   a odkazují na svoje znění.

## Dál (není součástí této změny)

- **Tlačítko „Odstoupit od smlouvy“** (§ 1830a OZ, transpozice směrnice
  (EU) 2023/2673). Podle dostupných zdrojů je povinné od 1. 1. 2027; před
  realizací ověřit ve Sbírce. Formulář zůstává jako další možnost.
- Font v PDF: „Begina PDF Sans“, přejmenovaná podmnožina Liberation Sans
  (SIL OFL 1.1, `lib/eshop/legal/fonts/LICENSE-OFL.txt`).

# Sklad 1.0 — uchovávání originálních fotek dokladů

Stav: **pravidlo připravené, nic se nemaže.** Mazání zatím neexistuje v kódu
ani v žádném skriptu; zavede se až po schválení vedením a účetní.

## Kde fotky jsou

- Vercel Blob, soukromé úložiště, cesta `sklad/<id příjemky>/<náhodné id>.jpg`.
- V databázi na ně odkazuje `goods_receipt_document_pages.storage_key`
  (+ SHA-256 ověřený serverem).
- Fotky jsou zmenšené v prohlížeči (nejvýš 3200 px delší strany, JPEG 85 %),
  originál z telefonu se neukládá.

## Pravidlo (lib/sklad/photoRetention.ts)

| Fotka | Rozhodnutí |
|---|---|
| doklad **potvrzené** příjemky (i později stornované) | držet do **31. 12. roku (rok dokladu + 10)**; bez data dokladu od roku potvrzení |
| doklad **nepotvrzeného návrhu**, 180 dní beze změny | kandidát ke smazání |
| soubor v Blobu bez stránky příjemky (nedokončený upload) | kandidát po 7 dnech |
| cokoli jiného / neúplná data | **držet** (nikdy nemazat při pochybnosti) |

Lhůta 10 let: zákon o DPH § 35 (daňové doklady 10 let od konce zdaňovacího
období); zákon o účetnictví § 31 žádá 5 let — platí delší lhůta.
**Ke schválení účetní** (Begina je plátce DPH — ověřit).

Dnes už platí (beze změny): nahrazení fotky u návrhu bez vytěžených řádků
smaže starý soubor; neúspěšný upload smaže svůj osiřelý soubor.

## Bezpečné mazání — postup, až bude schválené

1. **Report jen ke čtení**: `30_retence_fotek_report.sql` (stránky v DB)
   + seznam Blobu bez stránky (budoucí skript, jen výpis).
2. **Schválení člověkem**: vedení odsouhlasí konkrétní seznam souborů
   (počet, nejstarší / nejnovější datum, součet velikostí).
3. **Mazání po dávkách** budoucím skriptem: pro každý soubor znovu ověří
   rozhodnutí proti aktuální DB (stav se mezitím mohl změnit), smaže z Blobu,
   zapíše záznam do historie příjemky (`goods_receipt_activity`, kind
   `photo_deleted`, kdo / kdy / proč) a stránku označí — řádek stránky se
   nemaže, aby zůstal SHA-256 a doklad o tom, že fotka existovala.
4. **Kontrola po**: report znovu; počet smazaných = schválený seznam.

Nikdy se nemaže fotka potvrzené příjemky před uplynutím lhůty a nikdy
automaticky bez schváleného seznamu.

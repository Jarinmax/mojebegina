# Šarže — návrh systému (Výroba 1.0)

Stav: **návrh k odsouhlasení**, nic z toho zatím není v DB ani v kódu.
Navazuje na `ESHOP_SCHEMA_PROPOSAL.md` (oddíl „BUDOUCNOST“: `production_batches`,
`stock_movements`, `order_items → production_batches`) a na oblasti Výroba
a Sklad v `lib/content/companyOverview.ts`.

---

## 1. Co má systém umět (jednou větou)

> Jdu vařit polévku → zapíšu, ze kterých surovin (a jejich šarží) vařím →
> systém přidělí **číslo šarže** → zapíšu, kolik balení vzniklo → při prodeji
> se balení odepisují ze šarže → **kdykoli** na dotaz kontroly vyjede karta
> šarže: suroviny, vyrobeno, prodáno komu, skladem, odepsáno, vzorky.

Karta šarže odpovídá na otázky kontroly:

| Otázka kontroly | Odkud to systém ví |
|---|---|
| Číslo šarže, co to je, kdy a kdo to vyrobil | záznam výroby (`production_batches`) |
| Ze kterých surovin, od kterého dodavatele, jaká šarže dodavatele | spotřebované šarže surovin (`production_batch_inputs` → `raw_material_lots`) |
| Kolik se vyrobilo | výstup výroby po baleních (`production_batch_outputs`) |
| Kolik se prodalo a komu | přiřazení šarže k položkám objednávek (`order_item_batches`) |
| Kolik zbývá skladem | součet pohybů skladu (`stock_movements`) |
| Odpisy (prošlé, rozbité, degustace) | pohyby typu odpis |
| Musím uchovávat vzorek? Kde je, do kdy? | pravidla vzorků + `retained_samples` |

A opačným směrem (stažení z trhu): *„Dodavatel hlásí vadnou šarži mouky“* →
systém ukáže všechny výrobní šarže, ve kterých byla, a všechny odběratele.

---

## 2. Právní rámec (shrnutí — před spuštěním ověřit s dozorem)

> Toto je technický návrh, ne právní stanovisko. Body označené ⚠ si nechte
> potvrdit u svého dozorového orgánu (SZPI / KHS) nebo poradce pro HACCP.

1. **Sledovatelnost** — nařízení (ES) č. 178/2002, čl. 18: provozovatel musí
   umět doložit **„jeden krok zpět“** (od koho má suroviny) a **„jeden krok
   vpřed“** (komu dodal — podnikatelským odběratelům; konečného spotřebitele
   zákon nevyžaduje, e-shop ho má navíc). Přísnější evidence podle
   prováděcího nařízení (EU) č. 931/2011 platí jen pro potraviny
   živočišného původu — **Begina vaří polévky pro e-shop 100% rostlinné**,
   takže se na ně nevztahuje (rozhodnutí vedení, viz 5.2 a 6b). Systém
   přesto ukládá i to, co 931/2011 chce (popis, množství, dodavatel,
   odběratel, šarže, datum) — nic to nestojí a kontrola to ocení.
2. **Označení šarže na obalu** — směrnice 2011/91/EU a prováděcí vyhláška
   k zákonu č. 110/1997 Sb. o potravinách: šarže se uvádí s předponou **„L“**
   (pokud je jinak nezaměnitelná, předpona není nutná). Pokud je na obalu
   datum použitelnosti/trvanlivosti alespoň ve tvaru den + měsíc, může
   šarži nahradit — **doporučení: šarži tisknout vždy**, datum se může
   u dvou várek ve stejný den shodovat. ⚠ aktuální číslo vyhlášky ověřit.
3. **Jak dlouho držet záznamy** — předpis pevnou lhůtu nestanoví; pokyny
   Komise k čl. 18 doporučují 5 let (u rychle se kazících potravin stačí
   6 měsíců po výrobě). **Návrh: záznamy šarží se nikdy nemažou** (stejný
   princip jako faktury a objednávky v MojeBegina).
4. **Vzorky (archivní vzorky)** — vyhláška č. 137/2004 Sb. (stravovací
   služby), příloha č. 5: vzorky se odebírají tam, kde to **z epidemiologických
   důvodů nařídí orgán ochrany veřejného zdraví (KHS)**; vzorek ≥ 100 g /
   100 ml (u porcovaného balení celá porce), v uzavřené nádobě, chladnička
   do +4 °C, likvidace **po 48 hodinách od výroby nebo od konce doby
   použitelnosti**. Plošná povinnost uchovávat vzorky každé šarže pro výrobce
   balených potravin z předpisů nevyplývá; bývá ale požadavkem **smlouvy**
   (školy, catering, hromadné akce) nebo vlastního **HACCP**. ⚠ Proto systém
   vzorky řídí **pravidly**, která si nastavíte (oddíl 7) — ne natvrdo.

---

## 3. Pojmy

- **Surovina** — co nakupuji (dýně, smetana, sůl, bag-in-box obal…).
  Obal je také surovina: i u obalu se dohledává šarže (materiál ve styku
  s potravinou).
- **Příjemka suroviny (šarže suroviny)** — jedna dodávka jedné suroviny:
  dodavatel, jeho číslo šarže, DMT/DP, množství, datum příjmu, dodací list.
- **Výrobní šarže** — jedno vaření jednoho produktu (jedna várka = jedna
  šarže). Má vlastní číslo, které jde na štítek.
- **Balení** — existující `product_variants` (SKU), např. `kulajda` 3 l
  bag-in-box. Z jedné šarže může vzniknout víc druhů balení (sirup 750 ml
  i 3 l).
- **Pohyb skladu** — každý vznik a úbytek kusů hotového výrobku dané šarže.

---

## 4. Číslo šarže

Formát: **`L` + RRMMDD + `-` + kód produktu + `-` + pořadí v den**

```
L261101-KUL-1    kulajda, uvařená 1. 11. 2026, první várka toho dne
L261101-KUL-2    druhá várka kulajdy téhož dne
L261101-DYN-1    dýňová polévka, stejný den
```

- čitelné bez systému (datum výroby + co to je), krátké na štítek;
- kód produktu = nový sloupec `products.lot_code` (3–4 velká písmena,
  UNIQUE), např. KUL, DYN, RAJ, RAR (rajčatová s červenou řepou), SPE, GUL…;
- pořadí v den přiděluje DB v témže INSERTu (jako dnes `order_number_seq`
  a `payment_vs_seq`), takže dvě souběžná zapsání nedostanou stejné číslo;
- číslo je **neměnné** (trigger, stejný vzor jako `orders_payment_vs_immutable`).

Na štítku:

```
Kulajda · 3 l
Spotřebujte do: 15. 11. 2026
Šarže: L261101-KUL-1
```

Datum spotřeby/trvanlivosti systém spočítá: **datum výroby +
`products.shelf_life_days`** (polévky dnes 14 dní, čaje 60). Lze ručně
zkrátit, nikdy prodloužit nad hodnotu z produktu.

---

## 5. Datový model (nové tabulky)

Princip shodný se zbytkem MojeBegina: nic se nemaže (jen `is_active` /
storno se zdůvodněním), FK `RESTRICT`, množství s CHECKy, atomický zápis
přes `db.batch()`, auditní záznam aktivit.

```
suppliers 1──* raw_material_lots *──1 raw_materials
                     │
                     │ (co se spotřebovalo)
                     *
      production_batch_inputs *──1 production_batches 1──* production_batch_outputs *──1 product_variants
                                         │   │                                          (existující)
                                         │   └──* retained_samples
                                         │
                                         └──* stock_movements ──0..1 order_item_batches *──1 order_items
                                                                                         (existující)
```

### 5.1 `suppliers` — dodavatelé

| Sloupec | Pozn. |
|---|---|
| `id`, `name`, `ico`, `address`, `contact`, `note` | |
| `organization_id` (FK, NULL) | pokud dodavatel už je v `organizations` |
| `is_active`, časy | |

### 5.2 `raw_materials` — číselník surovin

| Sloupec | Pozn. |
|---|---|
| `id`, `name` (UNIQUE), `unit` (`kg` \| `l` \| `ks`) | |
| `allergens text[]` | stejný CHECK na 14 kódů EU jako `products.allergens` |
| `is_animal_origin boolean` | živočišná surovina; do rostlinného produktu ji **nejde použít** (6b) |
| `is_packaging boolean` | obaly, víčka, bag-in-box |
| `is_active`, časy | |

### 5.3 `raw_material_lots` — příjem suroviny

| Sloupec | Pozn. |
|---|---|
| `id`, `raw_material_id` (FK), `supplier_id` (FK) | |
| `supplier_lot_code` | šarže dodavatele z obalu/dodacího listu; NULL jen se zdůvodněním (např. zelenina z trhu → pak `note`) |
| `received_at`, `received_by_user_id` | |
| `quantity`, `unit` | `numeric(12,3)`, `> 0` |
| `best_before` / `use_by` | z obalu suroviny |
| `delivery_note_ref` | číslo dodacího listu / faktury |
| `delivery_note_photo_id` | fotka dodacího listu (znovupoužití úložiště fotek z Práce 2.0) |
| `receipt_temperature_c` | u chlazených surovin (HACCP kontrola při příjmu) |
| `status` | `available` \| `used_up` \| `blocked` (zablokováno = stažení) |

### 5.4 `production_batches` — výrobní šarže

| Sloupec | Pozn. |
|---|---|
| `id`, `lot_code` (UNIQUE, neměnný) | viz oddíl 4 |
| `product_id` (FK → `products`) | |
| `produced_at` (datum), `produced_by_user_id` | kdo vařil |
| `quantity_produced`, `unit` | uvařeno např. 60 l (před plněním) |
| `best_before` | výroba + `shelf_life_days`; CHECK `>= produced_at` |
| `cook_temperature_c`, `cooled_to_c`, `cooled_at` | volitelné záznamy kritických bodů (HACCP) |
| `status` | `in_production` \| `released` (uvolněno k prodeji) \| `blocked` \| `recalled` \| `closed` |
| `sample_decision` + `sample_reason` | výsledek pravidel vzorků v okamžiku výroby (oddíl 7) |
| `note`, časy | |

### 5.5 `production_batch_inputs` — ze kterých surovin

| Sloupec | Pozn. |
|---|---|
| `batch_id` (FK), `raw_material_lot_id` (FK) | konkrétní šarže suroviny |
| `quantity`, `unit` | kolik se jí spotřebovalo; `> 0` |

Spotřeba se odečte ze zůstatku příjemky. Zůstatek suroviny = příjem −
součet spotřeb (dopočítává se, neukládá).

### 5.6 `production_batch_outputs` — kolik balení vzniklo

| Sloupec | Pozn. |
|---|---|
| `batch_id` (FK), `product_variant_id` (FK) | UNIQUE pár |
| `packages_count` | `> 0`, např. 19 × kulajda 3 l |

Zápis výstupu zároveň vytvoří pohyb skladu `production` (+19).

### 5.7 `stock_movements` — sklad hotových výrobků po šaržích

| Sloupec | Pozn. |
|---|---|
| `id`, `batch_id` (FK), `product_variant_id` (FK) | |
| `kind` | `production` (+) \| `sale` (−) \| `sample` (−) \| `write_off` (−, prošlé/rozbité/degustace) \| `return` (+) \| `inventory_adjustment` (±) |
| `quantity` | kladné/záporné podle `kind` (CHECK) |
| `order_item_id` (FK, NULL) | povinné u `sale` / `return`; výjimka = přímý prodej mimo systém (trh, akce), pak povinný `reason` |
| `reason`, `created_by_user_id`, `created_at` | u odpisu a inventury povinný důvod |

**Skladem** = `SUM(quantity)` po (šarže, balení). Pohyb se nikdy nepřepisuje;
oprava = nový protipohyb (stejně jako dobropis u faktur). CHECK/trigger:
zůstatek šarže nesmí klesnout pod nulu.

### 5.8 `order_item_batches` — které šarže šly do které objednávky

Jedna položka (např. 5 × kulajda) může jít ze dvou šarží (3 + 2), proto
samostatná tabulka místo sloupce `order_items.production_batch_id`
z původního návrhu.

| Sloupec | Pozn. |
|---|---|
| `order_item_id` (FK), `batch_id` (FK), `quantity` | součet `quantity` ≤ `order_items.quantity` |

Každý řádek vytvoří pohyb `sale`. Storno objednávky po expedici → pohyb
`return` (nebo `write_off`, pokud se zboží nevrátilo).

### 5.9 `retained_samples` — uložené vzorky

| Sloupec | Pozn. |
|---|---|
| `batch_id` (FK), `taken_at`, `taken_by_user_id` | |
| `amount` + `unit` | např. 1 ks balení nebo 150 ml |
| `storage_location` | „chladnička 2, horní police“ |
| `keep_until` | spočítá pravidlo (oddíl 7) |
| `disposed_at`, `disposed_by_user_id` | likvidace; NULL = stále uložen |
| `handed_to_inspection_at`, `inspection_note` | když si vzorek vezme kontrola |

### 5.10 `sample_rules` — pravidla vzorků (nastavitelná)

| Sloupec | Pozn. |
|---|---|
| `id`, `name`, `level` | `required` (povinné) \| `recommended` (doporučené) |
| `scope` | `all` \| `category` \| `product` \| `customer` \| `location` |
| `category_id` / `product_id` / `organization_id` / `location_id` | podle `scope` |
| `source` | `khs_order` (nařízení KHS) \| `contract` (smlouva) \| `haccp` (vlastní) |
| `source_ref` | č. j. rozhodnutí, číslo smlouvy |
| `valid_from`, `valid_to` | |
| `sample_amount`, `sample_unit` | např. 100 ml |
| `keep_hours_after` + `keep_from` | např. 48 h od `best_before` (`keep_from` = `produced_at` \| `best_before`) |

---

## 6. Pracovní postupy (obrazovky)

Nová sekce **`/vyroba`** (role ADMIN/EXECUTIVE + pracovník výroby; stejný
vzor oprávnění jako `/prace`). Mobil první — zapisuje se v kuchyni.

### A) Příjem suroviny — `/vyroba/prijem`
1. Vyber surovinu a dodavatele (nebo založ nového).
2. Opiš šarži dodavatele a datum trvanlivosti, množství.
3. Vyfoť dodací list (volitelně teplota při příjmu).
→ vznikne `raw_material_lots`.

### B) Vaření — `/vyroba/nova-sarze`
1. **Vyber produkt** (např. Kulajda). Systém ukáže **číslo šarže dopředu**
   a datum spotřeby.
2. **Suroviny:** pro každou surovinu systém nabídne šarže skladem seřazené
   podle nejbližší trvanlivosti (FEFO); vybereš a zadáš množství.
   Prošlé nebo zablokované šarže surovin nejdou vybrat.
   (Později z receptury předvyplní suroviny a množství podle objemu várky.)
3. **Uvařeno:** objem várky (l), volitelně teplota varu / zchlazení.
4. **Naplněno:** kolik balení kterého SKU (19 × 3 l).
5. **Vzorek:** systém vyhodnotí pravidla (oddíl 7) a ukáže např.
   *„Vzorek POVINNÝ (smlouva ZŠ Begina č. 12/2026): 100 ml, uchovat do
   17. 11. 2026, chladnička do +4 °C.“* → tlačítko „Vzorek odebrán“ +
   umístění. Pokud je povinný, šarži nejde **uvolnit k prodeji** bez
   záznamu o vzorku.
6. **Uvolnit k prodeji** → šarže `released`, kusy jsou skladem, tisk štítků.

Celé vaření se uloží jedním `db.batch()` (šarže + spotřeby + výstupy +
pohyby skladu + aktivita) — buď všechno, nebo nic.

### C) Expedice — napojení na objednávky
Při přepnutí objednávky do stavu **„připraveno“** (`fulfillment_status =
ready`) se každé položce s `product_variant_id` přiřadí šarže:
- automaticky **FEFO** (nejstarší uvolněná šarže s kusy skladem),
- ručně přepsatelné (vzal jsem jinou bednu),
- nejde přiřadit prošlou, zablokovanou nebo staženou šarži.

Číslo šarže se pak zobrazí v detailu objednávky a může jít na dodací list.
Ruční objednávky bez `product_variant_id` (staré) se přiřazují ručně
výběrem produktu.

### D) Odpisy a inventura — `/vyroba/sklad`
Přehled skladem po šaržích (barevně: blíží se/prošlá trvanlivost),
tlačítka „odepsat“ (důvod povinný) a „inventura“ (rozdíl s důvodem).
Prošlé šarže s kusy skladem systém připomene v upozorněních.

### E) Vzorky — `/vyroba/vzorky`
Seznam uložených vzorků, které mají být zlikvidovány dnes / jsou po lhůtě
→ „Zlikvidováno“. Upozornění v Práci (úkol „zlikvidovat vzorek L261101-KUL-1“).

---

## 6a. Automatizace: fotka nákupu → příjemka → předvyplněné vaření

Cíl: **nic nepřepisovat ručně**. Ručně se jen potvrzuje a opravuje to,
co systém nevyčte nebo neodhadne.

### Krok 1 — vyfotím nákup (`/vyroba/nakup`)
1. Po návratu z obchodu nahraju **všechny fotky najednou**: účtenka,
   dodací list, faktura, případně etiketa z obalu.
2. Server fotky přečte AI (Claude, čtení obrázků) a vrátí strukturovaný
   návrh:
   - obchod / dodavatel (IČO z účtenky → `suppliers`), datum, číslo dokladu;
   - řádky: text z účtenky („KOKOS.MLEKO 400ML“), množství, jednotka,
     cena;
   - **spárování se surovinou** z číselníku („Kokosové mléko“). Každé ruční
     spárování se uloží jako alias (`raw_material_aliases`), takže příště
     se totéž spáruje samo;
   - řádky, které nejsou suroviny (taška, čistidlo), se samy odškrtnou.
3. Na obrazovce je hotová tabulka → zkontroluji, opravím → **„Uložit
   nákup“** → vzniknou příjemky surovin (`raw_material_lots`) s fotkou
   dokladu.

AI nikdy nezapisuje sama — vždy jde o **návrh, který člověk potvrdí**
(stejný princip jako `prepare_order → create_order` v MCP).

### Šarže suroviny, když ji účtenka nemá
Účtenka z obchodu šarži dodavatele obvykle neobsahuje. Pak:
- **výchozí identifikace = obchod + datum nákupu + číslo účtenky.** Pro
  „jeden krok zpět“ to stačí: víme, odkud a kdy surovina přišla, a obchod
  podle data dohledá svou šarži;
- u **složených a rizikových surovin** (kokosové mléko, koření ve směsi,
  pasty, konzervy) systém požádá o **fotku etikety** → AI
  z ní vyčte šarži, datum spotřeby, **alergeny a věty „může obsahovat
  stopy…“** a hlavně ověří, že surovina je **rostlinná**. Jedna fotka,
  nic se neopisuje. Lze vypnout po surovinách (sůl, dýně z trhu ji
  nepotřebují).

### Krok 2 — vařím (`/vyroba/nova-sarze`)
Suroviny se **nepíšou, jen potvrzují**:
1. Vyberu produkt (Kulajda).
2. Systém předvyplní seznam surovin a množství:
   - z **minulé várky téhož produktu** (hned od 1.0),
   - později z **receptury** přepočtené na objem várky (Výroba 2.0).
3. Ke každé surovině sám vybere šarži:
   - **jen jedna šarže skladem** → vybrána, nic se neřeší;
   - **víc šarží** → předvybere tu s nejbližší trvanlivostí (FEFO), nebo
     tu z **dnešního nákupu**, pokud jsem při ukládání nákupu zaškrtl
     „nakoupeno na dnešní vaření: Kulajda“;
   - surovina **není skladem** → upozornění „smetanu nemáte v evidenci —
     přidat nákup?“ (nejčastější díra v evidenci).
4. Zkontroluji, případně opravím množství → **„Potvrzuji, vařím z těchto
   surovin“**.

Proč aspoň jedno potvrzení zůstává: systém neví, jestli smetanu z dnešního
nákupu použiju do kulajdy, nebo do jiné polévky, ani jestli v lednici nemám
zbytek z minulého týdne. Potvrzení je podpis pod záznamem, který se ukazuje
kontrole. Je to ale jedno kliknutí, ne psaní.

### Varianta přes asistenta (ChatGPT / Claude)
Fotky pošlu do chatu: *„Zapiš nákup a založ várku kulajdy 60 l.“*
Asistent přes MCP vrátí stejný návrh (nákup + várka se šaržemi) a zapíše
ho až po mém potvrzení — nástroje `prepare_purchase` / `create_purchase`
a `prepare_batch` / `create_batch` podle vzoru objednávek a faktur.

### Technické poznámky
- Dnes se v MojeBegina fotí jen u úkolů (Práce 2.0); úložiště (Cloudflare
  R2, EU) a zmenšování fotek v telefonu se znovu použije.
- ⚠ Fotky úkolů se po **400 dnech mažou** (pravidlo v R2). Doklady k šaržím
  musí vydržet **5 let** → vlastní prefix `vyroba/` bez mazání.
- Čtení obrázků AI v backendu dnes není — nová integrace (Claude API)
  s výstupem ve pevném schématu; klíč jen ve Vercelu. Obrázek se pošle
  ke čtení, výsledek a fotka zůstávají v MojeBegina.
- Nová tabulka `raw_material_aliases` (`raw_material_id`, `supplier_id`
  NULL, `receipt_text` UNIQUE v rámci dodavatele).
- Nová tabulka `purchase_documents` (fotky, dodavatel, datum, číslo
  dokladu, stav `draft` | `confirmed`), na kterou ukazují příjemky.

---

## 6b. Pojistka „100% rostlinné“

Rozhodnutí vedení: **polévky pro e-shop jsou čistě rostlinné**, živočišné
suroviny se do nich nepoužívají. Systém to hlídá, ne jen papír:

- nový příznak **`products.is_plant_based`** (polévky = `true`);
- surovina s `is_animal_origin = true` **nejde vybrat** do várky rostlinného
  produktu — tvrdý zákaz v aplikaci i v DB (trigger na
  `production_batch_inputs`), ne jen varování;
- nová surovina se při prvním nákupu musí označit rostlinná / živočišná;
  u složených surovin pomůže fotka etikety (AI upozorní na mléko, vejce,
  syrovátku, máslo, med, želatinu…);
- **alergeny se počítají ze surovin:** sjednocení alergenů všech použitých
  šarží surovin se při vaření porovná s `products.allergens`. Chybí-li
  alergen na produktu (např. siřičitany z konzervantu E223 v kokosovém mléce), šarži **nejde uvolnit
  k prodeji**, dokud se to nevyřeší (opravit produkt / štítek, nebo změnit
  surovinu). Věty „může obsahovat stopy mléka“ ze surovin se zobrazí
  jako upozornění pro štítek;
- karta šarže pro kontrolu má řádek **„Rostlinný výrobek: ano — žádná
  surovina živočišného původu“**, doložený seznamem surovin.

Pokud by Begina někdy vařila nerostlinně (catering, zakázka), bude to
samostatný produkt s `is_plant_based = false` — e-shopové polévky se tím
nezmění.

---

## 7. Musím uchovat vzorek? — rozhodovací logika

Funkce `evaluateSampleRequirement(batch, context)` → `{ level, reasons[],
amount, keepUntil }`. Vyhodnocuje se **při vaření** (výsledek se uloží do
šarže) a **znovu při přiřazení šarže k objednávce** — pokud odběratel má
smluvní povinnost a šarže vzorek nemá, systém varuje dřív, než se zboží
odveze.

Pořadí:

1. **Povinné — nařízení KHS** (`source = khs_order`, platné k datu výroby,
   pro provozovnu/produkt) → `required`.
2. **Povinné — smlouva / akce** (`source = contract`): šarže je určena
   odběrateli, který vzorky vyžaduje (školní jídelna, catering hromadné
   akce) → `required`.
3. **Doporučené — vlastní HACCP** (`source = haccp`) → `recommended`
   (lze vynechat jedním kliknutím s důvodem).
4. Jinak → `not_needed` (ukáže se proč: „žádné pravidlo se nevztahuje“).

Když platí víc pravidel, bere se nejpřísnější: nejvyšší úroveň, největší
množství, nejdelší `keepUntil`.

**Navržená výchozí pravidla (HACCP, k odsouhlasení):**

| Kategorie | Úroveň | Vzorek | Uchovat do |
|---|---|---|---|
| Polévky (DP 14 dní, chlazené, rychle se kazí) | doporučené | 1 balení nebo ≥ 100 ml | datum spotřeby + 48 h |
| Čaje, koktejly (chlazené) | doporučené | ≥ 100 ml | datum spotřeby + 48 h |
| Sirupy (dlouhá trvanlivost, pokojová teplota) | ne | — | — |
| Šarže pro odběratele se smlouvou o vzorcích | **povinné** | dle smlouvy | dle smlouvy |
| Provozovna s nařízením KHS | **povinné** | dle rozhodnutí (výchozí 100 g/ml) | dle rozhodnutí (výchozí 48 h) |

Lhůta „+ 48 h po datu spotřeby“ je analogie s přílohou č. 5 vyhlášky
137/2004 Sb. — vzorek pak pokryje celou dobu, kdy může zákazník výrobek
reklamovat nebo kdy může vzniknout podezření na onemocnění.

---

## 8. Karta šarže = odpověď kontrole

Stránka **`/vyroba/sarze/[lot]`** (hledání podle čísla šarže z obalu)
+ tlačítko **„Export PDF pro kontrolu“**:

```
ŠARŽE L261101-KUL-1 — Kulajda
Vyrobeno 1. 11. 2026, vařil: Jarda · Spotřebujte do 15. 11. 2026 · Stav: uvolněno
Uvařeno 60 l · Var 96 °C · Zchlazeno na 4 °C v 13:40

SUROVINY                     DODAVATEL           ŠARŽE DOD.   DMT/DP       MNOŽSTVÍ
Brambory                     Farma Novák         —(trh)       —            12 kg
Kokosové mléko               Velkoobchod XY      L2610-447    20. 05. 2027  8 l
Hlíva ústřičná               Farma Z             nákup 31.10. 14. 11. 2026  4 kg
Bag-in-box 3 l               Obaly s.r.o.        BX-88812     —            19 ks
...

VYROBENO                     19 × Kulajda 3 l
PRODÁNO                      14 ks
  Bistro U Jezera (IČO …)    6 ks   obj. 5123, 3. 11. 2026, faktura 72600041
  ZŠ Begina                  5 ks   obj. 5130, 4. 11. 2026
  E-shop – soukromé osoby    3 ks   obj. 5127, 5131, 5140
ODEPSÁNO                     1 ks   (vzorek)
SKLADEM                      4 ks

VZOREK                       POVINNÝ (smlouva ZŠ Begina č. 12/2026)
  1 ks, chladnička 2, odebrán 1. 11. 2026 Jarda, uchovat do 17. 11. 2026 — uložen
```

Druhá stránka **`/vyroba/surovina/[lot]`** — opačný směr: šarže suroviny →
ve kterých výrobních šaržích byla → komu se prodaly. Tlačítko
**„Zablokovat“** zablokuje surovinu i všechny dotčené výrobní šarže (nejdou
expedovat) a vypíše kontakty odběratelů pro stažení.

Totéž jen ke čtení pro asistenty přes MCP (Lucy/ChatGPT, Claude) — nástroj
`get_batch_report(lot_code)` se stejným auditním logem jako dnešní čtení
iDokladu.

---

## 9. Co už v systému je a co je potřeba doplnit

**Využijeme:**
- `products.shelf_life_days` → datum spotřeby (polévky 14 dní, čaje 60);
- `product_variants` (SKU) → balení výstupu šarže;
- `order_items.product_variant_id` → přiřazení šarže k prodeji;
- `fulfillment_status` (`preparing` / `ready`) → okamžik přiřazení šarže;
- úložiště fotek z Práce 2.0 → fotky dodacích listů;
- vzor DB sekvencí a neměnných sloupců (`order_number_seq`, `payment_vs_seq`);
- MCP vrstva → čtení karty šarže asistenty.

**Zjištění z DB (kontrola jen čtením, 1. 11. 2026):**
- ⚠ **Sirupy a koktejly nemají `shelf_life_days`** → systém by jim
  nespočítal datum trvanlivosti; před spuštěním doplnit.
- **Všechny polévky mají `allergens = {}` (bez alergenů)** — odpovídá
  receptuře (potvrzeno vedením 1. 11. 2026): polévky jsou 100% rostlinné,
  jako rostlinná smetana se používá **jen kokosové mléko** (kokos není
  mezi 14 alergeny EU), **nikdy bujón** ani ovesná/sójová smetana.
  Zbývá hlídat jen etikety kupovaných surovin: konzervant **E220–E228
  (siřičitany)** v některých kokosových mlécích, kořenící směsi (celer,
  hořčice) a věty „může obsahovat stopy…“. To udělá kontrola alergenů
  ze surovin (6b) automaticky.
- `products.lot_code` neexistuje → doplnit kódy produktů.

---

## 10. Fáze

| Fáze | Obsah | Hodnota |
|---|---|---|
| **Šarže 1.0 (MVP)** | dodavatelé, suroviny; **příjem z fotky nákupu s AI čtením a potvrzením**; vaření předvyplněné z minulé várky + automatický výběr šarží surovin; pojistka „100% rostlinné“ a kontrola alergenů ze surovin; výrobní šarže s číslem, surovinami a výstupem; ruční přiřazení šarže k objednávce; karta šarže + PDF; vzorky s pravidly; sklad = výroba − prodej − odpisy | **splní kontrolu** |
| Šarže 1.1 | automatické FEFO při „připraveno“; upozornění na prošlé šarže a vzorky k likvidaci; zpětné dohledání suroviny a blokace; MCP `get_batch_report` | rychlost, stažení z trhu |
| Šarže 1.2 | tisk štítků (číslo šarže, datum spotřeby, složení a alergeny z produktu) | méně ruční práce |
| Výroba 2.0 | receptury (předvyplnění surovin podle objemu), náklady várky, kontrola alergenů surovina ↔ produkt, plán výroby z objednávek | navazuje na „Produkty“ a „Plán výroby“ |

Migrace podle zvyku repozitáře: `drizzle/0028_vyroba_1_0_sarze.sql`
+ ručně spouštěné skripty `docs/vyroba/` (before / up / after / rollback),
žádný dopad na běžící e-shop (jen nové tabulky a jeden nový sloupec
`products.lot_code`).

---

## 11. Otázky k rozhodnutí

1. **Jedna várka = jedna šarže?** (návrh: ano; když se jeden den vaří dvakrát,
   vzniknou dvě šarže.)
2. **Formát čísla** `L261101-KUL-1` — vyhovuje, nebo chcete jiný (např. jen
   pořadové číslo)?
3. **Vzorky:** máte dnes nějaké rozhodnutí KHS nebo smlouvu (škola, catering),
   která vzorky vyžaduje? Zadáme je jako první povinná pravidla. Souhlasíte
   s výchozím „doporučeným“ pravidlem pro polévky a chlazené nápoje?
4. **Kdo zapisuje výrobu** — jen Jarda / vedoucí, nebo i další pracovníci
   (potřeba nové role, např. `PRODUCTION`)?
5. **Suroviny bez šarže** (účtenka z obchodu, zelenina od farmáře): stačí dodavatel +
   datum nákupu + dodací list/účtenka? (návrh: ano, šarže = datum příjmu.)
6. **Prodej mimo systém** (trhy, akce, přímý prodej): zapisovat jako pohyb
   `sale` bez objednávky s poznámkou „trh Jiřák 2. 11.“? (návrh: ano, jinak
   nesedí sklad.)
7. **Kde nakupujete** (Makro, Lidl, Billa, farmáři, velkoobchod s fakturou)?
   Podle toho se vyladí čtení účtenek a dodacích listů.
8. **Fotka etikety** u složených surovin (kokosové mléko, směsi koření) — chcete ji vyžadovat, nebo jen nabízet?
9. **Rostlinné jsou jen polévky, nebo i nápoje?** (Sirupy/čaje s medem?)
   Podle toho se nastaví příznak `is_plant_based` u dalších produktů.

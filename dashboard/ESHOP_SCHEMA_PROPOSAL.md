# Návrh DB schématu — Produkty 1.0 a objednávky z e-shopu

Stav: **NÁVRH ke schválení** (26. 9. 2026). Nic z tohoto dokumentu není
provedené — žádná migrace, žádná změna `lib/db/schema.ts`, žádná změna
produkce. Navazuje na `ESHOP_AUDIT.md`.

Předpoklad architektury (k prověření, viz audit oddíl 6): **jedno monorepo,
jedna Neon DB, jedno společné schéma, společná obchodní logika, dvě
Next.js aplikace** — begina.cz (veřejný web + e-shop) a moje.begina.cz
(interní systém).

## 0. Co už existuje a jak to zapadá

Ověřeno v `lib/db/schema.ts`, `lib/data/*` a v DB (read-only, 26. 9. 2026).

| Požadavek | Dnes | Závěr |
|---|---|---|
| Produkty, kategorie, balení | **Neexistuje v DB** — jen `lib/eshop/catalog.ts` (7 produktů, 11 SKU) | nové tabulky; `catalog.ts` = seed |
| `order_items` vazba na produkt | jen `name` (snapshot), `quantity`, `unit_price_kc`, `line_total_kc` | `name` a `unit_price_kc` **už jsou snapshoty** — doplnit vazbu + `sku_snapshot` |
| Guest checkout | `orders.contact_name/phone/email`, `recipient_name/address/phone` už existují | stačí povolit objednávku bez organizace |
| Přihlášený zákazník | `orders.placed_by_user_id` existuje (dnes vždy NULL, „vyhrazeno“) | použít beze změny |
| Doprava odděleně od zboží | `orders.subtotal_kc`, `shipping_kc`, `total_kc` existují | chybí způsob dopravy a sleva; opravit výpočet partnerského obratu |
| Import z WooCommerce | `orders.external_woocommerce_id` existuje | beze změny |
| Poznámka zákazníka | `orders.note` **je interní** (edituje se v Řízení firmy, `NoteForm`) | nový sloupec `customer_note` |
| Systémový autor aktivity | `order_activity.author_user_id` NOT NULL, UI zobrazuje `author_name` | povolit NULL + typ aktéra |
| Atomický zápis objednávky | `createOrder` už používá `db.batch()` (neon-http = jedna transakce) | e-shop použije stejný vzor |

Data v DB dnes: 2 objednávky (The Cup, zadané importem — `entered_by_user_id`
NULL, uhrazené, doručené), 5 položek, 2 faktury, 0 záznamů `order_activity`.
Všechny splňují `line_total = quantity × unit_price`, `subtotal = Σ položek`
a `total = subtotal + shipping` → navržené CHECK omezení projdou bez úprav dat.

Konvence převzaté ze stávajícího schématu: UUID PK (`defaultRandom`),
peníze jako celé Kč v `integer` sloupcích `*_kc` (Begina není plátce DPH,
ceny jsou konečné), `timestamptz`, soft-delete místo mazání, `text` +
komentář místo PG enumů.

## 1. Diagram vztahů

```
product_categories 1───* products 1───* product_variants (sku)
                             │                 │
                             *                 │ 0..1
                       product_images ─────────┘ (volitelně na balení)

product_variants 1───* order_items *───1 orders *───0..1 organizations (B2B)
      (vazba RESTRICT,       │              │  *───0..1 neon_auth.user (placed_by_user_id)
       + snapshot údajů)     │              1
                             │              *
                             │        order_activity (user | system | customer)
                             │
          ── BUDOUCNOST (neimplementovat teď; ukazují NA produkty) ──
products 1───* recipes 1───* recipe_ingredients *───1 raw_materials
product_variants 1───* production_batches 1───* stock_movements
order_items *───0..1 production_batches   (dohledatelnost šarže)
organizations *───0..1 price_lists 1───* price_list_items *───1 product_variants
```

Klíčový princip: **budoucí tabulky (receptury, výroba, sklad, ceníky)
ukazují na `products`/`product_variants`**, ne naopak. Produkty 1.0 proto
nemusí nic z toho předjímat a nic neblokuje.

## 2. Nové a změněné tabulky a sloupce

Legenda: **MVP** = potřeba pro Produkty 1.0 + zápis objednávek z e-shopu;
**Později** = navrženo, ale odložit.

### 2.1 `product_categories` (nová)

| Sloupec | Typ | Omezení | Proč | Fáze |
|---|---|---|---|---|
| `id` | uuid | PK | konvence | MVP |
| `slug` | text | NOT NULL UNIQUE, CHECK `^[a-z0-9-]+$` | URL `/kategorie/[slug]`, stabilní klíč pro seed | MVP |
| `name` | text | NOT NULL | „Čerstvé polévky“ | MVP |
| `intro` | text[] | NOT NULL DEFAULT `{}` | úvodní odstavce stránky kategorie (dnes u koktejlů) | MVP |
| `detail_sections` | jsonb | NULL | společné sekce na detailu produktu („Vhodné pro gastro…“); tvar `[{title, paragraphs[], bullets[]}]` validuje sdílená logika | MVP |
| `image_url` | text | NULL | dlaždice na úvodu; **absolutní URL** ve sdíleném úložišti (viz rizika) | MVP |
| `sort_order` | integer | NOT NULL DEFAULT 0 | pořadí dlaždic na e-shopu | MVP |
| `is_active` | boolean | NOT NULL DEFAULT true | skrýt kategorii bez mazání | MVP |
| `created_at`, `updated_at` | timestamptz | NOT NULL DEFAULT now() | audit | MVP |

18+ **není** vlastnost kategorie, ale produktu (jeden zdroj pravdy);
kategorie upozornění zobrazí, pokud obsahuje produkt s `is_age_restricted`.

### 2.2 `products` (nová) — „co vyrábíme“, jedna receptura

| Sloupec | Typ | Omezení | Proč | Fáze |
|---|---|---|---|---|
| `id` | uuid | PK | | MVP |
| `category_id` | uuid | NOT NULL FK → product_categories ON DELETE RESTRICT | zařazení | MVP |
| `slug` | text | NOT NULL UNIQUE, CHECK formát | URL `/produkt/[slug]` | MVP |
| `name` | text | NOT NULL | „Svařák Deluxe“ | MVP |
| `short_description` | text | NULL | karta v katalogu | MVP |
| `description` | text[] | NOT NULL DEFAULT `{}` | odstavce popisu | MVP |
| `highlights` | text[] | NOT NULL DEFAULT `{}` | „✓ bez umělých aromat…“ | MVP |
| `taste_description` | text | NULL | „Jak chutná …“ | MVP |
| `ingredients` | text | NULL | složení (povinné — 1169/2011) | MVP |
| `allergens` | text[] | NULL; CHECK `allergens <@ ARRAY[14 kódů EU]` | **NULL = zatím neznámé** (e-shop ukáže „Doplníme“, produkt nejde do ostrého prodeje), `{}` = bez alergenů. Kódy: `gluten, crustaceans, eggs, fish, peanuts, soy, milk, nuts, celery, mustard, sesame, sulphites, lupin, molluscs` — kontrolovaný seznam místo volného textu | MVP |
| `allergen_note` | text | NULL | „Může obsahovat stopy…“ | MVP |
| `nutrition` | jsonb | NULL | výživové hodnoty na 100 g/ml: `{energy_kj, energy_kcal, fat, saturates, carbohydrate, sugars, protein, salt}` (7 povinných údajů EU); jsonb, protože se nikdy nefiltruje, tvar hlídá sdílená validace | MVP |
| `nutrition_basis` | text | NULL, CHECK IN (`100g`,`100ml`) | polévky vs. nápoje | MVP |
| `storage_instructions` | text | NULL | „Skladujte do 4 °C…“ | MVP |
| `shelf_life_days` | integer | NULL, CHECK > 0 | minimální trvanlivost od výroby — pro budoucí výrobu/šarže (`best_before`) | MVP |
| `shelf_life_note` | text | NULL | text pro zákazníka („Po otevření spotřebujte co nejdříve“) | MVP |
| `alcohol_percent` | numeric(4,1) | NULL, CHECK 0–100 | „7,5 % obj.“ | MVP |
| `is_age_restricted` | boolean | NOT NULL DEFAULT false; CHECK `alcohol_percent IS NULL OR alcohol_percent <= 0.5 OR is_age_restricted` | 18+; DB nedovolí alkoholický produkt bez 18+ (> 0,5 % obj. = alkoholický nápoj) | MVP |
| `warnings` | text[] | NOT NULL DEFAULT `{}` | „Není určeno pro děti, těhotné…“, E110/E124 upozornění | MVP |
| `sort_order` | integer | NOT NULL DEFAULT 0 | pořadí v kategorii | MVP |
| `is_active` | boolean | NOT NULL DEFAULT true | stažení z prodeje bez mazání (objednávky na produkt odkazují) | MVP |
| `created_at`, `updated_at` | timestamptz | | | MVP |

Údaje o potravině jsou na **produktu**, ne na balení: složení, alergeny
a výživové hodnoty se u 3 l a 500 ml neliší. Úplnost pro ostrý prodej
(`isFoodInfoComplete`) zůstává pravidlem ve sdílené logice, ne DB
omezením — jinak by nešlo produkt rozpracovat.

### 2.3 `product_variants` (nová) — „co prodáváme“, jedno SKU

| Sloupec | Typ | Omezení | Proč | Fáze |
|---|---|---|---|---|
| `id` | uuid | PK | cíl FK z `order_items` | MVP |
| `product_id` | uuid | NOT NULL FK → products ON DELETE RESTRICT | | MVP |
| `sku` | text | NOT NULL UNIQUE, CHECK `^[a-z0-9-]+$` | stabilní obchodní klíč (košík, feedy, sklad); dnešní hodnoty z `catalog.ts` beze změny | MVP |
| `label` | text | NULL | „3 l Rodinná zásoba (bag-in-box)“; NULL = balení zatím neznámé | MVP |
| `short_note` | text | NULL | „Až 15 nápojů po 200 ml“ | MVP |
| `package_description` | text | NULL | delší popis balení na detailu | MVP |
| `package_type` | text | NULL | `bag_in_box`, `pouch`, … — logistika | Později |
| `volume_ml` | integer | NULL, CHECK > 0 | **doprava se na begina.cz počítá podle objemu objednávky**; výroba | MVP |
| `servings` | integer | NULL, CHECK > 0 | „15 nápojů“ → cena za nápoj | MVP |
| `price_b2c_kc` | integer | NOT NULL, CHECK >= 0 | konečná maloobchodní cena (neplátce DPH) | MVP |
| `is_active` | boolean | NOT NULL DEFAULT true | balení mimo prodej | MVP |
| `sort_order` | integer | NOT NULL DEFAULT 0 | pořadí ve výběru balení | MVP |
| `weight_g`, `ean` | integer, text | NULL | dopravci, čtečky | Později |
| `created_at`, `updated_at` | timestamptz | | | MVP |

### 2.4 `product_images` (nová)

| Sloupec | Typ | Omezení | Proč | Fáze |
|---|---|---|---|---|
| `id` | uuid | PK | | MVP |
| `product_id` | uuid | NOT NULL FK → products ON DELETE CASCADE | obrázky patří produktu | MVP |
| `variant_id` | uuid | NULL FK → product_variants ON DELETE SET NULL | volitelně fotka konkrétního balení | MVP |
| `url` | text | NOT NULL | **absolutní URL** (sdílené úložiště) — obě aplikace musí obrázek zobrazit | MVP |
| `alt` | text | NULL | přístupnost, SEO | MVP |
| `sort_order` | integer | NOT NULL DEFAULT 0 | 0 = hlavní fotka | MVP |
| `width`, `height` | integer | NULL | rozvržení bez poskakování | Později |
| `created_at` | timestamptz | | | MVP |

### 2.5 B2B ceny (navrženo, **Později**)

Dnešní realita: partnerský program = % sleva z B2C ceny podle obratu
předchozího měsíce, úroveň 5 = „individuální dohoda“. Proto:

- **Partnerská sleva zůstává pravidlem** ve sdílené obchodní logice
  (dnes `mock/partnerProgram.ts`) — neukládá se k variantě.
- **Individuální dohoda** = vlastní ceník:
  `price_lists (id, code UNIQUE, name, is_active)`,
  `price_list_items (price_list_id, variant_id, price_kc, PK(price_list_id, variant_id))`,
  `organizations.price_list_id` NULL FK.
- Pořadí vyhodnocení (ve sdílené logice): ceník organizace → jinak B2C
  cena − partnerská sleva. Sleva se ukládá do `orders.discount_kc`.

Jednodušší alternativa `product_variants.price_b2b_kc` se nedoporučuje:
jedna B2B cena nepokryje individuální dohody a později by se musela
migrovat.

### 2.6 `orders` (změny)

| Sloupec | Změna | Proč | Fáze |
|---|---|---|---|
| `buyer_organization_id` | **DROP NOT NULL** | B2C guest checkout bez IČO | MVP (poslední krok) |
| `channel` | nový text NOT NULL DEFAULT `'manual'`, CHECK IN (`manual`,`eshop`,`import`) | odkud objednávka přišla; default `manual` = dnešní `CreateOrderForm` funguje beze změny; 2 existující řádky → `import` | MVP |
| — | CHECK `channel <> 'manual' OR buyer_organization_id IS NOT NULL` | ruční objednávka musí mít organizaci jako dnes | MVP |
| — | CHECK `buyer_organization_id IS NOT NULL OR contact_email IS NOT NULL` | guest objednávka musí mít kontakt | MVP |
| `order_number` | nový text, UNIQUE; nejdřív NULL, po backfillu NOT NULL; plní se ze sekvence `order_number_seq` v témže INSERTu | zákaznické číslo; **formát a start — viz oddíl 7, rozhodne se zvlášť** | MVP |
| `placed_by_user_id` | beze změny (už existuje) | přihlášený zákazník; guest = NULL | — |
| `customer_note` | nový text NULL | poznámka zákazníka z pokladny; `note` zůstává interní | MVP |
| `shipping_method_code` | nový text NULL | `osobni-odber`, `rozvoz` — reporting, logistika | MVP |
| `shipping_method_label` | nový text NULL | snapshot názvu („Osobní vyzvednutí — Zahradní Bistro Begina“) | MVP |
| `payment_method_code`, `payment_method_label` | nové text NULL | `prevod` + snapshot názvu | MVP |
| `discount_kc` | nový integer NOT NULL DEFAULT 0, CHECK >= 0 | partnerská/individuální sleva na zboží | MVP (dnes vždy 0) |
| — | CHECK `total_kc = subtotal_kc - discount_kc + shipping_kc` | invariant; existující data ho splňují | MVP |
| `age_confirmed_at` | nový timestamptz NULL | doklad, že zákazník potvrdil 18+ | MVP |
| `terms_accepted_at` | nový timestamptz NULL | doklad souhlasu s obchodními podmínkami | MVP |
| `terms_version` | nový text NULL | která verze podmínek platila | Později |
| strukturovaná adresa (`recipient_zip` …), fakturační údaje firmy u guest objednávky | nové | zóny dopravy, faktura na firmu bez účtu | Později |

**Partnerský obrat** = Σ (`subtotal_kc − discount_kc`) uhrazených objednávek
organizace za měsíc. Doprava je v samostatném `shipping_kc`, takže se
nezapočítá. Vyžaduje opravu kódu `getCurrentMonthlyPurchase`
(`lib/data/dashboard.ts`), který dnes sčítá `total_kc` — **změna kódu,
ne schématu**. B2C objednávky bez organizace se do programu nepočítají.

### 2.7 `order_items` (změny)

| Sloupec | Změna | Proč | Fáze |
|---|---|---|---|
| `product_variant_id` | nový uuid NULL FK → product_variants **ON DELETE RESTRICT** | živá vazba pro statistiky, výrobu, sklad; RESTRICT = prodané balení nejde smazat (jen deaktivovat) | MVP |
| `sku_snapshot` | nový text NULL | SKU v okamžiku objednávky — přežije přejmenování SKU | MVP |
| `name` | **beze změny = name snapshot** | už dnes je to snapshot („ne odkaz na živý katalog“) — přejmenování na `name_snapshot` by rozbilo existující kód bez přínosu | — |
| `unit_price_kc` | **beze změny = unit price snapshot** | cena v okamžiku objednávky | — |
| `quantity`, `line_total_kc` | beze změny | | — |
| — | CHECK `line_total_kc = quantity * unit_price_kc`, CHECK `quantity > 0` | invariant; 5/5 existujících řádků ho splňuje | MVP |
| — | CHECK `product_variant_id IS NULL OR sku_snapshot IS NOT NULL` | vazba bez snapshotu nedává smysl | MVP |
| `production_batch_id` | nový uuid NULL FK | dohledatelnost šarže (EU 178/2002) | Později (s výrobou) |

NULL `product_variant_id` = ruční položka z `CreateOrderForm`, historický
import nebo WooCommerce bez mapování. Historická objednávka zůstává správná
po změně názvu, SKU i ceny, protože se zobrazuje vždy ze snapshotů.

### 2.8 `order_activity` (změny)

| Sloupec | Změna | Proč | Fáze |
|---|---|---|---|
| `author_user_id` | **DROP NOT NULL** | e-shop, import nebo zákazník nejsou interní uživatelé | MVP |
| `actor_type` | nový text NOT NULL DEFAULT `'user'`, CHECK IN (`user`,`system`,`customer`) | kdo událost vyvolal | MVP |
| — | CHECK `actor_type <> 'user' OR author_user_id IS NOT NULL` | interní záznam musí mít autora jako dnes | MVP |
| `author_name` | beze změny | pro e-shop snapshot „E-shop“; timeline ho už zobrazuje | — |

### 2.9 `invoices` (**Později**)

`organization_id` je NOT NULL. Pro B2C buď DROP NOT NULL, nebo B2C doklady
vést jen v eDokladu/Fakturoidu a v `invoices` jen B2B. Rozhodnout
s účetní — mimo MVP.

## 3. Proč tam jednotlivé údaje jsou

Zdůvodnění je u každého sloupce v tabulkách výše. Průřezové principy:

- **Snapshot vs. vazba:** objednávka ukládá obojí — vazbu pro statistiky
  a snapshot pro historickou pravdu. Zobrazení historické objednávky
  nikdy nečte živý katalog.
- **NULL = „nevíme“:** u potravinových údajů se rozlišuje „nevíme“ (NULL)
  od „nic“ (`{}`), aby e-shop nikdy nepředstíral „bez alergenů“.
- **Pravidla v kódu, fakta v DB:** úplnost údajů, partnerské úrovně
  a výpočet dopravy jsou pravidla ve sdíleném balíčku; DB drží fakta
  a tvrdé invarianty (součty, 18+ u alkoholu).
- **Nic se nemaže:** produkty/balení/kategorie mají `is_active`;
  FK z objednávek jsou RESTRICT.

## 4. MVP vs. odložit

**MVP (Produkty 1.0 + objednávky z e-shopu):**
- `product_categories`, `products`, `product_variants`, `product_images`
  (sloupce označené MVP) + seed z `catalog.ts`
- `orders`: `channel`, `order_number`, nullable organizace, `customer_note`,
  kódy/názvy dopravy a platby, `discount_kc`, `age_confirmed_at`,
  `terms_accepted_at`, CHECK omezení
- `order_items`: `product_variant_id`, `sku_snapshot`, CHECK omezení
- `order_activity`: `actor_type`, nullable autor
- kód: oprava partnerského obratu (bez dopravy)

**Odložit:**
- B2B ceníky (`price_lists`), partnerská sleva v ceně e-shopu
- tabulky dopravy (`shipping_methods`, `shipping_rates` podle objemu) —
  do té doby ve sdíleném kódu, objednávka ukládá snapshot
- zákaznické účty pro B2C, strukturované adresy, fakturační údaje firmy
- `invoices` pro B2C
- receptury, suroviny, výroba, šarže, sklad, `order_items.production_batch_id`
- `weight_g`, `ean`, `package_type`, `terms_version`, rozměry obrázků
- DPH sloupce (Begina není plátce DPH; při registraci k DPH přidat
  sazbu na balení a snapshot sazby na `order_items`)

## 5. Rizika migrace

| Riziko | Dopad | Opatření |
|---|---|---|
| **Dvě aplikace se nasazují nezávisle** | Změna schématu může rozbít aplikaci, která ještě běží se starým kódem | Vždy **expand → přepnout kód → contract**: nejdřív jen přidávat (nullable/default), mazat nebo přejmenovávat až po nasazení obou aplikací. Proto se nepřejmenovává `name` → `name_snapshot`. |
| `buyer_organization_id` nullable | TS typ `string` → `string \| null`; `buildOrderCards` (`inArray` s NULL, `orgNameById.get`) a UI počítají s organizací | Nasadit úpravu moje.begina.cz (zobrazit `contact_name`, když chybí organizace) **dřív**, než vznikne první objednávka bez organizace; CHECK drží ruční objednávky s organizací |
| CHECK omezení na existujících datech | Migrace selže, pokud data nesplňují invariant | Ověřeno 26. 9.: 2/2 objednávky a 5/5 položek splňují. Těsně před migrací ověřit znovu. |
| `order_number` | Nevratné rozhodnutí o formátu, riziko duplicit s WooCommerce | Tři kroky: sekvence + nullable sloupec → backfill → NOT NULL. Start sekvence až po rozhodnutí (oddíl 7). |
| Seed produktů | Chybné SKU = rozbité košíky, pozdější vazby | Seed idempotentní (upsert podle `slug`/`sku`), SKU přesně z `catalog.ts`, test porovná DB s `catalog.ts` |
| Obrázky v `public/` jedné aplikace | Druhá aplikace je nezobrazí | Před oddělením aplikací přesunout do sdíleného úložiště (např. Vercel Blob) a v DB mít absolutní URL |
| neon-http nemá interaktivní transakce | Nejde „přečíst → rozhodnout → zapsat“ v jedné transakci | Zápis objednávky = jeden `db.batch()` (už používá `createOrder`); číslo ze sekvence v témže INSERTu. Rezervace skladu později přes WebSocket driver. |
| Oprávnění k DB | Veřejný web s plnými právy = riziko pro celou DB | Pro begina.cz **samostatná DB role**: SELECT na katalog, INSERT na `orders`/`order_items`/`order_activity`, USAGE na `order_number_seq`, nic na `leads`, `company_*`, `user_roles`… Hlavní bezpečnostní přínos dvou aplikací. |
| Migrace spouští jen vedení | Claude má k Neonu read-only přístup | Každou migraci nejdřív na Neon branch (Vercel preview větve už vznikají), pak produkce |
| drizzle-kit | CHECK, sekvence a data-backfill se generují jen částečně | `check()` a `pgSequence` z drizzle-orm; backfilly jako ručně psané SQL soubory ve stejném journalu |

## 6. Návrh pořadí migrací

Každý krok je samostatná migrace, nejdřív na Neon branch, pak produkce.
Čísla navazují na existující `drizzle/0000–0010`.

| # | Migrace | Typ | Závisí na | Dopad na běžící kód |
|---|---|---|---|---|
| 0011 | `product_categories`, `products`, `product_variants`, `product_images` | čistě přidává | — | žádný |
| 0012 | seed katalogu z `catalog.ts` (idempotentní) | data | 0011 | žádný |
| 0013 | `order_activity.actor_type` + nullable `author_user_id` + CHECK | expand | — | žádný (default `user`) |
| 0014 | `orders`: `channel` (default `manual`, backfill 2 řádků → `import`), `customer_note`, doprava/platba, `discount_kc`, `age_confirmed_at`, `terms_accepted_at`, CHECK součtů | expand | — | žádný |
| 0015 | `order_items`: `product_variant_id` FK, `sku_snapshot`, CHECK | expand | 0011 | žádný |
| 0016a | sekvence `order_number_seq` + nullable `orders.order_number` UNIQUE | expand | **rozhodnutí o číslování** | žádný |
| 0016b | backfill čísel 2 existujících objednávek → `order_number` NOT NULL | contract | 0016a | `createOrder` musí číslo plnit (DEFAULT ze sekvence) |
| — | **kód moje.begina.cz**: objednávka bez organizace, partnerský obrat bez dopravy, `order_number` v UI | nasazení | 0014 | — |
| 0017 | `orders.buyer_organization_id` DROP NOT NULL + CHECK (manual → organizace, guest → e-mail) | contract | nasazený kód výše | — |
| — | **kód begina.cz**: čtení katalogu z DB, zápis objednávky | nasazení | 0011–0017 | — |

Kroky 0011–0015 lze nasadit kdykoli, nic nemění pro dnešní provoz.
Otevírá se až 0017 + zápis z e-shopu.

## 7. Číslo objednávky — možnosti (rozhodne se zvlášť)

Technicky pro všechny varianty: sloupec `order_number text UNIQUE`,
hodnota ze sekvence `order_number_seq` v témže INSERTu (bez souběhových
duplicit). Mezery v řadě (zrušený INSERT) jsou u objednávek v pořádku —
nejsou to daňové doklady. **Číslo faktury zůstává samostatné**
(`invoices.invoice_number`, řídí účetnictví).

| Varianta | Příklad | + | − |
|---|---|---|---|
| A — navázat na WooCommerce | 5094, 5095… | zákazník nevidí skok | Při souběhu starého a nového e-shopu hrozí duplicity; start se musí nastavit přesně v den přepnutí; nové číslování navždy svázané se starým systémem |
| B — nová řada s odstupem | 10001, 10002… | čistě číselné, bez kolize i při souběhu, importované Woo objednávky (< 10000) se vejdou do stejného sloupce | viditelný skok |
| C — rok + pořadí | 2026-0001 | čitelné, bez kolize, orientace v čase | nutné nulovat řadu každý rok (sekvence pro každý rok nebo funkce) |
| D — prefix kanálu | E-1001 (e-shop), M-1001 (ručně) | na první pohled vidět zdroj | dvě řady, zákazník vidí interní rozlišení; kanál je stejně ve sloupci `channel` |

Existující 2 objednávky dostanou číslo podle zvolené varianty; objednávky
importované z WooCommerce mohou nést původní číslo (u B/C/D bez kolize).

## 8. Dopad varianty „dvě aplikace“ na schéma

- `packages/db` — `schema.ts`, migrace, klient; **migrace spouští jen
  tento balíček** (ručně nebo CI), nikdy build aplikace.
- `packages/commerce` — `priceCart`, doprava, partnerské slevy, validace
  pokladny, úplnost údajů o potravině (dnešní `lib/eshop/*` +
  `mock/partnerProgram.ts` pravidla).
- `apps/web` (begina.cz) — vlastní omezená DB role (oddíl 5), bez přístupu
  k interním tabulkám.
- `apps/moje` (moje.begina.cz) — dnešní `dashboard`, plná role.
- Neon Auth: moje.begina.cz beze změny. Přihlášení zákazníků na begina.cz
  (později) = stejná `neon_auth` data, vlastní session na doméně begina.cz.
- Objednávka z e-shopu se v moje.begina.cz zobrazí okamžitě (stejná
  tabulka), upozornění na nové objednávky (`fulfillment_status = new`)
  už existuje.

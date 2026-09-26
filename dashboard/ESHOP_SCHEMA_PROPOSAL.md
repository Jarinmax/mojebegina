# Návrh DB schématu ESHOP 1.0 — ke schválení (v2)

Stav: **NÁVRH** (26. 9. 2026). Nic z tohoto dokumentu není provedené —
žádná migrace, žádná změna `lib/db/schema.ts`, žádná změna produkce
ani produkčního kódu. Navazuje na `ESHOP_AUDIT.md`.

**Rozhodnutý směr (vedení, 26. 9. 2026):** jeden Next.js projekt, jedna
Neon DB, produkty vlastní MojeBegina, begina.cz je veřejná prodejní vrstva
nad stejnými daty, `lib/eshop/catalog.ts` je první zdroj pro naplnění
produktů. Schéma na počtu aplikací nezávisí.

**SQL ke kontrole:** `docs/eshop-schema-draft/` — pro každý krok soubor
`*_up.sql` a vratný `*_down.sql`, kontrolní dotazy `00_preflight_checks.sql`
a `99_postflight_checks.sql`. Mimo složku `drizzle/`, aby je nic nespustilo
omylem. Ve finální implementaci se z nich stanou drizzle migrace 0011–0017.

## Ověření návrhu (bez dotyku produkce)

Celý SQL plán byl 26. 9. 2026 spuštěn na **dočasné Postgres databázi
v paměti (PGlite)**, ne na Neonu: stávající migrace 0000–0010 + data jako
v produkci (2 objednávky The Cup, 5 položek) → všechny kroky nahoru →
seed 2× (idempotence) → testy omezení → všechny kroky dolů.
**Výsledek: 33/33 v pořádku**, po návratu je schéma i data přesně jako
před začátkem (23 sloupců `orders`, organizace NOT NULL, 0 produktových
tabulek). Ověřeno mimo jiné:

- seed: 5 kategorií, 7 produktů, 11 SKU, 4 fotky; Svařák 3 l = 499 Kč /
  3000 ml / 15 nápojů; všechny 4 koktejly 18+
- e-shopová objednávka bez organizace se zapíše jedním batchem (objednávka
  + položka s vazbou na SKU + systémový záznam aktivity) a dostane č. 5094;
  další ruční objednávka č. 5095
- odmítnuto databází: import s číslem, které už nová řada vydala; ruční
  objednávka bez organizace; guest bez e-mailu; nesedící součty; vazba bez
  SKU snapshotu; interní záznam aktivity bez autora; alkohol bez 18+;
  neznámý alergen; smazání prodaného balení; spuštění přepnutí číslování
  s nevyplněným číslem z WooCommerce; návrat kroku 7, když už existuje
  objednávka bez organizace

## 1. Co už existuje a jak to zapadá

| Požadavek | Dnes | Závěr |
|---|---|---|
| Produkty, kategorie, balení | **v DB neexistuje**, jen `lib/eshop/catalog.ts` | nové tabulky, `catalog.ts` = seed |
| Název a cena v položce | `order_items.name`, `unit_price_kc` — **už jsou snapshoty** (komentář ve `schema.ts`) | ponechat, doplnit vazbu + `sku_snapshot` |
| Kontakt a doručení guest zákazníka | `orders.contact_*`, `recipient_*` existují | použít beze změny |
| Přihlášený zákazník | `orders.placed_by_user_id` existuje (dnes vždy NULL) | použít beze změny |
| Zboží a doprava zvlášť | `subtotal_kc`, `shipping_kc`, `total_kc` existují | doplnit slevu a způsob dopravy |
| Import z WooCommerce | `orders.external_woocommerce_id` existuje | použít pro import historie |
| Poznámka zákazníka | `orders.note` je **interní** (`NoteForm` v Řízení firmy) | nový `customer_note` |
| Atomický zápis | `createOrder` používá `db.batch()` (jedna transakce) | e-shop použije stejný vzor |

Data v produkci (26. 9.): 2 objednávky (import, The Cup), 5 položek,
2 faktury, 0 záznamů aktivity. Všechna splňují navržená CHECK omezení.

## 2. Diagram vztahů

```
product_categories 1──* products 1──* product_variants (sku UNIQUE)
                          └──* product_images        │
                                                     │ product_variant_id (RESTRICT)
                                                     *  + sku_snapshot, name, unit_price_kc
organizations 0..1──* orders 1──* order_items ───────┘
neon_auth.user 0..1──* orders (placed_by_user_id)
                       orders 1──* order_activity (actor_type: user | system | customer)
                       orders.order_number ← order_number_seq (navazuje na WooCommerce)

BUDOUCNOST — ukazuje NA produkty, dnes nic neblokuje:
products → recipes → raw_materials · product_variants → production_batches → stock_movements
order_items → production_batches · organizations → price_lists → price_list_items → product_variants
```

## 3. Změny a jejich vyhodnocení

Sloupce: **Proč** · **MVP** (povinné pro první verzi) · **Dopad na data** ·
**Vratnost** · **Konflikt s MojeBegina**.

### 3.1 `product_categories` — nová tabulka (krok 1)

Sloupce: `id`, `slug` (UNIQUE, formát), `name`, `intro text[]`,
`detail_sections jsonb`, `image_url`, `sort_order`, `is_active`,
`created_at`, `updated_at`.

| Proč | MVP | Dopad na data | Vratnost | Konflikt |
|---|---|---|---|---|
| Kategorie e-shopu (5 z begina.cz) na jednom místě pro web i MojeBegina; `sort_order` = pořadí dlaždic, `is_active` = skrytí bez mazání | **Ano** | Žádný — nová tabulka | Plně (`01_products_down.sql`) | Žádný — v DB nic podobného není |

18+ **není** vlastnost kategorie, ale produktu (jeden zdroj pravdy);
stránka kategorie upozornění zobrazí, pokud obsahuje 18+ produkt.

### 3.2 `products` — nová tabulka (krok 1)

| Sloupec | Proč |
|---|---|
| `category_id` (FK, RESTRICT) | zařazení; kategorii s produkty nejde smazat |
| `slug` (UNIQUE), `name` | URL a název |
| `short_description`, `description text[]`, `highlights text[]`, `taste_description` | texty z begina.cz |
| `ingredients` | složení — povinné před nákupem (1169/2011) |
| `allergens text[]` + CHECK na 14 kódů EU | **NULL = neznámé** (e-shop ukáže „Doplníme“), `{}` = bez alergenů; kontrolovaný seznam místo volného textu |
| `allergen_note` | „Může obsahovat stopy…“ |
| `nutrition jsonb`, `nutrition_basis` (`100g`/`100ml`) | 7 povinných výživových údajů; jsonb, protože se podle nich nefiltruje |
| `storage_instructions`, `shelf_life_note` | text pro zákazníka |
| `shelf_life_days` | trvanlivost pro budoucí výrobu/šarže (`best_before`) |
| `alcohol_percent`, `is_age_restricted` + CHECK | 18+; DB nepřijme alkohol (> 0,5 % obj.) bez 18+ |
| `warnings text[]` | „Není určeno pro děti…“, upozornění k E110/E124 |
| `sort_order`, `is_active`, časy | pořadí, stažení z prodeje bez mazání |

| Proč | MVP | Dopad na data | Vratnost | Konflikt |
|---|---|---|---|---|
| „Co vyrábíme“ — jedna receptura, údaje o potravině společné pro všechna balení; vlastní ho oblast „Produkty“ v MojeBegina | **Ano** | Žádný | Plně | Žádný — oblast „Produkty“ je zatím jen popsaná (`companyOverview.ts`); tabulka je přesně její budoucí základ |

### 3.3 `product_variants` — nová tabulka (krok 1)

Sloupce: `product_id` (FK, RESTRICT), `sku` (UNIQUE, formát), `label`,
`short_note`, `package_description`, `volume_ml`, `servings`,
`price_b2c_kc`, `is_active`, `sort_order`, časy.

| Proč | MVP | Dopad na data | Vratnost | Konflikt |
|---|---|---|---|---|
| „Co prodáváme“ — jedno SKU = jedno balení s cenou. `volume_ml` je nutný už teď: begina.cz počítá dopravu podle objemu. `servings` = „15 nápojů“ → cena za nápoj. `price_b2c_kc` = konečná cena (neplátce DPH). | **Ano** | Žádný | Plně, dokud na balení neodkazuje objednávka (pak RESTRICT) | Žádný |

**B2B cena — záměrně ne v MVP.** Partnerská sleva je pravidlo (% podle
obratu), ne cena u balení. Individuální dohody později jako ceníky
(`price_lists`, `price_list_items`, `organizations.price_list_id`).
Jeden sloupec `price_b2b_kc` se nedoporučuje — individuální dohody
nepokryje a musel by se později migrovat.

### 3.4 `product_images` — nová tabulka (krok 1)

Sloupce: `product_id` (FK, CASCADE), `variant_id` (FK NULL, SET NULL),
`url`, `alt`, `sort_order`, `created_at`.

| Proč | MVP | Dopad na data | Vratnost | Konflikt |
|---|---|---|---|---|
| Fotky produktu (a volitelně balení), pořadí; 0 = hlavní | **Ano** (seed 4 fotek) | Žádný | Plně | Žádný. V jednom projektu fungují i dnešní cesty `/eshop/*.jpg`; do sdíleného úložiště až s originálními fotkami |

### 3.5 Naplnění katalogu (krok 2, data)

| Proč | MVP | Dopad na data | Vratnost | Konflikt |
|---|---|---|---|---|
| `catalog.ts` → DB jako první zdroj; **vygenerováno skriptem z `catalog.ts`**, ne ručně; idempotentní (`ON CONFLICT` podle `slug`/`sku`) | **Ano** | Přidá 5 + 7 + 11 + 4 řádků | Plně, dokud na SKU neodkazuje objednávka (`02_products_seed_down.sql`) | Žádný |

Po kroku 2 zůstává `catalog.ts` jen do přepnutí e-shopu na čtení z DB;
pak se odstraní (jinak by vznikly dva katalogy — riziko z auditu).

### 3.6 Vazby přes SKU

- **Závazná vazba je `order_items.product_variant_id` (UUID), ne text SKU.**
  Přejmenování SKU proto nerozbije historické objednávky (ověřeno testem).
- `sku` je obchodní klíč pro košík, URL, feedy a sklad; UNIQUE a formát
  hlídá DB.
- **Pravidlo:** SKU po prvním prodeji neměnit (kvůli košíkům v prohlížeči
  a externím feedům). Hlídá ho aplikace; košík neznámé SKU tiše zahodí
  (existující test). Tvrdý zákaz triggerem až v případě potřeby.

### 3.7 `order_items` — změny (krok 5)

| Změna | Proč | MVP | Dopad na data | Vratnost | Konflikt |
|---|---|---|---|---|---|
| `product_variant_id` uuid NULL, FK → product_variants **RESTRICT** + index | Statistiky prodejů, výroba, sklad; prodané balení nejde smazat, jen deaktivovat | **Ano** | Existující řádky NULL | Plně | Žádný; ruční `CreateOrderForm` dál ukládá NULL |
| `sku_snapshot` text NULL | SKU v okamžiku objednávky | **Ano** | NULL | Plně | Žádný |
| `name` = snapshot názvu | **Beze změny** — už dnes snapshot; přejmenování na `name_snapshot` by rozbilo existující kód bez přínosu | — | — | — | — |
| `unit_price_kc` = snapshot ceny | **Beze změny** | — | — | — | — |
| CHECK `quantity > 0`, `line_total_kc = quantity × unit_price_kc` | Nesedící řádek nesmí vzniknout | **Ano** | 5/5 řádků splňuje | Plně | `createOrder` už počítá stejně |
| CHECK vazba ⇒ SKU snapshot | Vazba bez snapshotu nedává smysl | **Ano** | — | Plně | Žádný |
| Propojení 5 historických položek polévek podle názvu | Statistiky i pro historii | Ne (volitelné) | 5 řádků dostane vazbu | Plně | Žádný |

Historická objednávka zůstává správná po změně názvu, SKU i ceny, protože
se zobrazuje ze snapshotů (`name`, `sku_snapshot`, `unit_price_kc`),
nikdy z živého katalogu.

### 3.8 `orders` — nová pole (krok 4)

| Změna | Proč | MVP | Dopad na data | Vratnost | Konflikt |
|---|---|---|---|---|---|
| `channel` text NOT NULL DEFAULT `manual`, CHECK `manual`/`eshop`/`import` | Odkud objednávka přišla; odlišení v přehledech a pravidlech | **Ano** | 2 existující → `import` (explicitně podle id) | Plně | Žádný — default zachová dnešní `createOrder` |
| `customer_note` | `note` je interní, nesmí se míchat | **Ano** | NULL | Plně (smaže poznámky) | Žádný |
| `shipping_method_code`, `shipping_method_label` | Způsob dopravy + snapshot názvu; cena zůstává v `shipping_kc` | **Ano** | NULL | Plně | Žádný |
| `payment_method_code`, `payment_method_label` | Způsob platby + snapshot | **Ano** | NULL | Plně | Žádný |
| `discount_kc` NOT NULL DEFAULT 0 | Partnerská/individuální sleva na zboží — obrat se počítá bez dopravy i po slevě | **Ano** (dnes vždy 0) | 0 | Plně | Žádný |
| CHECK `total = subtotal − discount + shipping` | Součty nesmí nesedět | **Ano** | 2/2 splňují | Plně | `createOrder` počítá stejně |
| `age_confirmed_at` | Doklad potvrzení 18+ | **Ano** (alkohol) | NULL | Plně | Žádný |
| `terms_accepted_at` | Doklad souhlasu s obchodními podmínkami | **Ano** | NULL | Plně | Žádný |

**Partnerský obrat** = Σ (`subtotal_kc − discount_kc`) uhrazených
objednávek organizace za měsíc; doprava je v `shipping_kc`, takže se
nezapočítá. Vyžaduje úpravu kódu `getCurrentMonthlyPurchase`
(`lib/data/dashboard.ts` dnes sčítá `total_kc`) — **změna kódu, ne
schématu**, samostatně ke schválení.

### 3.9 Objednávka bez organizace (krok 7)

| Změna | Proč | MVP | Dopad na data | Vratnost | Konflikt |
|---|---|---|---|---|---|
| `buyer_organization_id` DROP NOT NULL | Soukromý zákazník bez IČO; **žádné falešné organizace** | **Ano** | Žádný | **Jen dokud neexistuje objednávka bez organizace** (ověřeno testem) | **Ano — viz níže** |
| CHECK `channel <> 'manual' OR buyer_organization_id IS NOT NULL` | Ruční objednávka dál musí mít organizaci | **Ano** | — | Plně | Odpovídá dnešní validaci |
| CHECK `buyer_organization_id IS NOT NULL OR contact_email IS NOT NULL` | Guest objednávka musí mít kontakt | **Ano** | — | Plně | Žádný |

**Konflikty — místa, která dnes počítají s organizací** (nutno upravit
a nasadit **před** krokem 7):

| Místo | Co udělat |
|---|---|
| `lib/data/orders.ts` `buildOrderCards` | Vynechat NULL z `orgIds`; název = kontakt („Soukromý zákazník — Jana N.“) místo „Neznámá organizace“ |
| `app/rizeni-firmy/objednavky/OrderCard.tsx`, `[id]/page.tsx` | Zobrazit kontakt, když chybí organizace |
| `lib/data/leads.ts` (~ř. 205, 545, 716–731, 822) | Odfiltrovat NULL; hledání duplicit podle telefonu/e-mailu v objednávkách zahrnuje i guest objednávky — pro CRM je to přínos, ale musí se ošetřit NULL |
| `lib/data/dashboard.ts` | Beze změny — filtruje podle organizace, guest se nezobrazí |
| TypeScript | Typ se změní na `string \| null` — kompilátor najde všechna místa |

Až bude potřeba **přihlášený B2C zákazník**, použije se existující
`placed_by_user_id` (bez organizace). Guest checkout zůstává možný vždy.

### 3.10 Systémový zápis do `order_activity` (krok 3)

| Změna | Proč | MVP | Dopad na data | Vratnost | Konflikt |
|---|---|---|---|---|---|
| `actor_type` NOT NULL DEFAULT `user`, CHECK `user`/`system`/`customer` | Objednávku z e-shopu zakládá systém, ne interní uživatel | **Ano** | Dnes 0 řádků | Plně | Žádný — default `user` |
| `author_user_id` DROP NOT NULL + CHECK `user` ⇒ autor | Systémový záznam nemá uživatele; interní záznam ho mít musí dál | **Ano** | — | **Jen dokud neexistuje systémový záznam** | Timeline zobrazuje `author_name` → „E-shop“ funguje beze změny |

**Proč ne falešné ID `"system"`** (šlo by bez migrace, sloupec je text
bez FK): projekt má výslovné pravidlo „žádné paralelní identity vedle
skutečných Auth účtů“ (`schema.ts`, `company_nodes.owner_user_id`) a kód,
který dohledává profily podle `author_user_id`, by s falešným ID tiše
nenašel nic.

### 3.11 Číslo objednávky (kroky 6a, 6b)

| Změna | Proč | MVP | Dopad na data | Vratnost | Konflikt |
|---|---|---|---|---|---|
| 6a: `order_number bigint` NULL + UNIQUE index | Zákaznické číslo; bigint kvůli navázání na Woo a řazení | **Ano** | Existující NULL | Plně | Žádný |
| 6b: sekvence `order_number_seq`, DEFAULT, CHECK `channel = 'import' OR order_number IS NOT NULL` | Každá nová objednávka (e-shop i ruční) dostane číslo automaticky, atomicky, bez duplicit | **Ano** | Objednávky vzniklé mezi 6a a 6b dostanou čísla podle data; import smí zůstat bez čísla | Technicky ano, **obchodně ne** po prvním vydaném čísle | `createOrder` nemusí nic měnit (DEFAULT); UI čísla doplnit |

Číslo objednávky **není** číslo faktury — `invoices.invoice_number`
zůstává samostatné a řídí ho účetnictví. Mezery v řadě (zrušený zápis)
jsou u objednávek v pořádku.

## 4. Navázání na WooCommerce (~5093) bez duplicit

**Princip:** jedna řada čísel pro všechny kanály, jejíž start se nastaví
**až v den přepnutí** podle skutečného posledního čísla ve WooCommerce.
Duplicitám brání tři pojistky: vypnutá Woo pokladna, UNIQUE index a kontrola
ve skriptu přepnutí.

**Doporučený postup — tvrdé přepnutí (čísla plynule navazují):**

1. Předem (kdykoli): kroky 6a (sloupec) a volitelně import historie Woo
   objednávek s jejich **původními čísly** (`channel = 'import'`,
   `order_number` = číslo z Woo, `external_woocommerce_id`).
2. Den přepnutí: ve WooCommerce vypnout pokladnu (režim údržby), počkat
   na dokončení rozběhnutých plateb.
3. Zjistit nejvyšší **číslo objednávky, které vidí zákazník** (e-mail
   „Objednávka č. 5093“). Pozor: WooCommerce standardně ukazuje interní
   ID, které není souvislé (sdílí řadu s jinými záznamy WordPressu) —
   mezery jsou normální; rozhoduje nejvyšší zobrazené číslo.
4. Spustit `06b_order_number_cutover_up.sql` s tímto číslem
   (`setval` → další objednávka = MAX + 1, např. 5094).
5. Zapnout novou pokladnu.

**Alternativa — souběh obou e-shopů:** pokud má starý a nový e-shop běžet
současně, spustit 6b se startem **MAX + rezerva** (např. 6000). Woo dál
čísluje pod 6000, nový systém od 6001, UNIQUE index případnou kolizi
odmítne (nikdy tichá duplicita). Kontrolní dotaz pro souběh:
`SELECT max(order_number) FROM orders WHERE channel = 'import'` musí
zůstat pod startem nové řady.

**Existující 2 objednávky The Cup** (`import`) zůstávají bez čísla —
nevymýšlí se jim zpětně. Pokud existují ve WooCommerce, doplní se jim
původní Woo číslo ručně.

**Proč sekvence v DB, ne počítání v aplikaci:** `nextval` je atomický
i při souběžných objednávkách a běží v témže INSERTu, takže funguje
s dnešním `db.batch()` (neon-http nemá interaktivní transakce).

## 5. MVP vs. odložit

**MVP (kroky 1–7):** 4 produktové tabulky + seed, `order_activity`
(actor_type), nová pole `orders`, vazba `order_items`, číslo objednávky,
objednávka bez organizace; k tomu úpravy kódu z oddílu 3.9 a oprava
partnerského obratu.

**Odložit:** B2B ceníky a partnerská sleva v cenách e-shopu; tabulky
dopravy podle objemu (do té doby ve sdíleném kódu, objednávka ukládá
snapshot); zákaznické účty B2C; strukturovaná adresa a fakturační údaje
firmy u guest objednávky; `invoices` pro B2C (rozhodnout s účetní);
receptury, výroba, šarže, sklad (`order_items.production_batch_id`);
`weight_g`, `ean`, `package_type`, `terms_version`; DPH (Begina není
plátce DPH).

## 6. Pořadí a rizika

| Krok | Soubor | Kdy | Dopad na běžící provoz |
|---|---|---|---|
| 0 | `00_preflight_checks.sql` | před každým spuštěním | jen čtení |
| 1 | `01_products_up.sql` | kdykoli | žádný |
| 2 | `02_products_seed.sql` | po 1 | žádný |
| 3 | `03_order_activity_actor_up.sql` | kdykoli | žádný |
| 4 | `04_orders_eshop_fields_up.sql` | kdykoli | žádný (defaulty) |
| 5 | `05_order_items_variant_up.sql` | po 1 | žádný |
| 6a | `06a_order_number_column_up.sql` | kdykoli | žádný |
| — | kód MojeBegina: objednávka bez organizace, číslo objednávky v UI, partnerský obrat | po 4–6a | nasazení kódu |
| 7 | `07_orders_guest_up.sql` | **až po nasazení kódu výše** | žádný |
| 6b | `06b_order_number_cutover_up.sql` | **v den přepnutí z WooCommerce** | začne číslovat |
| — | kód e-shopu: čtení katalogu z DB, zápis objednávek | po 1–7 a 6b | spuštění prodeje |
| 99 | `99_postflight_checks.sql` | po každém kroku | jen čtení |

**Rizika:**

| Riziko | Opatření |
|---|---|
| Krok 7 dřív než kód MojeBegina | Pořadí výše; typy TypeScriptu odhalí všechna místa |
| CHECK omezení na datech, která mezitím přibudou | `00_preflight_checks.sql` těsně před spuštěním |
| Špatné číslo v den přepnutí | Placeholder → syntaktická chyba; kontrola v `DO` bloku; UNIQUE index |
| Nevratnost po spuštění prodeje (kroky 3, 6b, 7) | Návrat možný jen před prvním systémovým záznamem / vydaným číslem / guest objednávkou — rozhodnout se před spuštěním |
| Dva katalogy (DB + `catalog.ts`) | Po přepnutí e-shopu na DB `catalog.ts` odstranit |
| Migrace spouští vedení | Každý krok nejdřív na Neon branch, pak produkce (Claude má jen read-only přístup) |
| drizzle-kit | `check()` a `pgSequence` jsou v nainstalované verzi drizzle-orm 0.45.2 k dispozici (ověřeno); seed, backfilly a přepnutí číslování jako ručně psané SQL ve stejném journalu |

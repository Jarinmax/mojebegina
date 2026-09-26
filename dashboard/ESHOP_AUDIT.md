# Audit e-shopu Begina.cz — výchozí stav

Stav k 26. 9. 2026, větev `claude/great-bell-ffjwo3` (commit `8b04ab2`).
**Schváleno vedením jako výchozí stav** (26. 9. 2026). Oddíl 6 doplněn
o rozhodnutí vedení: monorepo, jedna DB, dvě aplikace a dva deploymenty.

**Shrnutí:** nic se nemusí mazat ani vracet. Všechna práce na e-shopu je
izolovaná a nedotýká se databáze — paralelní datový model vůči MojeBegina
dnes nevzniká. Správná chvíle mu předejít je teď: produkty je potřeba dostat
do DB dřív, než e-shop začne zapisovat objednávky.

## 1. Co je hotové

Ověřeno v kódu a v DB (read-only), ne z paměti.

- 9 commitů, 34 nových souborů, +2 335 řádků. **Mimo e-shopové složky se
  nezměnil žádný soubor** (kromě nového `ESHOP_ROADMAP.md`). Žádná změna
  schématu, migrací, autentizace, rolí ani objednávek. Nic není v `main`.
- **Izolace:** e-shopový kód importuje z existující aplikace jen
  `lib/format` (formátování Kč) a logo. Nic z `lib/data`, `lib/db`,
  `lib/auth`.

| Část | Co existuje |
|---|---|
| Kategorie | 5, podle begina.cz — v kódu (`lib/eshop/catalog.ts`) |
| Produkty | 7 produktů / 11 SKU (3 polévky × 1 balení, 4 koktejly × 2 balení) — v kódu |
| DB tabulky / schéma | **žádné** — nic nového, žádná migrace; pokladna nic nezapisuje |
| Routy | `/eshop`, `/eshop/kategorie/[slug]`, `/eshop/produkt/[slug]`, `/eshop/kosik`, `/eshop/pokladna` + server action `submitCheckoutAction` |
| Logika | `lib/eshop/` — `catalog`, `cart`, `pricing`, `checkout`, `shipping` + 3 testové soubory |
| Komponenty | `components/eshop/` (8) + `CheckoutForm` |
| Administrace | **žádná** |
| Ostatní | 9 fotek v `public/eshop/` (oříznuté ze screenshotů), `noindex`, `ESHOP_ROADMAP.md` |

## 2. Co je správně (ponechat)

- `pricing.ts`, `checkout.ts`, `cart.ts` — cena vždy ze serveru, vstup
  z prohlížeče sanitizovaný, pokryto testy; výstup řádku má tvar
  `order_items` (`name/quantity/unitPriceKc/lineTotalKc`).
- **Tvar dat** v `catalog.ts` (kategorie → produkt → balení se SKU, údaje
  o potravině, alkohol) — je to přímo návrh budoucích DB tabulek.
- **Stabilní SKU** (`svarak-deluxe-3l`) — může se stát klíčem v DB beze
  změny košíku.
- Ověření 18+ ve formuláři i na serveru.
- Routy, komponenty, texty z begina.cz — nezávisí na tom, odkud přijdou data.
- Izolace od zbytku — e-shop jde později přesunout/oddělit bez rozplétání.

## 3. Co je rizikové

| Riziko | Proč | Závažnost |
|---|---|---|
| **Katalog v kódu** | Až vznikne oblast „Produkty“ v MojeBegina (plán: produkt propojený s recepturou, výrobou, skladem), vznikly by dva katalogy. **Jediný skutečný zárodek paralelního modelu.** | Vysoká, pokud se nevyřeší před zápisem objednávek |
| `orders.buyer_organization_id` NOT NULL | Soukromý zákazník bez IČO se do objednávek nevejde | Blokující pro zápis |
| Chybí číslo objednávky | `orders` mají jen UUID; WooCommerce je u č. 5093 | Vysoká (zákazník, účetnictví) |
| `invoices.organization_id` NOT NULL | Faktura pro soukromého zákazníka nejde uložit | Střední |
| `order_activity.author_user_id` NOT NULL | Objednávku z e-shopu nezakládá přihlášený uživatel | Nízká, ale blokující pro zápis |
| `order_items` bez vazby na produkt | Jen textový název → statistiky prodejů, výroba, sklad | Střední |
| Partnerský program počítá i dopravu | Pravidlo: „jen hodnota zboží bez dopravy“, ale `getCurrentMonthlyPurchase` (`lib/data/dashboard.ts`) sčítá `totalKc`. Existující chyba, projeví se, jakmile objednávky ponesou dopravu. | Střední |
| Partnerská sleva v e-shopu chybí | Sleva platí na objednávky v dalším měsíci; `priceCart` o zákazníkovi neví | Až pro B2B |
| Fotky ze screenshotů v `public/` | Nízká kvalita, vázané na kód jedné aplikace | Nízká |
| Adresa `/eshop` na moje.begina.cz | Dočasná, cíl je begina.cz | Nízká |

Zjištění navíc: partnerský program uvádí **„Nejsme plátci DPH. Uvedené
ceny jsou konečné.“** — cena 379 Kč je konečná.

## 4. Propojení s MojeBegina

| Oblast | Stav | Co je potřeba |
|---|---|---|
| `orders` | Stavy platby/vyřízení, `contact*`/`recipient*`, `placedByUserId`, `externalWooCommerceId` už existují a sedí | nullable organizace, `channel`, číslo objednávky |
| `order_items` | `name` je snapshot ✓ | vazba na balení + SKU snapshot |
| Zákazníci (`organizations`) | Jen firmy, IČO povinné. **Nezakládat falešné organizace pro B2C.** | Guest checkout (snapshot v objednávce), účty až později |
| Faktury | 2 v DB, vázané na organizaci | nullable organizace, nebo B2C doklady mimo `invoices` |
| Autentizace | E-shop ji nepoužívá — správně pro nákup bez registrace | Pro B2B přihlášení na begina.cz řešit session napříč doménami |
| Role | Beze změny; objednávky vidí ADMIN/EXECUTIVE — e-shopové uvidí automaticky | nic |
| CRM | `leads.source` už zná `eshop`, dnes 0 takových leadů; nic se nebije | B2B poptávka z webu → lead; B2C nákup ne |
| Partnerský program | Počítá se z uhrazených objednávek organizace za měsíc | opravit „bez dopravy“; slevu později do ceny |

## 5. Cílová architektura (schválený směr)

- Jedna Neon databáze = jeden zdroj pravdy (produkty, objednávky,
  zákazníci, CRM).
- Produkty vlastní MojeBegina (oblast „Produkty“), e-shop je jen čte;
  `catalog.ts` poslouží jako seed.
- Objednávka z begina.cz → `orders` (`channel = eshop`, `unpaid`, `new`)
  + `order_items` + systémový záznam v `order_activity` → hned vidět
  v Objednávkách MojeBegina (upozornění na nové objednávky už existuje).
- Obchodní pravidla (cena, doprava, partnerské slevy) na jednom místě
  v kódu, sdílená oběma částmi.

## 6. Jedna, nebo dvě aplikace — ROZHODNUTO

**Rozhodnutí vedení (26. 9. 2026, upřesněno):** jeden repozitář (monorepo), **jedna Neon databáze** jako jediný zdroj
pravdy, **dvě samostatné Next.js aplikace a dva samostatné Vercel
deploymenty** — begina.cz (veřejný web + e-shop) a moje.begina.cz
(interní firemní systém). Sdílené DB schéma, typy a obchodní logika
v `packages/shared`. begina.cz používá **omezenou DB roli** (katalog číst,
objednávky zakládat, žádný přístup do CRM, Řízení firmy ani k jiným
interním datům). Produkty vlastní MojeBegina, `catalog.ts` je první zdroj
pro naplnění produktů. Plán přestavby: `MONOREPO_PLAN.md`.

Nechce se jedna společná Next.js aplikace nasazovaná jako jeden deployment
— cílem je, aby chyba nebo nasazení veřejného webu neovlivnilo Řízení
firmy. (Dřívější znění tohoto oddílu uvádělo „jeden Next.js projekt“ —
to byla nejasnost, opraveno.) Izolace e-shopového kódu (oddíl 1)
přesun do samostatné aplikace usnadňuje.

## 7. Doporučené další kroky

1. Návrh schématu → `ESHOP_SCHEMA_PROPOSAL.md` (schválen v zásadě 26. 9.).
   Plán přestavby repozitáře → `MONOREPO_PLAN.md`.
2. Produkty 1.0 v DB (tabulky + seed z `catalog.ts`).
3. Objednávky z e-shopu do `orders`.
4. Drobnosti mimo e-shop: partnerský obrat bez dopravy.

**Žádné DB migrace ani změny produkce bez samostatného schválení.**
Migrace spouští vedení (Claude má k Neonu jen read-only přístup).

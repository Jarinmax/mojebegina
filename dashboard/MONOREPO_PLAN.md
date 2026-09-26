# Plán přestavby repozitáře na monorepo — ke schválení

Stav: **NÁVRH** (26. 9. 2026). Žádný kód se zatím nepřesouvá, nic se
nemigruje, Vercel ani Neon se nemění. Navazuje na `ESHOP_AUDIT.md`
a `ESHOP_SCHEMA_PROPOSAL.md`.

**Rozhodnutá architektura:** jeden repozitář (monorepo), jedna Neon DB
(jediný zdroj pravdy), dvě samostatné Next.js aplikace a dva Vercel
deploymenty — **begina.cz** (veřejný web + e-shop) a **moje.begina.cz**
(interní systém). Sdílené DB schéma, typy a obchodní logika
v `packages/shared`. begina.cz s omezenou DB rolí.

## 0. Ověřená výchozí situace

| Fakt | Zdroj |
|---|---|
| Vercel projekt `mojebegina` má **Root Directory = `dashboard`** a Vercel ho už vede jako monorepo | metadata Vercel bota u PR #4 |
| Jediný `package-lock.json` je v `dashboard/`, npm, žádné workspaces | repozitář |
| Migrace se aplikují **ručně jako SQL v Neon Console** (sandbox nemá zápis) | commit 5832d56, `BACKLOG.md` |
| Next.js 16 (Turbopack): **workspace balíčky překládá automaticky**; kořen projektu určuje podle `package-lock.json` → lockfile musí být jen jeden, v kořeni repozitáře | `node_modules/next/dist/docs/…/transpilePackages.md`, `turbopack.md` |
| E-shopový prototyp (`app/eshop`, `components/eshop`, `lib/eshop`, `public/eshop`) **není v `main`** — je jen na větvi `claude/great-bell-ffjwo3`; produkční moje.begina.cz ho nikdy neobsahovala | git |
| E-shopový kód importuje z MojeBegina jen `lib/format` a logo | audit, oddíl 1 |
| MojeBegina importuje `@/lib/db/schema` v 9 souborech, `@/lib/format` v 21, partnerský program (`mock/partnerProgram`, `lib/partnerTier`) v 8 + 6 | grep |
| V kořeni repozitáře leží `index.html`, `css/`, `js/` — první zástupná stránka „Moje Begina“ (commit 07aa4b0); Vercel ji nenasazuje (root = `dashboard`) | git, Vercel |

## 1. Cílová struktura

```
/                                 (kořen repozitáře)
├─ package.json                   NOVÝ — private, "workspaces": ["dashboard", "web", "packages/*"]
├─ package-lock.json              PŘESUNUTÝ z dashboard/ — jediný lockfile
├─ .gitignore                     NOVÝ — node_modules, .next, .vercel
├─ README.md                      NOVÝ — jak spustit, build, test
│
├─ dashboard/                     moje.begina.cz — CESTA BEZE ZMĚNY (Vercel root = dashboard)
│   └─ …                          dnešní kód MojeBegina; 2–4 soubory se stanou jednořádkovými re-exporty
│
├─ web/                           begina.cz — NOVÁ Next.js aplikace (Vercel root = web)
│   ├─ app/                       routy e-shopu BEZ prefixu /eshop:
│   │   ├─ page.tsx               /                     (dnes /eshop)
│   │   ├─ kategorie/[slug]/      /kategorie/[slug]
│   │   ├─ produkt/[slug]/        /produkt/[slug]
│   │   ├─ kosik/                 /kosik
│   │   └─ pokladna/              /pokladna (+ actions.ts, CheckoutForm.tsx)
│   ├─ components/                dnešní components/eshop/*
│   ├─ lib/db/client.ts           vlastní DB klient (až ve fázi 6, s omezenou rolí)
│   ├─ public/                    dnešní public/eshop/* + kopie logo-begina-mark.png
│   ├─ next.config.ts             bezpečnostní hlavičky (převzaté), noindex do spuštění
│   ├─ package.json, tsconfig.json, eslint.config.mjs, postcss.config.mjs,
│   │  tailwind.config.ts, vitest.config.ts
│   └─ AGENTS.md / CLAUDE.md      (generuje next dev)
│
└─ packages/shared/               @begina/shared — JEDNO MÍSTO pro sdílené
    ├─ package.json               "exports" přímo na .ts zdroje (bez build kroku)
    ├─ src/db/schema.ts           PŘESUNUTO z dashboard/lib/db/schema.ts
    ├─ src/format.ts              PŘESUNUTO z dashboard/lib/format.ts
    ├─ src/commerce/              PŘESUNUTO z dashboard/lib/eshop/* (cart, pricing,
    │                             checkout, shipping, catalog) + pravidla partnerského
    │                             programu (mock/partnerProgram.ts, lib/partnerTier.ts)
    ├─ src/**/__tests__/          testy jdou se svým kódem
    ├─ vitest.config.ts, tsconfig.json, eslint.config.mjs
    └─ drizzle/, drizzle.config.ts  (fáze 7 — migrace, volitelně později)
```

**Proč `dashboard/` zůstává `dashboard/`** a ne `apps/moje`: Vercel projekt
moje.begina.cz staví z `dashboard/`. Přejmenování by vyžadovalo změnu
Root Directory přesně ve chvíli nasazení — zbytečné riziko bez funkčního
přínosu. `web/` je proto sourozenec `dashboard/`. Sjednocení do `apps/*`
lze udělat kdykoli později jako samostatný krok.

**DB klient zůstává v každé aplikaci** (4 řádky, vlastní `DATABASE_URL`).
Sdílí se schéma, ne připojení — `packages/shared` nikdy nečte env proměnné.

## 2. Co kam patří

| Dnes | Cíl | Fáze | Dopad na moje.begina.cz |
|---|---|---|---|
| `dashboard/package-lock.json` | `/package-lock.json` | 1 | žádný (stejné verze) |
| `dashboard/lib/db/schema.ts` | `packages/shared/src/db/schema.ts`; v dashboardu zůstane `export * from "@begina/shared/db/schema"` | 2 | žádný — 9 importů `@/lib/db/schema` beze změny |
| `dashboard/lib/db/client.ts` | **zůstává** | — | žádný |
| `dashboard/lib/format.ts` | `packages/shared/src/format.ts` + re-export | 2 | žádný — 21 importů beze změny |
| `dashboard/drizzle.config.ts` | zůstává, `schema` cesta dál funguje přes re-export | 2 | žádný (ověřit `drizzle-kit generate` → „No schema changes“) |
| `dashboard/lib/eshop/*` + testy | `packages/shared/src/commerce/*` | 3 | žádný — v `main` neexistuje |
| `dashboard/mock/partnerProgram.ts`, `dashboard/lib/partnerTier.ts` | `packages/shared/src/commerce/partner-program.ts` + re-exporty | 3 | žádný — 14 importů beze změny |
| `dashboard/app/eshop/*` | `web/app/*` (bez `/eshop`) | 4 | žádný — v `main` neexistuje |
| `dashboard/components/eshop/*` | `web/components/*` | 4 | žádný |
| `dashboard/public/eshop/*` | `web/public/*` | 4 | žádný |
| `dashboard/public/logo-begina-mark.png` | **zůstává**, kopie do `web/public/` | 4 | žádný |
| test „fotky existují v /public“ | `web/` (patří k aplikaci s obrázky) | 4 | — |
| `dashboard/drizzle/` | `packages/shared/drizzle/` | 7 (volitelně) | žádný (migrace se aplikují ručně; hashe se nemění) |
| `dashboard/ESHOP_*.md`, `MONOREPO_PLAN.md`, `docs/eshop-schema-draft/` | `/docs/` | 7 (volitelně) | žádný |
| kořenový `index.html`, `css/`, `js/` | **beze změny** — viz otevřené otázky | — | — |

Výsledek pro kód MojeBegina: **funkčně beze změny.** Mění se jen
`dashboard/package.json` (+ závislost `@begina/shared`), zmizí
`dashboard/package-lock.json` a 4 soubory se stanou jednořádkovými
re-exporty. Žádný jiný soubor v `app/`, `components/` ani `lib/data/`.

## 3. Fáze — každá je samostatný PR

Pravidla pro všechny fáze:
- Každý PR se nejdřív ověří na **Vercel preview** obou projektů; do `main`
  až po zelených testech a buildu.
- **Build MojeBegina musí mít stejný seznam rout** jako dnes (porovnat
  výpis `next build` před a po).
- Všech 220 dnešních testů MojeBegina (bez testů e-shopu) musí projít beze změny.
- Žádná fáze 1–5 nemění databázi ani env proměnné moje.begina.cz.

### Fáze 0 — příprava (bez kódu)

- Ve Vercel projektu `mojebegina` zkontrolovat: Root Directory =
  `dashboard`; zapnuté **„Include files outside the root directory in the
  Build Step“** (nutné, aby build viděl `packages/shared`); verze Node.js.
- Rozhodnout otevřené otázky (oddíl 9).

### Fáze 1 — kostra workspace

- Nový kořenový `package.json` (`private`, `workspaces`), `npm install`
  v kořeni → kořenový `package-lock.json`; smazat `dashboard/package-lock.json`.
- Kořenový `.gitignore`, `README.md`.
- Kód: **nic**.
- Ověření: preview `mojebegina` se sestaví; route výpis a testy shodné.
- Riziko: Vercel instaluje závislosti jinak (z kořene). Proto preview před
  mergem.

### Fáze 2 — `packages/shared`: schéma a formátování

- Vytvořit `packages/shared` (`package.json` s `exports`, `tsconfig`,
  `vitest`, `eslint`).
- Přesunout `schema.ts` a `format.ts`, v `dashboard` nechat re-exporty.
- `dashboard/package.json`: `"@begina/shared": "*"`.
- **Jedna verze `drizzle-orm`** v celém workspace (dvě kopie = nekompatibilní
  typy tabulek) — hlídat v lockfile.
- Ověření: testy, build, route výpis; `drizzle-kit generate` hlásí
  „No schema changes“.

### Fáze 3 — `packages/shared`: obchodní logika

- `lib/eshop/*` (+ testy) → `packages/shared/src/commerce/`.
- Pravidla partnerského programu → `commerce/partner-program.ts`,
  v `dashboard` re-exporty.
- `catalog.ts` jde dočasně s logikou (je to seed a dnešní data). Až bude
  katalog v DB, `pricing` dostane balení z DB a `catalog.ts` zmizí
  (jinak dva katalogy — riziko z auditu).
- Ověření: testy shared + dashboard.

### Fáze 4 — aplikace `web/` (begina.cz)

- Nová Next.js 16 aplikace (stejné verze `next`, `react`, `tailwindcss`
  jako dashboard), vlastní `layout.tsx` (hlavička, patička, `noindex`
  do spuštění), `next.config.ts` s bezpečnostními hlavičkami převzatými
  z dashboardu.
- Přesun rout, komponent a obrázků podle oddílu 2; routy bez `/eshop`.
- Z dashboardu na větvi odstranit `app/eshop`, `components/eshop`,
  `lib/eshop`, `public/eshop` — **v `main` nikdy nebyly**, takže
  MojeBegina v `main` zůstane přesně jako dnes.
- Ověření: testy, build obou aplikací, průchod nákupem v prohlížeči
  (stejný scénář jako dosud).

### Fáze 5 — Vercel projekt `begina-web`

- Nový projekt ze stejného GitHub repozitáře, Root Directory `web`
  (detail v oddílu 4). **Bez domény begina.cz** — zatím jen `*.vercel.app`.
- **Bez DB proměnných** — katalog je zatím statický, web DB nepotřebuje.
- Ověření: nasazení `begina-web` nijak neovlivní `mojebegina`
  (samostatný build, samostatné env).

### Fáze 6 — DB (až po schválení a provedení migrací ze `ESHOP_SCHEMA_PROPOSAL.md`)

- Vytvořit omezenou roli `begina_web` (oddíl 6), Neon branch `web-dev`
  pro preview.
- `web/lib/db/client.ts` + `DATABASE_URL` v `begina-web` (oddíl 5).
- Katalog z DB, zápis objednávek (`channel = 'eshop'`).
- MojeBegina: úpravy pro objednávky bez organizace (viz návrh schématu,
  oddíl 3.9) — před krokem 7 migrací.

### Fáze 7 — úklid (volitelně)

- `dashboard/drizzle/` + `drizzle.config.ts` → `packages/shared/`
  (migrace vlastní sdílený balíček).
- Dokumentace do `/docs/`.
- Volitelně přejmenovat `dashboard/` → `apps/moje`, `web/` → `apps/web`
  (koordinovaná změna Root Directory na Vercelu).

### Den spuštění (samostatný runbook, později)

Doména begina.cz na `begina-web` (DNS), vypnutí pokladny WooCommerce,
krok 6b číslování (MAX + 1), zrušení `noindex`, přesměrování starých URL.

## 4. Vercel konfigurace

| Nastavení | `mojebegina` (moje.begina.cz) — existuje | `begina-web` (begina.cz) — nový |
|---|---|---|
| Git repozitář | Jarinmax/mojebegina | stejný |
| Root Directory | `dashboard` — **beze změny** | `web` |
| Include files outside root | **zapnout / ověřit** (kvůli `packages/shared`) | zapnout |
| Framework | Next.js | Next.js |
| Install / Build command | výchozí (Vercel pozná npm workspaces z kořenového lockfile) | výchozí |
| Node.js verze | ověřit a sjednotit | stejná jako mojebegina |
| Production branch | `main` | `main` |
| Domény | moje.begina.cz — beze změny | fáze 5: jen `*.vercel.app`; begina.cz + www až v den spuštění |
| Neon integrace | **beze změny** (vytváří preview větve DB) | **nepřipojovat** — integrace vkládá plná práva vlastníka |
| Ignored Build Step (volitelné) | přeskočit build, pokud se nezměnil `dashboard/`, `packages/shared/` ani kořenový `package*.json` | totéž pro `web/` |

Bez „Ignored Build Step“ se při každém pushi sestaví obě aplikace — je to
bezpečné, jen pomalejší; lze doplnit později.

## 5. Env proměnné

| Proměnná | `mojebegina` | `begina-web` |
|---|---|---|
| `DATABASE_URL` | **beze změny** (Neon integrace, vlastník DB) | fáze 6: ručně. Production = role `begina_web` na větvi `main`. Preview = `begina_web` na větvi **`web-dev`** — nikdy produkční DB. |
| `PG*`, `POSTGRES_*` | beze změny (integrace) | **nenastavovat** |
| `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` | beze změny | **nenastavovat** (web zatím nemá přihlášení) |
| `NEXT_PUBLIC_SITE_URL` | — | `https://begina.cz` (Production), preview URL (Preview) — kanonické URL, sitemap |
| Platební brána, e-mail (později) | — | jen `begina-web` |

Pozor na **Shared Environment Variables** na úrovni Vercel týmu: pokud
existují, nesmí do `begina-web` propadnout vlastnický `DATABASE_URL`.

## 6. DB oprávnění — role `begina_web` (návrh, nespouštět)

Spustí vedení jako vlastník DB, nejdřív na Neon branch, až po migracích
1–7 ze `ESHOP_SCHEMA_PROPOSAL.md`.

```sql
-- Roli vytvořit SQL příkazem, NE přes Neon Console: role z Console dostávají
-- členství v neon_superuser (široká práva). Před provedením ověřit v aktuální
-- dokumentaci Neon a zkontrolovat členství (dotaz níže).
CREATE ROLE begina_web WITH LOGIN PASSWORD '<silné generované heslo>';

GRANT USAGE ON SCHEMA public TO begina_web;
-- katalog: jen čtení
GRANT SELECT ON product_categories, products, product_variants, product_images TO begina_web;
-- objednávky: jen zakládat (ne číst, ne měnit, ne mazat)
GRANT INSERT ON orders, order_items, order_activity TO begina_web;
-- číslo objednávky ze sekvence
GRANT USAGE ON SEQUENCE order_number_seq TO begina_web;
-- nic dalšího: leads, lead_activity, organizations, organization_memberships,
-- company_*, invoices, notifications, referrals, user_*, neon_auth.* → bez přístupu
```

Důsledky pro kód webu:
- **Bez `INSERT … RETURNING`** (vyžaduje SELECT). Objednávka dostane UUID
  v aplikaci (jako dnešní `createOrder`) a číslo přes
  `SELECT nextval('order_number_seq')` před zápisem → potvrzení a e-mail
  mají číslo bez práva číst `orders`.
- Kontroly FK a CHECK omezení fungují i bez práv na odkazované tabulky.
- Web **nemůže číst objednávky** — ani vlastní. Stránka „Děkujeme“ ukazuje
  údaje z odeslaného formuláře (jako dnes). Pozdější „Moje objednávky“ pro
  přihlášené zákazníky = samostatné rozhodnutí (např. pohled/funkce
  omezená na `placed_by_user_id`).

Kontrola po vytvoření (jako vlastník):

```sql
-- nesmí být členem neon_superuser, pg_read_all_data, pg_write_all_data (0 řádků)
SELECT r.rolname FROM pg_auth_members m
JOIN pg_roles r ON r.oid = m.roleid
JOIN pg_roles u ON u.oid = m.member
WHERE u.rolname = 'begina_web';

-- přehled práv (jen tabulky z výčtu výše)
SELECT table_name, privilege_type FROM information_schema.role_table_grants
WHERE grantee = 'begina_web' ORDER BY table_name, privilege_type;
```

Kontrola jako `begina_web` (na `web-dev`): `SELECT … FROM products` projde;
`SELECT … FROM leads`, `… FROM orders`, `UPDATE orders …` → *permission
denied*.

## 7. Jak je zaručeno „bez výpadku“ a „beze změny kódu MojeBegina“

1. **Cesta `dashboard/` se nemění** → Root Directory na Vercelu se nemění.
2. **Nic se nenasazuje bez preview.** Každý PR se sestaví jako preview
   obou projektů dřív, než jde do `main`.
3. **Neúspěšný produkční build nic nevypne:** Vercel nechá běžet poslední
   úspěšné nasazení. Návrat = Instant Rollback na předchozí deployment.
4. **Fáze 1–5 nemění DB ani env proměnné** moje.begina.cz.
5. **Re-exporty** drží všechny dnešní importy MojeBegina beze změny;
   kontrola = shodný výpis rout, 220 testů MojeBegina, `drizzle-kit` bez rozdílu.
6. **E-shop nikdy nebyl v `main`** — jeho přesun do `web/` se MojeBegina
   v produkci nedotkne.

## 8. Rizika

| Riziko | Opatření |
|---|---|
| Vercel po přesunu lockfile nainstaluje závislosti jinak | Fáze 1 samostatně, preview před mergem, Instant Rollback |
| „Include files outside root“ vypnuté → build nevidí `packages/shared` | Fáze 0: ověřit/zapnout před fází 2 |
| Dvě kopie `drizzle-orm`/`react` ve workspace | Stejné verze ve všech `package.json`, kontrola `npm ls drizzle-orm react` |
| Dva lockfily → Next.js špatně určí kořen | Fáze 1 maže `dashboard/package-lock.json` |
| Web omylem s vlastnickým `DATABASE_URL` | Nepřipojovat Neon integraci k `begina-web`; ruční proměnné; kontrola dotazem v oddílu 6 |
| Preview webu zapisuje do produkční DB | Preview `DATABASE_URL` jen na větev `web-dev` |
| Dva katalogy (`catalog.ts` + DB) | Po fázi 6 `catalog.ts` odstranit |
| Build obou aplikací při každém pushi | Volitelný „Ignored Build Step“ (oddíl 4) |

## 9. Otevřené otázky pro vedení

1. **Kořenový `index.html`, `css/`, `js/`** (zástupná stránka z prvního
   commitu) — používá se někde (např. GitHub Pages)? Pokud ne, navrhuji ji
   ve fázi 1 odstranit; jinak zůstane beze změny.
2. **Kdo založí Vercel projekt `begina-web`** a má přístup k DNS domény
   begina.cz (kvůli dni spuštění)?
3. **Název složky:** `web/` (sourozenec `dashboard/`, doporučeno), nebo
   rovnou `apps/web`?

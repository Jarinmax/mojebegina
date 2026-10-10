# Domény: begina.cz = web a e-shop, moje.begina.cz = MojeBegina

Varianta A (rozhodnutí vedení 10. 10. 2026): **jeden Vercel projekt**,
rozlišení podle domény v `proxy.ts`.

| Doména | Co obslouží |
|---|---|
| `begina.cz` | veřejný web a e-shop — stránky z `app/eshop` **bez** prefixu `/eshop` (`/produkt/kulajda`, `/kosik`, `/objednavka/<id>`…) |
| `www.begina.cz` | jen 301 na `https://begina.cz` (cesta i parametry zůstanou) |
| `moje.begina.cz`, Preview, localhost | MojeBegina jako dosud; e-shop dál i na `/eshop/…` |

Kód: `lib/site/hosts.ts` (domény), `lib/site/routing.ts` (pravidla),
`lib/site/flags.ts` (přepínače), `lib/eshop/paths.ts` + `ShopLink` (odkazy
podle domény), `next.config.ts` (HSTS a hlavičky podle domény).

## Bezpečnost

- **begina.cz = výchozí zákaz.** Projde jen seznam stránek e-shopu, jeho
  statické soubory (`/eshop/*.jpg|webp…`, logo, favicon), `/_next/*`,
  `/robots.txt`, `/sitemap.xml`. Všechno ostatní je e-shopová 404 —
  přihlášení, administrace, `/api/auth`, Stripe webhook, stránky MojeBegina
  i jejich serverové akce. Hlídá `lib/site/__tests__/routing.test.ts` proti
  **všem** souborům v `app/` (nová stránka MojeBegina je automaticky 404 na
  begina.cz; nová stránka e-shopu musí být v seznamu, jinak test spadne).
- Přihlašovací cookies MojeBegina nemají nastavenou doménu → platí jen
  pro moje.begina.cz, begina.cz je nikdy nedostane (test).
- Proxy nečte přihlášení ani cookies; každá stránka a serverová akce
  MojeBegina si oprávnění ověřuje sama.
- Hlavičku domény (`x-begina-site`) proxy vždy přepíše — od klienta ji
  podvrhnout nejde.
- Stránka objednávky: náhodné id v adrese, žádné jméno, adresa ani
  e-mail; `Cache-Control: private, no-store` a `Referrer-Policy: no-referrer`
  (id neodchází dál). Přesměrování staré adresy vede jen na pevnou
  `https://begina.cz` se stejným id — nic nového nezpřístupní.
- HSTS: moje.begina.cz beze změny (2 roky + subdomény); begina.cz zatím
  **1 týden bez `includeSubDomains`** (jinak by vynutila HTTPS na všech
  subdoménách begina.cz — pošta, webmail). Prodloužit až po stabilním
  provozu a kontrole subdomén. `preload` nikde.

## Přepínače (Vercel → Environment Variables → jen Production)

**Výchozí stav = vypnuto.** Po sloučení se na moje.begina.cz nic nemění
(jen přibude `X-Robots-Tag: noindex` a `robots.txt` „Disallow: /“ —
MojeBegina se nemá indexovat nikdy).

| Proměnná | Hodnota | Kdy | Co udělá |
|---|---|---|---|
| `ESHOP_CANONICAL_ORIGIN` | přesně `https://begina.cz` (jiná hodnota se ignoruje) | **až po** přepnutí DNS a ověření, že begina.cz běží | `moje.begina.cz/eshop/…` → 301 na begina.cz (i staré odkazy na objednávky s parametry, jen GET — rozpracované odeslání pokladny doběhne); odkazy v e-mailech a návrat ze Stripe na begina.cz |
| `ESHOP_INDEXING` | `on` | po kontrole obsahu na begina.cz | begina.cz smí indexovat vyhledávač (robots.txt, meta, X-Robots-Tag); jinak všude noindex |
| `NEXT_PUBLIC_ESHOP_URL` | `https://begina.cz` | spolu s `ESHOP_CANONICAL_ORIGIN` | tlačítko „E-shop Begina.cz“ v Řízení firmy (`lib/eshopLink.ts`) |

Na Preview (`VERCEL_ENV=preview`) se `ESHOP_CANONICAL_ORIGIN` a
`ESHOP_INDEXING` ignorují.

## Staré adresy z WordPressu (begina.cz)

| Stará | Nová |
|---|---|
| `/produkt/<slug>/` | `/produkt/<slug>` (stejný slug; přejmenované v `LEGACY_PRODUCT_SLUGS`) |
| `/kategorie-produktu/<slug>/…` | `/kategorie/<slug>` (`LEGACY_CATEGORY_SLUGS`) |
| `/gdpr/` | `/ochrana-osobnich-udaju` |
| `/o-nas/`, `/o-vode/`, `/doprava/`, `/obchodni-podminky/`, `/kosik/`, `/pokladna/` | stejná adresa bez lomítka |
| `/obchod`, `/shop`, `/muj-ucet/…`, `/eshop` | `/` |
| `/eshop/<stránka e-shopu>` | `/<stránka>` |
| `/wp-admin`, `/wp-login.php`, `/wp-json`, `/xmlrpc.php`, `/feed`… | 410 |
| cokoli jiného | 404 (e-shopová) |

**Před dnem přepnutí:** export URL z WordPressu (sitemapa) → doplnit
`LEGACY_PRODUCT_SLUGS` / `LEGACY_CATEGORY_SLUGS` a případné další stránky.

## Postup přepnutí (pořadí je závazné)

1. Vercel → Domains: přidat `begina.cz` (Production) a `www.begina.cz`
   s přesměrováním 301 na `begina.cz`. DNS zatím beze změny.
2. D−1: TTL záznamů `begina.cz` (A) a `www` (CNAME) na 300 s; **zapsat
   původní hodnoty** (návrat). MX, SPF, `send`, `resend._domainkey` se
   **nemění**, jmenné servery se nepřesouvají.
3. Den D: vypnout pokladnu WooCommerce (číslování objednávek — samostatný
   postup, viz ESHOP_PRODUCTION_ROLLOUT.md C4–C5).
4. DNS: `begina.cz` A a `www` CNAME na hodnoty z Vercelu.
5. Kontrola (bez přepínačů): `https://begina.cz` a `https://www.begina.cz`
   (certifikát, 301), `/produkt/kulajda`, `/login` = 404,
   `https://moje.begina.cz/login` funguje, `/robots.txt` = Disallow.
6. Vercel: `ESHOP_CANONICAL_ORIGIN=https://begina.cz` +
   `NEXT_PUBLIC_ESHOP_URL=https://begina.cz` → Redeploy. Kontrola:
   `moje.begina.cz/eshop/objednavka/<id>` → begina.cz, kontrolní objednávka
   (odkaz v e-mailu na begina.cz).
7. Po kontrole obsahu: `ESHOP_INDEXING=on` → Redeploy → Search Console
   (ověření domény přes DNS TXT předem), odeslat sitemapu.

## Návrat při selhání

| Situace | Postup |
|---|---|
| Před krokem 4 | nic se neděje (moje.begina.cz beze změny) |
| Po kroku 4, problém s begina.cz | **nejdřív** smazat `ESHOP_CANONICAL_ORIGIN`, `NEXT_PUBLIC_ESHOP_URL` a `ESHOP_INDEXING` → Redeploy (odkazy a přesměrování zpět na moje.begina.cz/eshop), **pak** vrátit původní DNS záznamy; zapnout pokladnu WooCommerce |
| Chyba v kódu | Vercel → Instant Rollback na předchozí Production deployment |

Pořadí v návratu je důležité: se zapnutým `ESHOP_CANONICAL_ORIGIN` by
přesměrování a odkazy v e-mailech vedly na begina.cz, kde by po vrácení DNS
byl zase WordPress (stránka objednávky by tam neexistovala).

## Ověření

- Jednotkové testy: `lib/site/__tests__/*.test.ts`,
  `lib/eshop/__tests__/eshopPaths.test.ts`.
- Prohlížeč nad sestavenou aplikací (Chromium s begina.cz / www /
  moje.begina.cz namířenými na 127.0.0.1, testovací DB):
  `scripts/eshop-e2e/domeny.mjs` — režimy `vychozi`, `presmerovani`,
  `indexace` (návod v hlavičce souboru).

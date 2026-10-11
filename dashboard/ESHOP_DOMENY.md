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
| `ESHOP_MARKETING`, `ESHOP_COOKIEYES_ID`, `ESHOP_META_PIXEL_ID`, `ESHOP_META_CAPI_TOKEN` | viz `docs/begina-cutover/meta-cookieyes-ecomail.md` | spolu s přepnutím DNS | cookie lišta CookieYes + Meta Pixel jen se souhlasem; Purchase ze serveru až po zaplacení |
| `NEXT_PUBLIC_ESHOP_URL` | `https://begina.cz` | spolu s `ESHOP_CANONICAL_ORIGIN` | tlačítko „E-shop Begina.cz“ v Řízení firmy (`lib/eshopLink.ts`) |

Na Preview (`VERCEL_ENV=preview`) se `ESHOP_CANONICAL_ORIGIN` a
`ESHOP_INDEXING` ignorují.

## Staré adresy z WordPressu (begina.cz)

Audit 10. 10. 2026 (`scripts/begina-cutover/wp-audit.mts`, záznam
`docs/begina-cutover/audit-2026-10-10.md`): 63 adres ze sitemapy WordPressu.

| Stará | Nová |
|---|---|
| `/produkt/<slug>/` (25 produktů) | `/produkt/<slug>` — stejné slugy |
| `/kategorie-produktu/<slug>/` | `/kategorie/<slug>`; `alkoholicke-koktejly` → `koktejly` |
| `/gdpr/` | `/ochrana-osobnich-udaju` |
| `/o-nas/`, `/o-vode/`, `/doprava/`, `/obchodni-podminky/`, `/kosik/`, `/pokladna/` | stejná adresa bez lomítka |
| `/alkoholicke-koktejly/` | `/kategorie/koktejly` |
| `/kontakty/` | `/o-nas` (kontakt i v patičce) |
| `/obchod/`, `/obchod-s-beginami/`, `/beginy/`, `/napoje/`, `/kategorie/`, `/baleni/…`, `/muj-ucet/…`, `/eshop` | `/` |
| `/landing-page/` (Begina club, přihlášení k e-mailům), `/partnersky-program/`, `/pro-podniky-gastro/`, `/begina-english/`, `/begina-deutsch/` (dnes prázdné) | `/` |
| `/ahoj-vsichni/`, `/zkusebni-stranka/`, `/uvod-jarek/`, `/author/…`, `/category/…`, `/wp-admin`, `/wp-login.php`, `/wp-json`, `/xmlrpc.php`, `/feed`… | 410 |
| **`/produkt/cervankove-nebe/`, `/produkt/dum-u-jezera/`, `/produkt/malinovy-svarak-nealko/`** | dokud jsou skryté: **307 → `/kategorie/ovocne-napoje`** („Připravujeme“; `lib/eshop/legacyProducts.ts`); po zveřejnění (skript 73) stránka produktu na stejné adrese |
| cokoli jiného | 404 (e-shopová) |

Koncové lomítko (`/produkt/kulajda/`) odstraní už Next.js přesměrováním
**308** (trvalé, pro vyhledávače jako 301) na tutéž doménu, ještě před
`proxy.ts`; teprve pak platí tabulka. Na `www.begina.cz` tedy
`/produkt/x/` → 308 `/produkt/x` → 301 `https://begina.cz/produkt/x`.
Ověřeno v prohlížeči pro všech 28 produktů (`scripts/eshop-e2e/marketing.mjs`).

Dnešní web: hlavní adresa je **www.begina.cz** (begina.cz → 301 www),
**bez HSTS**, server openresty. Nový web obrátí směr (www → begina.cz);
žádná dřívější HSTS politika v prohlížečích není, takže 1 týden bez
subdomén je bezpečný začátek. Na webu běží Meta Pixel, cookie lišta
(CookieYes), Ecomail a WooPayments; Google Analytics ani ověření Search
Console v HTML nejsou. Co z toho zachovat:
`docs/begina-cutover/meta-cookieyes-ecomail.md`.

## Postup přepnutí (pořadí je závazné)

1. Vercel → Domains: přidat `begina.cz` (Production) a `www.begina.cz`
   s přesměrováním 301 na `begina.cz`. DNS zatím beze změny.
2. D−1: TTL záznamů `begina.cz` (A) a `www` (CNAME) na 300 s; **zapsat
   původní hodnoty** (návrat). MX, SPF, `send`, `resend._domainkey` se
   **nemění**, jmenné servery se nepřesouvají.
3. Den D: vypnout pokladnu WooCommerce. Číslování objednávek (vlastní
   řada 70000001+, `ESHOP_CISLOVANI_PRECHOD.md`) na WooCommerce nezávisí —
   zapnout kdykoli předem.
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

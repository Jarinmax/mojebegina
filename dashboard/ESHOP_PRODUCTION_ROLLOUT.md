# ESHOP 1.0 — plán nasazení do Production

Stav (2. 10. 2026): **připraveno, nic nespuštěno.** Bez výslovného souhlasu
vedení se nic nemerguje do `main`, nespouští se SQL na Production DB ani
Production deployment. Claude má k Neonu jen read-only přístup — SQL spouští
vedení ručně, Claude ověřuje čtením.

Produkční SQL: `docs/eshop-production/` (testované nad daty jako
v Production: `lib/eshop/__tests__/productionSql.test.ts`).

## Výchozí stav (ověřeno read-only 2. 10. 2026)

| | Production | Preview (`br-curly-base-b2blmhjg`) |
|---|---|---|
| Kód | `main` @ `7663c67` | `claude/great-bell-ffjwo3` (obsahuje celý `main`) |
| Migrace | 0000–0012 | 0000–0019 + číslování (řada 900001+) |
| Tabulek | 20 | 24 |
| Objednávky | 2 (The Cup, import), 5 položek, 0 historie | testovací |

## Co se do Production dostane

Jeden PR `claude/great-bell-ffjwo3` → `main` (všechny commity z
`git log main..claude/great-bell-ffjwo3`, včetně 3 merge commitů z `main`). Obsah:

- **E-shop** `/eshop` (katalog z DB, detail, košík, pokladna, stránka
  objednávky s QR) — `app/eshop`, `components/eshop`, `lib/eshop`, `public/eshop`.
- **Platby:** Stripe Checkout + webhook `/api/eshop/stripe/webhook`; převod
  s QR Platbou; číslování objednávek.
- **E-maily** přes Resend (potvrzení, interní upozornění, platba přijata).
- **MojeBegina:** objednávky bez organizace, e-shopové údaje v detailu,
  historie (E-shop / Stripe / e-maily), „Po splatnosti“, e-mail po ručním
  Zaplaceno, tlačítko „E-shop Begina.cz“ v Řízení firmy.
- **Schéma:** migrace 0013–0019 (jen přidávají; existující data mění jen
  `channel = 'import'` u 2 objednávek The Cup).
- **Závislosti:** `next` 16.3.6 (oprava kritické zranitelnosti), `qrcode`.

## Pojistky (vše výchozí VYPNUTO v Production)

| Funkce | Zapne až | Pojistka v kódu |
|---|---|---|
| **Viditelnost `/eshop`** | `ESHOP_PUBLIC=on` | do té doby celý `/eshop` = 404, žádný dotaz do DB, pokladna nic nezpracuje, tlačítko v Řízení firmy schované (`lib/eshop/storeMode.ts`) |
| Ukládání objednávek | `ESHOP_ORDER_WRITE=on` | `lib/eshop/orderWrite.ts` |
| Karta (Stripe) | `ESHOP_STRIPE_LIVE=on` + **ostrý** klíč `sk_live_`/`rk_live_` | testovací klíč v Production se nepoužije |
| E-maily | `ESHOP_EMAIL_LIVE=on` | v Production se `ESHOP_EMAIL_TEST_RECIPIENTS` ignoruje → žádné [TEST], žádné přesměrování |
| Pruh „Náhled e-shopu“ | zmizí s `ESHOP_ORDER_WRITE=on` | `lib/eshop/storeMode.ts` |
| Číslování | SQL `21_numbering_cutover.sql` | start řady 1000–899999 (900000+ je Preview) |

Preview naopak zůstává vždy testovací (testovací Stripe klíč, e-maily jen
na testovací adresy), i kdyby tam někdo nastavil `*_LIVE=on`. Hlídá
`lib/eshop/__tests__/productionGuards.test.ts`.

**Po sloučení do `main` zůstane `moje.begina.cz/eshop` skrytý (404)**, dokud
se nenastaví `ESHOP_PUBLIC=on` (rozhodnutí vedení 2. 10. 2026). Preview je
dostupné vždy. Ověřeno na sestavené aplikaci: Production bez přepínače 404
(i webhook), s přepínačem 200; MojeBegina beze změny.

## Číslování — produkční start řady

**Doporučení:** START = nejvyšší číslo objednávky z WooCommerce v den
přepnutí, **zaokrouhlené nahoru na celou stovku** (Woo 5137 → START 5200 →
první nová objednávka 5201).

- S WooCommerce kolidovat nemůže: pokladna Woo je předem vypnutá, rezerva
  pohltí i objednávky vzniklé po odečtení maxima, `UNIQUE` index
  a pojistka ve skriptu („už existuje číslo ≥ START“).
- S Preview kolidovat nemůže: jiná databáze a skript odmítne START
  ≥ 900000 (i < 1000).
- Případný pozdější import historie z Woo s původními čísly (≤ maximum)
  se s novou řadou nepotká.
- Alternativa podle rozhodnutí 26. 9.: START = přesně maximum Woo (plynulá
  řada bez mezery) — skript funguje stejně.

## Postup (pořadí je závazné)

### Fáze A — databáze (kdykoli předem, e-shop zůstává vypnutý)

1. Neon → SQL Editor → **větev production (`main`)**, DB `neondb`.
2. `10_before_migrations.sql` → očekáváno
   `20 | 0 | 23 | 0 | 0 | 2 | 5 | 0 | 2 | 0 | 2`. Jinak STOP.
3. `11_migrations_0013_0019.sql` — **celý soubor najednou** (jedna
   transakce: chyba = nic se nezmění).
4. `12_after_migrations.sql` → očekáváno
   `24 | 4 | 5 | 7 | 11 | 4 | 2 | 2 | 0 | 5 | 0 | 0 | YES | 0`.
5. Claude ověří read-only (otisky dat The Cup, katalog).
6. **Katalog — Bylinné sirupy** (`docs/eshop-catalog/`): `30_sirupy_before.sql`
   → `1 | 0 | 0 | 0 | 0 | 7 | 11` → `31_sirupy.sql` (celý soubor) →
   `32_sirupy_after.sql` → `3 | 7 | 7 | 14 | 7 | 7 | 3 | 4 | 14 | 25`.
   Vrácení: `39_sirupy_rollback.sql` (sirupy skryje, nic nemaže). Na Preview
   se spouští nejdřív.
7. **Katalog — Čerstvé polévky** (`docs/eshop-catalog/`): `40_polevky_before.sql`
   → `3 | 0 | Krémová polévka z dýně. | (bez názvu) | 379 | 0` → `41_polevky.sql`
   (celý soubor) → `42_polevky_after.sql` →
   `4 | 1 | ano | 3 l Rodinná zásoba (bag-in-box) | 379 | 12 | 1 | 1 | 379 Kč, 12 porcí`.
   Vrácení: `49_polevky_rollback.sql` (stav z migrace 0014).

Dnešní `main` kód nové sloupce ignoruje — MojeBegina v Production běží dál.
Migrace MUSÍ proběhnout **před** sloučením kódu (nový kód je čte; bez nich
by spadly Objednávky — stejně jako 28. 9. na Preview).

### Fáze B — kód (po souhlasu vedení)

1. PR `claude/great-bell-ffjwo3` → `main` (vytvoří Claude na pokyn),
   kontrola, sloučení = Vercel nasadí Production.
2. Smoke test Production: MojeBegina (přihlášení, Objednávky, detail The Cup,
   CRM, Denní volání, CEO přehled), v Řízení firmy NENÍ tlačítko
   „E-shop Begina.cz“, `/eshop` a `/api/eshop/stripe/webhook` vrací 404.

### Fáze C — den přepnutí z WooCommerce

1. **Stripe (ostrý účet ověřený):** Developers → API keys → restricted key
   „MojeBegina Production“ (*Checkout Sessions: Write*) → `rk_live_…`;
   Webhooks → endpoint `https://moje.begina.cz/api/eshop/stripe/webhook`,
   události `checkout.session.completed`, `…async_payment_succeeded`,
   `…async_payment_failed`, `…expired` → signing secret `whsec_…`.
2. **Resend:** API Keys → nový klíč „MojeBegina Production“ (Sending access,
   doména `begina.cz`). Doména už je Verified.
3. **Vercel → Environment Variables → jen Production** (zatím BEZ přepínačů
   `*=on`): viz tabulka níže → Redeploy → stále „Náhled“.
4. **WooCommerce:** vypnout pokladnu (režim údržby), počkat na rozběhnuté
   platby, zjistit nejvyšší číslo objednávky (které vidí zákazník v e-mailu).
5. **Neon (production):** `20_numbering_before.sql` → `0 | 1 | 0 | 2 | 0 | 0 | 0`
   (rucni > 0 je v pořádku) → v `21_numbering_cutover.sql` doplnit START →
   spustit → `22_numbering_after.sql` → `1 | 1 | 1 | 2 | 0 | START | START+1`.
6. **Vercel:** `ESHOP_PUBLIC=on`, `ESHOP_ORDER_WRITE=on`,
   `ESHOP_EMAIL_LIVE=on`, `ESHOP_STRIPE_LIVE=on` (všechny čtyři najednou)
   → Redeploy.
7. **Kontrolní objednávky** (vlastní e-mail): převod (číslo START+1, QR
   naskenovat bez odeslání, e-mail + interní e-mail bez [TEST]) → ruční
   Zaplaceno → „Platbu jsme přijali“; karta malou částkou → „je zaplacená“
   → vrátit ve Stripe. Claude ověří read-only.
8. Přesměrování z begina.cz / zapnutí indexace — až po rozhodnutí o doméně.

### Vercel — proměnné pro Production

| Proměnná | Hodnota | Kdy |
|---|---|---|
| `ESHOP_BANK_ACCOUNT` | tuzemské číslo účtu | C3 |
| `ESHOP_BANK_IBAN` | IBAN téhož účtu | C3 |
| `RESEND_API_KEY` | produkční `re_…` | C3 |
| `ESHOP_EMAIL_FROM` | `Begina <objednavky@begina.cz>` | C3 |
| `ESHOP_EMAIL_INTERNAL_TO` | Jaroslav + Lucie | C3 |
| `ESHOP_EMAIL_REPLY_TO` | volitelně | C3 |
| `STRIPE_SECRET_KEY` | `rk_live_…` / `sk_live_…` | C3 |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` ostrého endpointu | C3 |
| `ESHOP_PUBLIC` / `ESHOP_ORDER_WRITE` / `ESHOP_EMAIL_LIVE` / `ESHOP_STRIPE_LIVE` | `on` | C6 |
| `ESHOP_EMAIL_TEST_RECIPIENTS` | **nenastavovat** (v Production se ignoruje) | — |

U každé zaškrtnout **jen Production**. Preview proměnné nechat jen na Preview.

## Rollback

| Situace | Postup | Data |
|---|---|---|
| Problém po C6 (objednávky, platby, e-maily) | Vercel: `ESHOP_PUBLIC` a tři přepínače vypnout (nebo smazat) → Redeploy (e-shop zase 404); WooCommerce pokladnu znovu zapnout | objednávky v DB zůstanou |
| Problém s kódem po B1 | Vercel → Deployments → předchozí Production → **Instant Rollback**; případně revert PR | DB beze změny |
| Číslování (jen pokud zákazník ještě nedostal číslo) | e-shop vypnout → `29_numbering_rollback.sql` | přidělená čísla zůstanou |
| Migrace (jen před spuštěním e-shopu) | starý kód (Instant Rollback) → `19_migrations_rollback.sql` | selže a nic nezmění, existují-li e-shopová data |

## Co ještě blokuje ostrý provoz (mimo kód)

1. Obchodní podmínky, reklamační řád, GDPR (v patičce „texty doplníme“).
2. Údaje o produktech (složení, alergeny, výživové hodnoty — povinné před
   prodejem potravin), ceny dopravy (dnes orientačně 99 Kč).
3. Ostrý Stripe účet ověřený (IČO, totožnost, účet, popis vč. alkoholu).
4. Rozhodnutí o doméně (e-shop na `moje.begina.cz/eshop`, nebo `begina.cz`)
   a přesměrování z WordPressu; pak zrušit `noindex`.
5. Prodej alkoholu: ověření věku při předání, oprávnění.

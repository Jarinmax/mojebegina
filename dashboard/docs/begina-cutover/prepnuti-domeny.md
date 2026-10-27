# Přepnutí begina.cz na nový e-shop — kontrolní seznam

Rozhodnutí 16. 10. 2026: doménu připravit hned, **DNS přepnout až po
aktivaci Stripe a úspěšné ostré platbě**. Pravidla a návrat: `ESHOP_DOMENY.md`.
Kód domén je v `main` od PR #17 (`lib/site/*`, testy 124/124 OK 16. 10.).

## Fáze 1 — příprava bez výpadku (teď)

| # | Krok | Kdo | Stav |
|---|---|---|---|
| 1 | Vercel → mojebegina → Settings → Domains: přidat `begina.cz` (Production) a `www.begina.cz` → 301 na `begina.cz`. Vercel ukáže „Invalid Configuration“ — správně, DNS se zatím nemění. | majitel | |
| 2 | Opsat z Vercelu požadované hodnoty: A záznam pro `begina.cz`, CNAME pro `www` (případně TXT pro ověření vlastnictví). | majitel → Claude | |
| 3 | U správce DNS: snímek celé zóny `begina.cz` (původní hodnoty A, CNAME `www`, MX, TXT/SPF, `_dmarc`, `send`, `resend._domainkey`, `moje`). Uložit pro návrat. | majitel | |
| 4 | TTL záznamů `@` a `www` (A i AAAA, dnes 3600 s) snížit na 300 s — nejpozději den před přepnutím. Nic jiného neměnit. | majitel | |

**Nikdy neměnit:** MX, SPF/TXT kořene, `_dmarc`, `send`, `resend._domainkey`,
záznam `moje` (MojeBegina), jmenné servery.

## Fáze 2 — podmínky před přepnutím

- [ ] Stripe účet begina.cz „Enabled“ (platby i výplaty).
- [ ] Ostrý klíč + webhook `https://moje.begina.cz/api/eshop/stripe/webhook`
      ve Vercelu (jen Production); Stripe větev sloučena se souhlasem.
- [ ] `ESHOP_STRIPE_LIVE=on` → jedna malá ostrá platba kartou → vrácení ve
      Stripe → v MojeBegina zaplaceno, e-mail jednou.
- [ ] Obsah: produkty k prodeji, obchodní podmínky, doprava.

Starý WooCommerce (přístup k administraci, nevyřízené objednávky, platby
WooPayments): **`stary-woocommerce.md`** — archiv a přístup připravit PŘED
fází 3.

## Fáze 3 — den přepnutí (pořadí závazné)

1. WooCommerce: vypnout pokladnu (údržba), nechat doběhnout platby.
2. DNS (Active24 → Domény → begina.cz → DNS nastavení):
   - **nejdřív vypnout automatiku „Active24 Web“** (spravuje A, AAAA, ANAME,
     CNAME pro begina.cz — jinak může ruční záznamy přepsat zpět na hosting).
     **„Active24 Mail“ NECHAT zapnutou** (MX, TXT — e-maily).
   - `@` A a `www` CNAME na hodnoty z Vercelu (bod 2),
   - **smazat AAAA (IPv6) u `@` i `www`** — jinak návštěvníci s IPv6 skončí
     dál na starém WordPressu,
   - wildcard `*.begina.cz` nechat beze změny; `stary.begina.cz` má vlastní
     záznamy (`stary-woocommerce.md`).
   - Záloha zóny před přepnutím: Active24 → DNS → **Export BIND souboru**.
     Návrat = obnovit `@`/`www` A `37.9.175.164` + AAAA `2a00:4b40:aaaa:2005::5`
     a znovu zapnout „Active24 Web“.
3. Kontrola (do ~15 min): `https://begina.cz` (certifikát), `https://www.begina.cz`
   → 301, `/produkt/kulajda`, staré `/produkt/kulajda/` → nová adresa,
   `/login` = 404, `https://moje.begina.cz/login` funguje, `/robots.txt` = Disallow,
   e-mail na @begina.cz dál chodí.
4. Vercel: `ESHOP_CANONICAL_ORIGIN=https://begina.cz`,
   `NEXT_PUBLIC_ESHOP_URL=https://begina.cz` → Redeploy → kontrolní
   objednávka (odkazy v e-mailu na begina.cz; návrat ze Stripe na begina.cz).
5. Po kontrole obsahu: `ESHOP_INDEXING=on` → Redeploy → Search Console
   (TXT ověření předem) → sitemapa.

## Návrat

1. Smazat `ESHOP_CANONICAL_ORIGIN`, `NEXT_PUBLIC_ESHOP_URL`, `ESHOP_INDEXING` → Redeploy.
2. Vrátit původní DNS ze snímku (bod 3).
3. Zapnout pokladnu WooCommerce.

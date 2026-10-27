# Starý WooCommerce po přepnutí begina.cz — zachování přístupu a historie

Stav 26. 10. 2026 (jen čtení): `begina.cz` i `www.begina.cz` → `37.9.175.164`
— webhosting **Active24, tarif Smart** (admin.active24.cz, účet `egeenvz1`,
hosting `begina_cz`, platný do 19. 9. 2027; domény na hostingu 1 ze 3; na
Active24 jsou i 4 e-mailové účty → MX se nemění). WordPress má adresu webu
`https://www.begina.cz`, běží WooCommerce, **WooPayments** a **Jetpack**
(`payments/woopay`, `jetpack/v4` ve `/wp-json/`).

**Nic z tohoto dokumentu se zatím neprovádí.** DNS se nemění a WooCommerce
se nevypíná. Každý krok až na výslovný souhlas majitele.

## Proč to řešit před přepnutím

Po změně DNS `@` a `www` na Vercel:

1. `begina.cz/wp-admin` vrací na novém webu **410** (`lib/site/routing.ts`),
   takže do administrace WooCommerce se běžnou adresou nedostanete.
2. Hosting přestane obnovovat **SSL certifikát** pro `begina.cz`
   (ověření Let's Encrypt půjde na Vercel). Starý certifikát vyprší
   nejpozději za ~90 dní.
3. **WooPayments a Jetpack** jsou svázané s adresou webu `www.begina.cz`.
   Vratky a spory (chargebacky) starých plateb jdou jen přes administraci
   WooCommerce. WooPayments nemá samostatný přístup do Stripe. Platby kartou
   ve WooCommerce lze rozporovat ještě **až ~120 dní** po zaplacení.

## Doporučené řešení (3 vrstvy)

### A. Archiv před přepnutím (nezávislý na hostingu)

| # | Co | Kde | Výstup |
|---|---|---|---|
| A1 | Úplná záloha webu: soubory + databáze | administrace hostingu (záloha) nebo FTP + phpMyAdmin | `.zip` + `.sql`, uložit mimo hosting |
| A2 | Všechny objednávky | WooCommerce → Analytics → Objednávky → období „od začátku“ → Stáhnout | CSV |
| A3 | Zákazníci | WooCommerce → Zákazníci → Stáhnout | CSV |
| A4 | Platby, výplaty, spory | Platby (WooPayments) → Transakce / Výplaty / Spory → Stáhnout, celé období | 3× CSV |
| A5 | Nevyřízené objednávky | WooCommerce → Objednávky, stavy *Zpracovává se*, *Čeká na platbu*, *Pozastaveno* | seznam čísel |

Nevyřízené objednávky (A5) se před přepnutím **vyřídí ve WooCommerce** (do
konce), nebo se převezmou do MojeBegina stejně jako #5215 (import skriptem,
`docs/eshop-production/FOOD_FEST_5215.md`).

### B. Přístup do administrace po přepnutí

**B1 — dlouhodobě: `stary.begina.cz` (doporučeno)**

Před dnem D (hosting + jeden NOVÝ DNS záznam, `@`/`www`/MX beze změny):
1. Active24 → Hostingy → `begina_cz` → Přiřazené domény → **Přidat** →
   `stary.begina.cz` jako **web** (stejný adresář jako `begina.cz`, ne
   přesměrování). Volné jsou 2 ze 3 domén tarifu.
2. DNS: wildcard `*.begina.cz` míří na **jiný** server (`37.9.175.163` /
   `2a00:4b40:aaaa:2005::6`), ne na web (`.164`). `stary.begina.cz` proto
   potřebuje vlastní záznamy — buď je založí Active24 při kroku 1 (automatika
   „Active24 Web“; ověřit v DNS), nebo ručně: `stary` A `37.9.175.164`
   a `stary` AAAA `2a00:4b40:aaaa:2005::5`. Ostatní záznamy beze změny;
   každá změna DNS jen se souhlasem.
3. Active24: certifikát Let's Encrypt pro `stary.begina.cz` (až záznam
   z kroku 2 funguje).
4. **Žádné heslo (Basic Auth) na celý web:** WooPayments a Jetpack posílají
   oznámení (spory, vratky, výplaty) na adresu webu (`/wp-json/…`), heslo by
   je zablokovalo. Ochrana: administrace má vlastní přihlášení WordPressu,
   pro veřejnost režim údržby/katalogu (krok C) + `noindex`
   (Nastavení → Zobrazení pro vyhledávače).

V den D, hned po přepnutí `@`/`www`:
5. `wp-config.php` (Active24 → správce souborů / FTP): `define('WP_HOME', 'https://stary.begina.cz');`
   `define('WP_SITEURL', 'https://stary.begina.cz');`
6. Jetpack ukáže „Safe Mode / změna adresy webu“ → zvolit **„Move your
   settings“ / přesunout připojení** (ne „Create fresh connection“). Tím
   zůstane WooPayments připojený ke stejnému účtu.
7. Ověřit: přihlášení do `stary.begina.cz/wp-admin`, Platby → Transakce
   (stejný seznam jako před přepnutím), Objednávky.

**B0 — nouzově, bez jakékoli změny: soubor hosts**

Na počítači, odkud se spravuje (Mac: `/etc/hosts`, jen dočasně):
```
37.9.175.164  begina.cz www.begina.cz
```
Prohlížeč pak na `www.begina.cz` otevře starý WordPress (adresa webu se
nemění, takže Jetpack/WooPayments se nerozbije). Funguje, dokud platí starý
certifikát. Po skončení řádek smazat, jinak tento počítač neuvidí nový web.

### C. Žádné nové objednávky, ale nic nevypínat

- Den D (fáze 3, krok 1): pokladna WooCommerce do režimu údržby/katalogu,
  takže nové objednávky už nevzniknou.
- WooCommerce, WooPayments ani Jetpack **neodinstalovávat** aspoň 120 dní:
  vratky, spory a výplaty starých plateb.
- E-maily WooPayments o sporech chodí dál na e-mail účtu, sledovat je.

## Co je potřeba od hostingu a od vás

| # | Údaj / přístup | Stav |
|---|---|---|
| H1 | Hosting a přístup do administrace | ✅ Active24 (admin.active24.cz), účet `egeenvz1` (Jaroslav Viner) |
| H2 | Kdo spravuje DNS zónu `begina.cz` | ✅ Active24 (automatiky „Active24 Web“ a „Active24 Mail“ zapnuté). Web: `@`/`www` A `37.9.175.164`, AAAA `2a00:4b40:aaaa:2005::5`, TTL 3600. Wildcard `*` → `.163`/`::6` (jiný server). Pošta: MX `mx10`/`mx20.active24.cz`, SPF, DKIM `mail._domainkey`, `ecomail._domainkey`, `mailin1/2`, `mail`/`webmail`/`smtp`/`pop3`. **Záloha zóny: DNS → Export BIND souboru** (úplné hodnoty) — doplnit |
| H3 | Alias/subdoména ke stávajícímu webu + Let's Encrypt | ✅ tarif má 3 domény (1 použitá); certifikát ověřit v nastavení domény na hostingu |
| H5 | Přístup k souborům webu (správce souborů / FTP) | ❓ Active24 → hosting → Soubory / FTP |
| H6 | Záloha / export databáze | ❓ Active24 → hosting → Zálohy / Databáze (phpMyAdmin) |
| H7 | Do kdy platí certifikát `begina.cz` na hostingu | ❓ detail domény na hostingu (SSL) |
| W1 | Administrátorský účet WordPressu | ✅ máte |

Hesla a klíče se do chatu neposílají. Stačí odpovědět, zda a kdo přístup má.

## Pořadí (návrh)

1. **Teď:** A1–A5 (záloha a exporty, nic se tím nemění).
2. Doplnit H2, H5–H7 v administraci Active24.
3. Před dnem D, po souhlasu: B1 kroky 1–4 (alias, DNS záznam `stary`,
   certifikát, noindex).
4. Den D (`prepnuti-domeny.md`, fáze 3): pokladna Woo do údržby → DNS `@`/`www`
   → B1 kroky 5–7 → kontrola.
5. Po 120 dnech: zvážit vypnutí starého webu (export znovu, pak rozhodnutí).

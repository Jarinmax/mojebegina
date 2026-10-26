# Starý WooCommerce po přepnutí begina.cz — zachování přístupu a historie

Stav 26. 10. 2026 (jen čtení): `begina.cz` i `www.begina.cz` → `37.9.175.164`
(webhosting, server „openresty“). WordPress má adresu webu
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
1. Hosting: přidat `stary.begina.cz` jako alias stejného webhostingu
   a vystavit pro něj certifikát (Let's Encrypt).
2. DNS: nový záznam `stary` A `37.9.175.164` (ostatní záznamy beze změny).
3. Hosting: heslo (HTTP Basic Auth) na celou `stary.begina.cz` + `noindex`.
   Je to jen pro Beginu, ne pro zákazníky.

V den D, hned po přepnutí `@`/`www`:
4. `wp-config.php`: `define('WP_HOME', 'https://stary.begina.cz');`
   `define('WP_SITEURL', 'https://stary.begina.cz');`
5. Jetpack ukáže „Safe Mode / změna adresy webu“ → zvolit **„Move your
   settings“ / přesunout připojení** (ne „Create fresh connection“). Tím
   zůstane WooPayments připojený ke stejnému účtu.
6. Ověřit: přihlášení do `stary.begina.cz/wp-admin`, Platby → Transakce
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

| # | Údaj / přístup | Proč |
|---|---|---|
| H1 | Název hostingové firmy a kdo má přístup do její administrace | IP `37.9.175.164` neprozradí poskytovatele (bez reverzního záznamu) |
| H2 | Kdo spravuje DNS zónu `begina.cz` (stejná firma?) | záznam `stary` (B1) a pozdější přepnutí `@`/`www` |
| H3 | Umí hosting alias/subdoménu ke stávajícímu webu + Let's Encrypt? | B1 kroky 1–2 |
| H4 | Umí hosting heslo na doménu/adresář (Basic Auth)? | B1 krok 3 |
| H5 | Přístup k souborům webu (správce souborů / FTP / SSH) | `wp-config.php` (B1 krok 4) |
| H6 | Záloha / export databáze (phpMyAdmin nebo záloha z administrace) | A1 |
| H7 | Do kdy platí současný certifikát `begina.cz` na hostingu | jak dlouho funguje B0 |
| W1 | Administrátorský účet WordPressu (máte) | A2–A5, B1 krok 5 |

Hesla a klíče se do chatu neposílají. Stačí odpovědět, zda a kdo přístup má.

## Pořadí (návrh)

1. **Teď:** A1–A5 (záloha a exporty, nic se tím nemění).
2. Zjistit H1–H7 u hostingu.
3. Před dnem D, po souhlasu: B1 kroky 1–3 (alias, certifikát, heslo, nový
   DNS záznam `stary`).
4. Den D (`prepnuti-domeny.md`, fáze 3): pokladna Woo do údržby → DNS `@`/`www`
   → B1 kroky 4–6 → kontrola.
5. Po 120 dnech: zvážit vypnutí starého webu (export znovu, pak rozhodnutí).

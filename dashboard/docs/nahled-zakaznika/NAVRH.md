# Náhled zákaznické karty („očima zákazníka“) — úzké oprávnění `customer_card_preview`

Stav: **kód připravený, migrace 0023 PŘIPRAVENÁ a NESPUŠTĚNÁ** (ani v Preview,
ani v Production). Bez migrace náhled bezpečně selže: tlačítko se nikomu
neukáže a adresa vrací 404. Návrh 19. 10. 2026.

## Kdo smí

Jen uživatelé s **aktivním udělením** `customer_card_preview`:

- žádná role samotná nestačí, ani ADMIN, EXECUTIVE nebo EMPLOYEE;
- udělení je vázané na `user_id`, ne na jméno ani e-mail;
- uživatel přepnutý do role CUSTOMER náhled nevidí, i když udělení má.

Udělit se má přesně 4 členům vedení. Účty jsou ověřené pouze čtením
z Preview kopie Production (stav cca 14. 10.); před spuštěním
v Production je `10_before.sql` vypíše znovu ke kontrole.

| Člen vedení         | user_id                                | Role                 |
| ------------------- | -------------------------------------- | -------------------- |
| Jaroslav Viner      | `de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c` | ADMIN                |
| Lucie Königsbergová | `f9f93f03-92b0-4724-becd-c0a3576b5275` | EXECUTIVE + CUSTOMER |
| Jiří Střelec        | `fdc7b836-2325-4568-b9b7-5ac579cd8972` | EXECUTIVE + CUSTOMER |
| Jaroslav Blahout    | `06240ac4-c050-47ea-998c-6c81389edf9f` | EXECUTIVE + CUSTOMER |

Ostatní ADMIN a EXECUTIVE účty, zaměstnanci, zákazníci i nepřihlášení
dostanou **404**. Tlačítko „Náhled očima zákazníka“ se jim nevykreslí.

## Cesta a tlačítka

`/nahled-zakaznika/<id>?zpet=admin|executive|crm&zobrazeni=prehled|objednavky|profil`

Tlačítko (`components/customer-portal/CustomerPreviewButton.tsx`) se
vykreslí jen držiteli oprávnění, a to na stránkách:

- `/admin/organizace/<id>`;
- `/executive/organizace/<id>`;
- `/rizeni-firmy/obchod/zakaznici/<id>`.

„Zpět“ vede jen na jednu z těchto tří pevných cest
(`lib/customerPreviewLinks.ts`), nikdy na adresu z URL.

## Bezpečnost

- **Kontrola ve dvou vrstvách, vždy dřív, než se cokoli načte:**
  1. stránka (`canPreviewCustomerCards`);
  2. datová vrstva (`getCustomerPortalPreview` → `requireCustomerCardPreview`).

  Když se oprávnění nedá přečíst (chyba DB nebo chybějící tabulka), platí
  „bez oprávnění“. Id z URL samo nic neotevře.

- **Žádná impersonace:**
  - session zůstává;
  - žádná cookie, zákaznický token ani heslo;
  - zákazník nedostane žádné oznámení a nic nevidí.
- **Karta je `inert`:**
  - odkazy, tlačítka a formuláře nejdou použít ani zaměřit;
  - „Odhlásit se“ je nahrazené neaktivní kopií;
  - aktivní je jen pruh náhledu: přepínání pohledů a „Zpět“.

  Zákaznická část dnes nemá žádnou zápisovou akci, která by v náhledu byla.

- **noindex** (metadata + `X-Robots-Tag`) a `Cache-Control: private, no-store`
  (`next.config.ts`, `/nahled-zakaznika/:path*`).

## Trvalý audit

Každé otevření zapíše řádek do `customer_card_preview_log` se čtyřmi
sloupci: `id`, `viewer_user_id` (kdo), `organization_id` (která
organizace), `opened_at` (kdy). Nic dalšího se neukládá.

- **Bez zápisu se náhled neotevře** (fail closed).
- Audit nemění zákazníka, objednávky ani historii (ověřeno testem: snímek
  dat před a po je stejný).
- Zákaznická část tabulku nečte.

## Stejná karta

Zákaznické stránky (`/`, `/objednavky`, `/profil`) i náhled kreslí stejné
sdílené komponenty (`components/customer-portal/*`) ze stejných funkcí
(`loadCustomerAccount`, `loadCustomerOrders`). Test ověřuje, že HTML karty je
znak po znaku stejné jako u přihlášeného zákazníka (kromě neaktivního
„Odhlásit se“).

## Migrace 0023 (jen přidává)

- **`user_permissions`:**
  - kdo, jaké oprávnění, kdo a kdy udělil, důvod, kdo a kdy odebral;
  - nejvýš jedno aktivní udělení na uživatele a oprávnění (částečný unikátní
    index);
  - povolené oprávnění je zatím jen `customer_card_preview`;
  - odebrání vždy s autorem.
- **`customer_card_preview_log`:** audit otevření (viz výše).
- **Skripty** (`docs/nahled-zakaznika/`):
  - `10_before.sql`: jen čtení; očekáváno `0 | 4 | 4` + výpis 4 jmen ke kontrole;
  - `11_migration.sql`: chráněný, drizzle 0023; podruhé se zastaví „už existuje“;
  - `12_after.sql`: očekáváno `2 | 3 | 0 | 0`;
  - `19_rollback.sql`: zastaví se, pokud audit už obsahuje záznamy;
  - `20_udelit.sql`: udělí 4 členům podle `user_id`. Zastaví se, když účet
    neexistuje nebo nemá roli ADMIN/EXECUTIVE. Opakované spuštění nic nezdvojí;
  - `29_odebrat.sql`: odebere jednomu `user_id`. Platí okamžitě, historie zůstává.
- **Ověřeno nad PGlite** (`customerCardPreviewScripts.test.ts`,
  `productionRehearsal.test.ts`):
  - skript = drizzle 0023;
  - návrat = přesný stav před;
  - udělení, odebrání a pojistky.
- **Číslo:** 0023 na pilotní větvi. Rozpracované zapisovací balíčky se
  přečíslují na 0024.

## Postup (každý krok po schválení)

**Preview (`br-super-dust-b2wbw2wk`):**

1. Push commitu. Dokud migrace neproběhne, náhled je v Preview pro všechny
   404 a tlačítko není vidět.
2. Neon SQL editor (Preview): `10_before.sql` → `11_migration.sql` →
   `12_after.sql` → `20_udelit.sql`.
3. Kontrola:
   - každý ze 4 vidí tlačítko a otevře náhled;
   - jiný účet dostane 404;
   - audit má řádek za každé otevření.

**Production:** stejné kroky až po nasazení kódu do Production a po schválení
výsledku v Preview. Před `20_udelit.sql` porovnat výpis z `10_before.sql`
s tabulkou výše.

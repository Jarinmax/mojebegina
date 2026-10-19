# Administrátorský náhled zákaznické karty („očima zákazníka“)

Stav: implementováno lokálně, **necommitnuto, nenasazeno**, bez migrace.

## Cesta

`/admin/organizace/<id>/nahled?zobrazeni=prehled|objednavky|profil`, tlačítko
„Náhled očima zákazníka“ v detailu organizace (`/admin/organizace/<id>`).

## Bezpečnost

- **Jen ADMIN**, kontrolovaný ve třech vrstvách:
  1. layout `/admin` přesměruje ostatní pryč (stávající konvence);
  2. stránka sama vrací 404 (layout běží souběžně se stránkou, nespoléhá se na něj);
  3. datová vrstva `getCustomerPortalPreviewForAdmin` ověří ADMIN z ověřené session
     **dřív**, než z organizace cokoli načte.

  Id z URL samo nic neotevře; neplatné nebo neexistující id vrací 404.
- **Žádná impersonace:**
  - session zůstává ADMIN;
  - žádná cookie, zákaznický token ani heslo;
  - nic se nezapisuje (ověřeno testem).
- **Karta je zamčená atributem `inert`:** odkazy, tlačítka a formuláře v ní nejdou
  použít ani zaměřit. „Odhlásit se“ je nahrazené neaktivní kopií, skutečné by
  odhlásilo administrátora. Aktivní prvky jsou jen v pruhu náhledu: přepínání
  pohledů a „Zpět do administrace“.
- **Zápisové akce:** zákaznická část má jedinou serverovou akci (volba role ve
  `/vyber-roli`) a ta v náhledu není. Žádná úprava profilu, adres, pozvánky,
  hesla, objednávek, plateb ani faktur v zákaznické kartě dnes neexistuje.
- **noindex** (metadata + `X-Robots-Tag`) a `Cache-Control: private, no-store`
  (`next.config.ts`).

## Stejná karta

Zákaznické stránky (`/`, `/objednavky`, `/profil`) i náhled kreslí stejné
sdílené komponenty (`components/customer-portal/*`) ze stejných funkcí
načítání (`loadCustomerAccount`, `loadCustomerOrders` v `lib/data/dashboard.ts`).
Liší se jen brána:
- zákazník: `assertOrgAccess` podle svého členství;
- náhled: ADMIN.

Kontakt v náhledu je profil prvního zákaznického účtu organizace. Zákazník vidí
své jméno ze session, které se do profilu synchronizuje. Test ověřuje, že
vykreslený HTML karty je znak po znaku stejný jako u přihlášeného zákazníka
(kromě neaktivního „Odhlásit se“).

## Audit

Aplikace nemá obecný bezpečnostní auditní log; `agent_audit_log` je jen pro
ChatGPT. Otevření náhledu se proto zatím zapisuje jen jako strukturovaný
záznam do logů Vercelu:

```json
{"event":"admin_customer_preview","adminUserId":"…","organizationId":"…","at":"…"}
```

Logy Vercelu mají omezenou dobu uchování. Trvalý audit by potřeboval malou
tabulku (např. `admin_access_log`: kdo, kdy, která organizace, jaký pohled),
tedy migraci ke schválení.

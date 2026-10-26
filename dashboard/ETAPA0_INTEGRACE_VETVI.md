# Etapa 0 — audit tří nesloučených větví a plán integrace

Stav: **NÁVRH K ODSOUHLASENÍ.** Nic nebylo sloučeno ani přečíslováno a do Production DB se nezapisovalo.
Audit proběhl 26. 10. 2026 nad `main` `a2c8f61` (#41) a nad Production DB, ze které se jen četlo.
Testy se pouštěly v dočasných kopiích jednotlivých větví mimo repozitář. Konflikty se zjišťovaly
přes `git merge-tree`, tedy výpočtem bez zásahu do jakékoli větve.

Navazuje na `ZAMESTNANCI_NAVRH.md`, kapitoly 1.3 a 5 (Etapa 0).

| Zkratka | Větev | Commity nad `main` | Poslední změna |
|---|---|---|---|
| **G** | `feature/google-calendar-1-0` | 7 (5 vlastních + merge + přečíslování) | 7. 10. |
| **D** | `feature/daily-calls-1-1-worker-history` | 11 (**obsahuje celou G**) + 4 vlastní | 7. 10. |
| **P** | `feature/jarda-volani-provize-2-provize-bonus` | 2 (část 1 `e86b1f7`, část 2 `542c1d6`) | 22. 10. |

G a D vznikly ze stejného základu (`0f0b2d8`, 7. 10.) a `main` je od té doby o 32 commitů dál.
P vznikla z `f81a7dd` (20. 10.) a `main` je o 14 commitů dál. **D je postavená na G**, protože G je
předkem D. **P o G ani D neví** a stejnou oblast (zápis výsledku hovoru) řeší po svém.

---

## 1. Co přesně každá větev mění

### G — Google Kalendář 1.0

- **OAuth propojení** Google účtu Jaroslava Blahouta (`/api/google-calendar/connect`, `/callback`).
  - Scope je jen `calendar.app.created`, tedy jen kalendář, který aplikace sama založí.
  - Refresh token je šifrovaný AES-256-GCM klíčem z env (`googleCalendarCrypto.ts`).
- **Synchronizace „Dalšího kontaktu“** z Denního volání i z detailu leadu do kalendáře „MojeBegina – volání“.
  - Je idempotentní díky deterministickému ID události a pořadí 409 → `get` → `patch`.
  - Selhání Googlu nikdy nevrátí zpět zápis v CRM. Stav se drží v `lead_calendar_sync`
    (`pending` / `synced` / `failed`) a jde zkusit znovu.
- **Nová pravidla pro termín dalšího kontaktu:**
  - zadává se **datum + čas v Europe/Prague** (Luxon) a nově jako povinná dvojice;
  - neexistující a dvojznačné časy při přechodu letního času se odmítnou;
  - v Denním volání se termín maže přímo (bez `COALESCE`).
- **Migrace** `0021_phase_20_google_calendar`: nové tabulky `google_calendar_connections` a
  `lead_calendar_sync`. Je čistě přídavná.
- **Nové závislosti:** `googleapis`, `google-auth-library`, `luxon`.
- **Nové env proměnné:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
  `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`.
- **Nové pomocné moduly:** `lib/data/pragueTime.ts` a `formatCzechDateTime()` v `lib/format.ts`.

### D — Denní volání 1.1 (historie pracovníka a „Dnes vyřízeno“)

Uvedené jsou jen vlastní změny nad G.

- **Karta kontaktu ve frontě** ukazuje bez klikání poslední 3 relevantní záznamy, fázi a další kontakt.
  Zbytek historie je za přístupným rozbalením.
- **Sekce „Dnes vyřízeno“:** vyřízené položky nezmizí, přesunou se do sbalitelné sekce
  (jen dnešní pražský den).
- **Potvrzení „Výsledek uložen“** přežije revalidaci stránky (klientský controller
  `DailyCallsWorkArea` + Context). Funguje i deep-link `?focus=`.
- **Migrace** `0022_phase_21_daily_calls_worker_history`: nullable FK
  `daily_call_queue.resulting_activity_id` → `lead_activity.id` (`ON DELETE SET NULL`).
  Nastavuje se ve **stejném atomickém CTE** jako přechod položky na `done`.
- **Testy:** regresní testy izolace pracovníka a atomicity zápisu nad skutečným Postgresem (PGlite).

### P — Jarda: volání a provize

**Část 1** (bez migrace):
- E-mail u kontaktu ve frontě s tlačítkem „Přidat e-mail“.
- **Jednotný zápis výsledku hovoru:** sdílená validace `validateCallOutcomeInput` a komponenta `CallOutcomeFields`.
- **Oprava skutečné chyby:** hovor zapsaný z detailu leadu dosud **nezavřel** položku v Denním volání.
  Teď ji zavře ve stejném `db.batch`.
- **Stránka Historie volání** (Dnes / Včera / 7 dní, stránkování po 50, hranice dne počítá Postgres v Europe/Prague).
- Nová brána `requireDailyCallAccess`.

**Část 2** (migrace `0023_jarda_provize_2_organizations_fields`):
- `organizations.acquired_at`, `acquisition_bonus_paid_at`, `acquisition_bonus_paid_by_user_id`.
- Nová append-only tabulka **`organization_owner_history`**. Backfill založí otevřené období od
  okamžiku nasazení.
- **3% provize** z dalších nákupů svěřených zákazníků a **akviziční bonus 1000 Kč** (6měsíční lhůta, vyplacení potvrzuje ADMIN).
- **První skutečný zápis do tabulky `notifications`:** oznámení „Zaplacená objednávka“ pro správce
  zákazníka. Napojeno na Stripe webhook, ruční platbu a převod platby. Panel „Nové nákupy“ v Obchodu.

---

## 2. Co z toho už je v `main`

**Nic.** Žádný ze symbolů větví (`googleCalendar`, `pragueTime`, `resulting_activity_id`,
`DailyCallsWorkArea`, `CallOutcomeFields`, `validateCallOutcomeInput`, `organization_owner_history`,
`acquiredAt`, `notifyOrderOwnerPaid`, `luxon`…) v `main` není.

Ani Production DB nemá žádnou z tabulek nebo sloupců větví. Tabulka `__drizzle_migrations` v produkci
**neexistuje**: migrace se podle konvence projektu spouštějí ručně v Neon SQL Editoru
(`MONOREPO_PLAN.md`), výjimkou je hlídaný skript pro 0024.

Do `main` ale mezitím přibyly věci, se kterými se větve **musí sladit**, i když je Git nenahlásí
jako konflikt:

| Novinka v `main` | Proč na ní záleží |
|---|---|
| GPT/MCP nástroje (#32, #35, #41): `set_lead_next_step`, `get_salesperson_activity`, `get_daily_call_report`, `list_leads`… | **Třetí místo, které zapisuje termín dalšího kontaktu** (`setLeadNextStep`, jen datum, 12:00 UTC). Čte `CallResult` z `dailyCallsValidation.ts`. |
| Poznámky a provozovny na kartě zákazníka (#33), firemní odběratelé (#24) | konflikty v `obchod/actions.ts`, `zakaznici/[id]/page.tsx`, `leads.ts` |
| Platby faktur kartou (#30), `customerInvoice` ve Stripe webhooku | konflikt ve webhooku. Platba faktury objednávku nepřepíná, takže oznámení z P na ni napojovat nemá. |
| Migrace `0021`–`0024` (e-shop, iDoklad log, MCP) | **kolize čísel** (kap. 3) |
| Doménové směrování (#17) | `moje.begina.cz` pouští vše, nové `/api/google-calendar/*` projdou. Redirect URI musí být `https://moje.begina.cz/api/google-calendar/callback`. |

---

## 3. Konflikty migrací 0021–0023

| Číslo | `main` (v produkci) | G | D | P |
|---|---|---|---|---|
| 0021 | `eshop_1_0_variant_weight` | `phase_20_google_calendar` | (z G) | = main |
| 0022 | `eshop_1_0_company_invoicing` | — | `phase_21_daily_calls_worker_history` | = main |
| 0023 | `idoklad_read_log` | — | — | `jarda_provize_2_organizations_fields` |
| 0024 | `gpt_mcp_production` | — | — | — |

Co přesně koliduje:

1. **Názvy souborů:** SQL soubory by vedle sebe přežily (`0021_eshop…` i `0021_phase_20…`).
   Sdílejí ale číslo a Drizzle i test `migrationChain` vyžadují jedno číslo na jednu migraci.
2. **`meta/00xx_snapshot.json`:** stejné jméno, jiný obsah. Konflikt v Gitu.
3. **`meta/_journal.json`:** konflikt v Gitu. Navíc `when` u G a D (1791394…) je **menší** než
   u `main` 0021–0024. Test „when roste“ by spadl a `drizzle-kit migrate` by takovou migraci tiše přeskočil.
4. **Řetězec snapshotů `id → prevId`:** snapshoty větví navazují na staré předchůdce.
   `drizzle-kit generate` by pak vyrobil špatnou další migraci, takže **ruční přejmenování nestačí**.
5. **Testy** `migrationChain.test.ts` a `productionRehearsal.test.ts` mají v sobě natvrdo seznam migrací.
   Konflikt v Gitu a nová očekávání.

**Řešení:** nová čísla **0025 (G), 0026 (D), 0027 (P)** vygenerovaná nástrojem, ne ručně (postup v kap. 5.2).
Obsah SQL zůstane stejný po jednotlivých příkazech. Mění se jen číslo, snapshot a `when`.

### Konflikty v kódu (`git merge-tree`, bez zásahu do větví)

| Kombinace | Soubory v konfliktu | Povaha |
|---|---|---|
| `main` + G | `obchod/actions.ts`, `leads.ts`, migrace (3), `migrationChain.test.ts` | jen importy a migrace, triviální |
| `main` + D | totéž + `0022_snapshot.json` | triviální |
| `main` + P | `stripe/webhook/route.ts`, `obchod/actions.ts`, `zakaznici/[id]/page.tsx`, `leads.ts`, `orders.ts`, migrace, `migrationChain`, `productionRehearsal` | převážně „obě strany přidaly“, mechanické |
| **P + D** (i P + G) | `dailyCalls.ts`, `dailyCallsValidation.ts`, `leads.ts`, `CallOutcomeForm.tsx`, `CallLogForm.tsx`, `QueueItemCard.tsx`, `dnes/actions.ts`, testy (celkem ~420 řádků v konfliktech) | **věcné, viz níže** |

### Věcné konflikty, které Git nenahlásí nebo nevyřeší sám

| # | Konflikt | Doporučené řešení |
|---|---|---|
| K1 | **Termín dalšího kontaktu:** G a D chtějí datum + čas v Praze; P a MCP v `main` chtějí jen datum (12:00 UTC). | Cílový stav je **datum + čas** (G, výslovně schváleno), protože ho potřebuje kalendář i budoucí systém úkolů. Sjednocená validace z P se přepíše na `pragueDateTimeToUtc`. MCP `set_lead_next_step` dostane volitelný `follow_up_time` s výchozí hodnotou 09:00 Europe/Prague. |
| K2 | **Prázdný termín při zápisu hovoru:** G a D termín smažou, P ho ponechá (`COALESCE`). | Převzít chování G a D: vyřízený hovor bez nového termínu termín **smaže** a smaže i událost v kalendáři. Starý termín by jinak držel lead v automatickém návrhu fronty a v kalendáři. `next_step_note` z P ponechat s `COALESCE` (je to text, ne termín). |
| K3 | **Zavření položky fronty z detailu leadu** (oprava v P) nenastaví `resulting_activity_id` (D). | Při integraci P nastavit FK i v cestě `logCallOutcome`, ve stejném `db.batch`. „Dnes vyřízeno“ pak ukáže i hovory zapsané z detailu leadu. |
| K4 | **Kalendář** (G) se aktualizuje jen v původních cestách. | Po sjednocení z P zavolat `reconcileLeadCalendarEvent` v obou cestách i v MCP `setLeadNextStep` (best-effort, po commitu). |
| K5 | **`CallResult`/`CALL_RESULTS`:** P je přesouvá do `leadValidation.ts`, ale `main` je mezitím importuje z `dailyCallsValidation.ts` v 5 souborech (MCP reporty, `dailyCallLabels`, `CallOutcomeForm`). **Git konflikt neohlásí, build spadne.** | V `dailyCallsValidation.ts` ponechat re-export (`export { CALL_RESULTS, type CallResult } from "./leadValidation"`), nebo upravit importy. Ohlídá to `tsc`. |
| K6 | **Duplicitní helpery pro pražský čas:** `pragueTime.ts` (G), `pragueDateString` (P v `dailyCallsValidation.ts`), `formatPragueDate` (MCP v `main`). | Jeden modul `lib/data/pragueTime.ts`, ostatní ho re-exportují. Nové chování se nezavádí. |
| K7 | **Chyba v P (provize):** `linkLeadToExistingOrganization` a `convertLeadToNewOrganization` nastaví `organizations.owner_user_id`, ale **nezaloží řádek** v `organization_owner_history`. Bez otevřeného období platí `commissionSince = null` a provize se spočítá ze **všech** dřívějších objednávek. U propojení s existujícím zákazníkem by tak obchodník dostal provizi zpětně, což **odporuje schválenému pravidlu**. | Opravit před sloučením: v obou cestách založit otevřené období ve stejném `db.batch`. Přidat integrační test „propojení leadu s existujícím zákazníkem s historií objednávek → provize 0 Kč“. |
| K8 | **Stávajících 16 termínů** v produkci je uložených jako „jen datum“ (12:00 UTC), z toho 13 u aktivních leadů. Po nasazení G by se ukazovaly jako 13:00 nebo 14:00 a do kalendáře by se zapsaly jako události v tento čas. | Při nasazení G jednorázový, vratný datový skript (záloha původních hodnot) převede těchto 16 hodnot na 09:00 Europe/Prague téhož dne. **Vyžaduje samostatné schválení** jako každý zápis do Production. |

---

## 4. Jak bezpečně zachovat funkce a data

1. **Všechny tři migrace jsou přídavné:** nové tabulky a nové nullable sloupce. Stará verze kódu
   s novým schématem funguje dál. Pořadí nasazení je proto vždy **nejdřív migrace, potom kód**.
2. **Data se nepřepisují.** Výjimkou je jen backfill `organization_owner_history` (INSERT) a
   navrhovaný převod 16 termínů (K8, vratný, se zálohou).
3. **Historie Gitu se nepřepisuje:** žádný rebase ani force-push. Integrace je merge `main` do
   integrační větve, takže původní větve zůstanou beze změny jako záloha.
4. **Každý krok má vlastní PR, Preview a návrat:**
   - pro každou migraci se připraví `docs/<oblast>/10_pred.sql`, `11_migrace_00xx.sql`, `12_po.sql` a `19_navrat.sql` (konvence z e-shopu);
   - k tomu se přidá případ do `productionRehearsal.test.ts`;
   - migrace se nejdřív spustí na Neon Preview větvi a do Production až po schválení.
5. **Provize začne počítat od nasazení části 2.** Backfill nastaví začátek otevřeného období na
   okamžik migrace (vědomé rozhodnutí v P). Čím později se nasadí, tím později se provize začne počítat.
6. **Google Kalendář bez nastavených env proměnných:** CRM musí fungovat beze změny a synchronizace
   se jen přeskočí. Ověří se testem (kap. 6).

---

## 5. Doporučené pořadí integrace

### 5.1 Pořadí: G → D → P1 → P2

| Krok | Co | Migrace | Proč v tomto pořadí |
|---|---|---|---|
| **A** | **G** — Google Kalendář | 0025 | Je základem D a s `main` má nejmenší konflikt (importy). Zavádí cílovou podobu termínu (datum + čas). |
| **B** | **D** — Denní volání 1.1 | 0026 | Po kroku A obsahuje už jen 4 vlastní commity. Migrace je drobná. |
| **C** | **P část 1** — jednotný zápis hovoru, historie volání, e-mail | žádná | Věcně nejnáročnější: sjednocení z P se staví **na** pravidla G a D (K1–K6), ne obráceně. Opravuje chybu se zavíráním fronty. |
| **D** | **P část 2** — provize, bonus, oznámení | 0027 | Nejdřív oprava K7. Nasazuje se vědomě, protože start provizí = okamžik migrace. |

**Zvažovaná alternativa: P jako první** (je nejnovější a nejblíž `main`). **Nedoporučuji ji.**
G a D by se pak musely přepsat na sjednocenou validaci z P, ta ale pracuje jen s datem. Přepisovalo by
se víc kódu a i tak by se musela doplnit synchronizace kalendáře do obou cest.

Jestli chyba „hovor z detailu leadu nezavře frontu“ v praxi vadí denně, jde krok C udělat jako první
samostatnou malou opravu. Plán se tím nemění.

### 5.2 Postup jednoho kroku (A, B a D; krok C nemá migraci)

1. Z původní větve vznikne integrační větev (např. `integrace/google-kalendar`) a do ní se
   sloučí `origin/main` (merge commit, žádný rebase).
2. **Migrace:**
   - soubory `main` (`0021`–`0024`, snapshoty, journal) zůstanou beze změny;
   - SQL soubor a snapshot větve se odstraní;
   - sloučí se `schema.ts`;
   - `npx drizzle-kit generate --name <původní_název>` vyrobí `0025_…` (DB připojení nepotřebuje);
   - **vygenerované SQL se porovná s původním** po jednotlivých příkazech. Musí sedět, jinak stop;
   - vrátí se původní hlavičkový komentář a u P2 ručně připojený backfill.
3. Upraví se `migrationChain.test.ts` a `productionRehearsal.test.ts` a připraví se SQL balíček do `docs/`.
4. Vyřeší se věcné body z kap. 3, které ke kroku patří.
5. Celá sada kontrol z kap. 6 → PR → Preview (migrace na Neon Preview větvi) → schválení → Production.

### 5.3 Časový odhad

| Krok | Odhad |
|---|---|
| A — G | 0,5–1 den |
| B — D | 0,5 dne |
| C — P1 (věcné sloučení K1–K6) | 1–1,5 dne |
| D — P2 (+ oprava K7) | 0,5–1 den |
| **Celkem** | **cca 3–4 dny**, plus čekání na schválení a nastavení Google OAuth |

---

## 6. Testy před sloučením

### 6.1 Výchozí stav (naměřeno 26. 10. 2026)

Každá větev byla otestovaná samostatně, ve vlastní dočasné kopii a s vlastní `npm ci`:

| Větev | vitest | `tsc --noEmit` | eslint |
|---|---|---|---|
| `main` (`a2c8f61`) | **120 souborů / 1306 testů prošlo**, 1 přeskočen | 5 chyb* | 0 chyb, 1 varování |
| G | 73 / 753 prošlo | 5 chyb* | čisté |
| D | 76 / 792 prošlo | 5 chyb* | čisté |
| P | 99 / 1109 prošlo | 5 chyb* | 0 chyb, 1 varování (totéž jako v `main`) |

\* Ve všech případech jde o tytéž chyby `Cannot find module '@/public/logo-begina-mark.png'`.
Způsobuje je chybějící `next-env.d.ts`, který generuje až `next build`/`next dev`. Je to vlastnost
prostředí, ne chyba větví. Při integraci se `tsc` pouští po `next build` (nebo `next typegen`).

**Závěr:** všechny větve jsou samy o sobě zelené. Žádná z nich ale nebyla otestovaná proti
dnešnímu `main`. Věcné konflikty K1–K7 se proto projeví až po sloučení. Na K5 by upozornil `tsc`,
na K7 a K8 žádný ze stávajících testů.

### 6.2 Povinné kontroly každého kroku

1. `npm test` (vitest, včetně PGlite testů nad **všemi** migracemi): vše zelené, žádný test přeskočený navíc.
2. `npx tsc --noEmit` a `npm run lint` bez nových chyb (zachytí K5).
3. `npm run build`.
4. `migrationChain.test.ts`: řetězec 0000–0027 bez mezer, `when` roste, snapshoty mají úplné schéma.
5. `productionRehearsal.test.ts`: před / migrace / po / druhé spuštění se zastaví / návrat.

### 6.3 Nové testy podle kroku

| Krok | Test |
|---|---|
| A | bez Google env proměnných a bez propojení: zápis hovoru i dalšího kroku projde a synchronizace se přeskočí; MCP `set_lead_next_step` s datem bez času → 09:00 Praha; datový skript K8 převede jen hodnoty 12:00:00Z a jde vrátit |
| B | zápis z fronty nastaví `resulting_activity_id`; „Dnes vyřízeno“ přes pražskou půlnoc |
| C | hovor z **detailu leadu** zavře položku fronty, nastaví `resulting_activity_id` a aktualizuje kalendář; obě cesty zapíší stejný tvar `call_logged`; MCP reporty (`get_salesperson_activity`, `get_daily_call_report`) počítají shodně před sloučením i po něm; prázdný termín ho smaže (K2) |
| D | **K7:** propojení s existujícím zákazníkem s historickými objednávkami → provize 0 Kč, otevřené období od propojení; oznámení „zaplaceno“ právě jednou při opakovaném webhooku; platba faktury (#30) oznámení nevytvoří |

### 6.4 Ruční ověření na Preview (Jarda, před Production)

- **Denní volání:** zapsat výsledek, ověřit „Dnes vyřízeno“, totéž z detailu leadu, zkontrolovat Historii volání.
- **Google Kalendář:** propojit, naplánovat kontakt, přeplánovat, smazat, uzavřít lead a ověřit, že událost zmizí.
- **ChatGPT/MCP:** `set_lead_next_step` a report hovorů za den.
- **Provize:** karta zákazníka, provize a bonus u testovací organizace, testovací platba → oznámení.

---

## 7. Co využijeme pro systém řízení zaměstnanců

| Z větve | Co | Využití |
|---|---|---|
| G | `pragueTime.ts` (Luxon, odmítání neexistujících a dvojznačných časů při přechodu letního času), `formatCzechDateTime` | termíny a časová okna úkolů, generování opakovaných úkolů |
| G | vzor synchronizace se stavem `pending` / `synced` / `failed`, idempotentní opakování a selhání nikdy neruší hlavní zápis | doručování push notifikací (`push_sent_at`, opakování), později úkoly do Google Kalendáře |
| G | šifrování tajemství aplikačním klíčem (`googleCalendarCrypto.ts`) | budoucí integrace; tajemství nikdy v čitelné podobě v DB |
| D | `resulting_activity_id`, tedy vazba „úkol → právě ta aktivita, která ho vyřešila“ | stejný princip `task_submissions` ↔ úkol; štítek „ověřeno systémem“ pro hovory z fronty |
| D | „Dnes vyřízeno“, `DailyCallsWorkArea` (potvrzení přežije revalidaci), deep-link `?focus=` | `/prace`: „Dnes hotovo“, potvrzení odeslání úkolu, odkaz z upozornění přímo na úkol |
| D | testy izolace pracovníka a atomicity nad PGlite | šablona testů pro `taskAuth.ts` a odevzdání úkolu |
| P | **`notifications.ts` + `notificationsInbox.ts`** (první zápis i čtení, best-effort, přečtení) | jádro in-app upozornění; v Etapě 1 se jen rozšíří (sloupce `entity_*`, `dedupe_key`, `severity`) |
| P | `organization_owner_history` (append-only období) | záložka „Obchod“ na kartě zaměstnance: koho a odkdy spravuje |
| P | provize a akviziční bonus | **systémově ověřené** výsledky obchodu na kartě a v manažerském přehledu |
| P | Historie volání (filtry Dnes / Včera / 7 dní počítané v Postgresu) | časová osa zaměstnance a výsledky den/týden |
| P | jednotná validace a zápis hovoru | jediný zdroj událostí „hovor“ pro časovou osu |

Současně se ukázalo omezení pro budoucí systém. Oprávnění Denního volání a Kalendáře stojí na
**natvrdo zapsaných userId** (Viner, Blahout). Pro „všechny zaměstnance“ je později nahradí
`staff_profiles` a vztah vedoucí–podřízený z návrhu. **V Etapě 0 se to nemění.**

---

## 8. Doporučení a co schválit

1. **Pořadí G → D → P1 → P2** s čísly migrací **0025 / 0026 / 0027**, generovanými nástrojem.
2. **Věcná rozhodnutí K1–K8** podle tabulky v kap. 3. Novým rozhodnutím je jen výchozí čas
   **09:00** pro termín bez času (MCP a převod 16 starých hodnot). Ostatní body vycházejí z už
   schválených pravidel.
3. **Oprava K7** (provize zpětně) je podmínkou sloučení P2.
4. **Zápisy do Production** (migrace 0025–0027, datový skript K8, Google env proměnné) zůstávají
   samostatně schvalované kroky podle konvence projektu.
5. Po kroku D navážeme **Etapou 1** systému úkolů (`ZAMESTNANCI_NAVRH.md`) nad sjednoceným základem.
   Etapa 1 dostane migraci 0028.

# ChatGPT ↔ MojeBegina — pilot (MCP + OAuth)

Stav: **kód hotový, nic nenasazeno, nic nespuštěno na Neonu.** Výchozí stav
je vypnuto: dokud ve Vercelu nejsou proměnné `MCP_*`, všechny nové adresy
vracejí 404 a aplikace se chová jako dosud.

Pilot je jen pro Jaroslava Vinera (ChatGPT Plus, Developer Mode). Kolegové
se přidají později jedním řádkem v konfiguraci (viz níže). Každý se připojuje
**pod svým účtem MojeBegina a jen s jeho oprávněními**. Žádný sdílený účet ani
„robot“ s vlastními právy neexistuje.

## Jak to funguje

```
ChatGPT ──HTTPS──> POST /api/mcp  (MCP, JSON-RPC, bezstavový)
                        │  Authorization: Bearer <access token>
                        ▼
              resolveAccessToken()  lib/agent/oauthStore.ts
              – token platí? souhlas neodvolaný? uživatel v allowlistu?
              – role ze souhlasu pořád v user_roles?  (čte se při KAŽDÉM volání)
                        │  → AuthContext uživatele, jméno „… (přes ChatGPT)“
                        ▼
              runAsAgent(ctx)  lib/agent/context.ts
                        │  getAuthContext() vrátí tuhle identitu místo cookie
                        ▼
      STÁVAJÍCÍ datová vrstva a brány: requireCrmAccess, requireCompanyNodeAccess …

OAuth 2.1 (vlastní, malý, nad běžným přihlášením MojeBegina):
  /.well-known/oauth-protected-resource[/api/mcp]   RFC 9728
  /.well-known/oauth-authorization-server           RFC 8414
  /oauth/authorize    přihlášení + souhlasová stránka (PKCE S256 povinné)
  /api/oauth/token    kód → tokeny, rotace refresh tokenu
  /api/oauth/revoke   odvolání (RFC 7009)
```

- **Klient je statický** (client_id + secret z Vercelu, ručně vložený do ChatGPT).
  Žádná samoregistrace (DCR), takže si cizí aplikace klienta nezaloží.
- **Redirect jen na adresy z `MCP_OAUTH_REDIRECT_URIS`.** Cokoli jiného skončí
  chybovou stránkou bez přesměrování.
- Access token platí 1 hodinu, refresh token 30 dní a při každém použití se
  vymění. Když někdo použije starý refresh token nebo kód podruhé, považuje se
  to za odcizení a celý souhlas se odvolá.
- V DB jsou jen SHA-256 otisky tokenů, nikdy tokeny samotné.

## Co asistent umí

| Nástroj | Typ | Co dělá |
|---|---|---|
| `search_crm` | čtení | hledá leady i zákazníky (název, kontakt, telefon, e-mail, město, IČO) |
| `get_lead` | čtení | detail leadu + historie |
| `get_customer` | čtení | detail zákazníka: obrat, objednávky, poznámky |
| `my_overview` | čtení | počty z kokpitu, moje leady k ozvání (po termínu / do 7 dní), moje úkoly v mapě |
| `list_company_tasks` | čtení | Živá mapa firmy jako seznam (celá nebo jen moje) |
| `get_company_task` | čtení | detail tématu/úkolu + diskuse |
| `add_lead_note` | zápis | poznámka do historie leadu (`note_added`) |
| `set_lead_next_step` | zápis | další krok a/nebo datum dalšího kontaktu u leadu (`next_step_set`) |
| `add_customer_note` | zápis | poznámka u zákazníka (nová tabulka `organization_activity`, vidět i na kartě zákazníka) |
| `create_company_task` | zápis | nové téma v Živé mapě **pod existující oblast** (nové oblasti ne) |
| `comment_company_task` | zápis | komentář do diskuse tématu |

Asistent **nikdy** nemaže, nemění fázi leadu, vlastníka, role ani oprávnění a
nesahá na objednávky, platby ani fakturaci. Zápisové nástroje dostane jen
tehdy, když je uživatel na souhlasové stránce povolí (rozsah `mojebegina.write`).

Pojistky zápisů:

- **Idempotence:** každý zápis nese `idempotency_key`. Když ChatGPT zopakuje stejné
  volání (třeba po výpadku spojení), nic se nezapíše podruhé.
- **Limit:** nejvýš 60 zápisů za hodinu na jeden souhlas.
- **Audit:** každé volání (i zamítnuté) jde do `agent_audit_log`. Přehled za
  posledních 7 dní je v MojeBegina › Řízení firmy › Asistent ChatGPT
  (`/rizeni-firmy/asistent`). Tam jde přístup i jedním tlačítkem odvolat.
- **Viditelnost:** vše, co asistent zapíše, má v historii autora
  „Jméno (přes ChatGPT)“.

## Stav ověření

| Co | Stav |
|---|---|
| OAuth tok, tokeny, odvolání, idempotence, audit, oprávnění (kód → DB) | **ověřeno lokálně** testy nad PGlite přes skutečný ovladač Neonu (`lib/agent/__tests__`) |
| HTTP: discovery, 401 + `WWW-Authenticate`, token endpoint, nástroje, `begina.cz` → 404 | **ověřeno lokálně** (`next start` nad testovací DB v paměti) |
| Produkční SQL `docs/gpt-mcp` (migrace, pojistka Preview větve, návrat) | **ověřeno lokálně** nad PGlite se všemi migracemi; nad Neonem **nespuštěno** |
| Stav Production DB | **ověřeno read-only** 13. 10. 2026: `main` = schéma kódu do 0021, žádná tabulka pilotu, kalendáře ani skladu |
| Přihlášení přes Neon Auth na souhlasové stránce (`/login?next=…` → `/oauth/authorize`) | **NEOVĚŘENO** — v testech je Neon Auth nahrazený; ověří se až na Preview v prohlížeči |
| Skutečné připojení ChatGPT (Developer Mode, callback URL, volání nástrojů z chatu) | **NEOVĚŘENO** — konektor nezapnutý |
| Dosažitelnost Preview pro servery ChatGPT při zapnuté Vercel Deployment Protection | **NEOVĚŘENO** — viz krok 2 níže |

## Kontroly před nasazením (13. 10. 2026)

### 1. Kolize migrací se skladem a Google Kalendářem

Stav větví (jen čtení, jejich větve se neměnily):

| Větev | Migrace za společným základem |
|---|---|
| `main` (= Production DB) | `0021_eshop_1_0_variant_weight` |
| tento PR | `main` + `0022_gpt_mcp_pilot` |
| `feature/google-calendar-1-0` | `0021_phase_20_google_calendar` (bez `main` 0021) |
| `feature/sklad-1-0` | `0021_…google_calendar`, `0022_…daily_calls_worker_history`, `0023_…sklad_1_0_zaklad` |
| `rescue/sklad-reread-2026-10-12` | totéž + `0024_…sklad_1_0_znovu_precist` |

- **Databáze: žádná kolize.** Pilot zakládá jen 4 nové tabulky. Sklad ani
  kalendář žádnou z nich nezakládají ani nemění a pilot nemění jejich tabulky.
  Ověřeno nad PGlite: `main` + pilot + 0021–0024 skladu v obou pořadích dá
  **identické schéma** (1089 objektů). `docs/gpt-mcp/11_migration.sql` projde
  i po skladu. Production nemá tabulku migrací Drizzle (SQL se spouští ručně),
  takže na pořadí spuštění v DB nezáleží.
- **Repozitář: kolize čísel.** Sklad a kalendář už dnes kolidují s `main` na
  0021 (nezávisle na pilotu). Pilot přidává kolizi na 0022. Snapshoty
  (`drizzle/meta`) se nedají sloučit ručně.
- **Sémantická kolize, kterou git neohlásí:** na větvi kalendáře každý zápis,
  který mění `leads.next_follow_up_at`, ve stejném `db.batch` volá
  `upsertPendingLeadCalendarSync(leadId)` a po commitu
  `reconcileCalendarAfterCommit(leadId)`. Pilotní `setLeadNextStep` to
  nedělá. Po sloučení s kalendářem **musí** obojí dostat, jinak se termín
  nastavený přes ChatGPT nepropíše do Google Kalendáře. Textové konflikty se
  dají čekat v `lib/data/leads.ts` a `LeadActivityTimeline.tsx` (kalendář přidává
  druh `follow_up_removed`, pilot `note_added` a `next_step_set`, které se nekryjí).

**Doporučené pořadí (bez změn jejich větví):**

1. Tento PR zůstane Draft. Pilot se ověřuje na vlastním Preview a do `main`
   zatím nejde.
2. Sklad a kalendář se do `main` sloučí v pořadí, které už mají
   (kalendář → historie Denního volání → sklad → znovu přečíst). Při tom je
   přečíslují nad `main` 0021 (vlastní práce jejich PR).
3. Teprve potom se tento PR aktualizuje z `main`: smazat `0022_gpt_mcp_pilot.sql`
   a jeho snapshot, vrátit `_journal.json` a `schema.ts` na `main` + 4 tabulky
   pilotu, spustit `drizzle-kit generate --name gpt_mcp_pilot` (dostane
   další volné číslo) a doplnit volání kalendáře do `setLeadNextStep`. Pak
   `migrationChain` a generálka (`productionRehearsal`).
4. SQL v `docs/gpt-mcp/` na číslu migrace nezávisí. Na Preview DB pilotu ho lze
   spustit kdykoli, i před krokem 2.

Pilot je jedna aditivní migrace, takže přečíslování je nejlevnější na jeho
straně. Opačné pořadí (pilot do `main` první) by přečíslování přesunulo na
sklad a kalendář.

### 2. Tokenová autentizace vs. běžné přihlášení a ostatní části aplikace

- Bearer token čte **jen** `/api/mcp`. `/api/oauth/token` a `/revoke` čtou
  Basic (ChatGPT jako klient). Žádná stránka ani serverová akce token
  nepřijímá. Hlídá to test (grep), stejně jako to, že identitu asistenta
  (`runAsAgent`) nastavuje jen `lib/agent/mcp/server.ts`.
- Identita asistenta žije v `AsyncLocalStorage` jen po dobu jednoho volání
  nástroje. Test běží souběžně: uvnitř nástroje vidí datová vrstva uživatele
  z tokenu, mimo něj (souběžný `getAuthContext()`) vždy cookie session.
  Přihlášený CUSTOMER během běžícího volání asistenta CRM bránou neprojde.
  Po volání nezůstane žádný zbytek.
- Co asistent smí, rozhodují stávající brány (`requireCrmAccess`,
  `requireCompanyNodeAccess`) podle role ze souhlasu. Role se čte z DB při
  každém volání. Nástroje volají jen vyjmenované funkce CRM a Živé mapy,
  žádnou z adminu, objednávek, plateb ani fakturace.
- `/api/mcp` nečte cookies. Prohlížeč na cizím webu hlavičku `Authorization`
  bez CORS poslat nemůže (CORS `/api/mcp` nepovoluje), takže CSRF přes cookie
  nehrozí.
- Login: `?next=` přijme jen `/oauth/authorize…` (test na open redirect),
  jinak se chová jako dřív.

### 3. Odvolání a idempotence po obnově tokenu

- Odvolání (v MojeBegina, z ChatGPT přes RFC 7009, nebo detekcí znovupoužití)
  nastaví `agent_grants.revoked_at`. **Každé** volání `/api/mcp` to kontroluje,
  takže už vydaný access token přestane platit hned, ne až po hodině. Refresh
  token odvolaného souhlasu už nový access token nedostane. Totéž platí po
  obnově: odvolání starým tokenem zablokuje i token vydaný obnovou. Vše má testy.
- Idempotence je vázaná na **uživatele a klíč** (`user_id, idempotency_key`),
  ne na token ani souhlas. Test: zápis → obnova tokenu → stejný klíč =
  `alreadySaved` → nové připojení (jiný souhlas) → stejný klíč =
  `alreadySaved`. V DB je jediný záznam.

### 4. Audit

- `agent_tokens` drží jen SHA-256 otisky. Token, client secret ani PKCE
  verifier se nikam neukládají. Test prohledá celé tabulky `agent_*`.
- **Opraveno při kontrole:** audit dřív ukládal celé argumenty (text
  poznámek, hledaná jména). Teď ukládá jen id (UUID), true/false a řídicí
  hodnoty (`priority`, `follow_up_date`, `only_mine`). Každý jiný text
  nahradí délkou (`"[32 znaků]"`), i kdyby model poslal pole navíc (třeba
  token). Výsledek zápisu v auditu je jen `{saved, url}` nebo `{id, url}`.
- **Opraveno při kontrole:** chyba nástroje se do logu Vercelu zapisuje jen
  jako typ a kód. Hláška Drizzle by obsahovala parametry dotazu, tedy obsah CRM.

## Krok 1: samostatné Preview, jen pro Jaroslava a jen ke čtení

Nic z toho zatím neproběhlo. Production, Vercel Deployment Protection ani
konektor v ChatGPT se nemění.

### Cílová DB

- **Neon větev `preview/claude/upbeat-goodall-pj64t5`.** Vytváří ji
  integrace Vercel ↔ Neon při prvním Preview nasazení této git větve, jako
  kopii Production v daném okamžiku (obsahuje tedy skutečná data a účty).
  Read-only přístup v této session větve vypsat neumí. Její `br-…` id je
  potřeba přečíst v Neon Console › Branches a potvrdit skriptem `00_kde_jsem.sql`.
- **Nikdy ne** Production `main`: `br-odd-surf-b2by4tja`, timeline
  `70a96b3677653646e65343cae8e27182`, endpoint `ep-orange-lake-b2zctiy8`.
  Preview skript ji odmítne sám.

### SQL (Neon SQL Editor, vybraná Preview větev, v tomto pořadí)

| # | Soubor | Očekáváno |
|---|---|---|
| 1 | `docs/gpt-mcp/00_kde_jsem.sql` | `je_production = ne`, `tabulek = 29`, `weight_g = 1`, `pilot = 0`; opsat `branch_id` |
| 2 | `docs/gpt-mcp/10_before.sql` | `0` |
| 3 | `docs/gpt-mcp/11_migration_PREVIEW.sql` s `branch_id` z kroku 1 místo `<PREVIEW_BRANCH_ID>` (oba výskyty) | „Statement executed successfully“; jinde `STOP` a nic se nezmění |
| 4 | `docs/gpt-mcp/12_after.sql` | `4 \| 4 \| 0 \| 0` |
| 5 | `docs/gpt-mcp/13_pilot_uzivatel.sql` s vaším e-mailem místo `<E-MAIL>` | 1 řádek, `smi_asistenta = ano`; `user_id` → Vercel |

Návrat: nejdřív smazat proměnné `MCP_*`, pak `19_rollback.sql`.

### Proměnné ve Vercelu

Jen prostředí **Preview** a jen git větev **`claude/upbeat-goodall-pj64t5`**
(Vercel › Settings › Environment Variables › Preview › Branch). Production a
ostatní Preview zůstanou beze změny.

| Proměnná | Hodnota | Tajná? |
|---|---|---|
| `MCP_ISSUER` | stálá adresa větve bez lomítka na konci, pravděpodobně `https://mojebegina-git-claude-upbeat-goodall-pj64t5-jarin-max.vercel.app` (ověřit v Vercel › Deployments › Domains) | ne |
| `MCP_OAUTH_CLIENT_ID` | např. `chatgpt-begina-preview` | ne |
| `MCP_OAUTH_CLIENT_SECRET` | nově vygenerovat, ≥ 32 znaků (`openssl rand -base64 48`). Jen do Vercelu a do ChatGPT, nikam jinam | **ano** |
| `MCP_ALLOWED_USER_IDS` | `user_id` z kroku 5 (jen vy) | ne |
| `MCP_OAUTH_REDIRECT_URIS` | callback URL z ChatGPT (krok 2). Do té doby dočasně `https://chatgpt.com/connector/oauth/pending`, aby šly ověřit discovery a 401 | ne |
| `MCP_ALLOW_WRITE` | **nenastavovat** → pilot jen ke čtení (zápis nejde povolit ani na souhlasové stránce) | — |

`DATABASE_URL` a Neon Auth proměnné nastavuje integrace pro Preview sama.

Bez **všech** pěti povinných proměnných zůstává vše 404. Po nastavení je
potřeba nové nasazení větve (Redeploy).

### Ověření po kroku 1 (bez ChatGPT)

1. `GET <MCP_ISSUER>/.well-known/oauth-authorization-server` → JSON s `issuer = MCP_ISSUER`.
2. `POST <MCP_ISSUER>/api/mcp` bez tokenu → `401` a hlavička `WWW-Authenticate` s `resource_metadata`.
3. V prohlížeči otevřít
   `<MCP_ISSUER>/oauth/authorize?response_type=code&client_id=<CLIENT_ID>&redirect_uri=<REDIRECT_URI>&state=test&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256`
   → přesměruje na přihlášení → po přihlášení zpět na souhlasovou stránku s textem
   „Zápisy jsou zatím vypnuté“. **Tady se poprvé ověří Neon Auth.** Nic
   nepovolovat: „Zamítnout“ vrátí `error=access_denied` na redirect a nic se neuloží.
4. Na Production `moje.begina.cz` se nic nezmění: `/api/mcp` → 404.

Pokud je na Preview zapnutá Vercel Deployment Protection, body 1–2 bez
přihlášení k Vercelu vrátí stránku ochrany. V prohlížeči přihlášeném do
Vercelu projdou.

### Krok 2 (až po rozhodnutí): skutečné připojení ChatGPT

Servery ChatGPT volají `/.well-known/*`, `/api/oauth/token` a `/api/mcp`
bez přihlášení k Vercelu. Se zapnutou Deployment Protection se tedy
nepřipojí. Je potřeba rozhodnout jednu z možností (zatím nic neměněno):
výjimka ochrany jen pro tuto větev, pilot přes vlastní doménu, nebo rovnou
`moje.begina.cz` až po sloučení. Potom v ChatGPT podle oddílu níže, pořád jen
ke čtení.

## ChatGPT (Plus, Developer Mode)

Názvy položek se v ChatGPT občas mění. Řiďte se tím, co aplikace ukáže.

1. Settings › Apps & Connectors › Advanced settings › zapnout **Developer mode**.
2. **Create** (nový konektor):
   - MCP Server URL: `<MCP_ISSUER>/api/mcp`
   - Authentication: **OAuth**
   - v rozšířeném nastavení OAuth zvolit vlastního / předregistrovaného klienta
     („User-defined OAuth client“) a vložit `MCP_OAUTH_CLIENT_ID` a
     `MCP_OAUTH_CLIENT_SECRET`
   - zkopírovat **Callback URL**, kterou ChatGPT ukáže → do Vercelu jako
     `MCP_OAUTH_REDIRECT_URIS` → **nově nasadit**
3. **Connect** → ChatGPT otevře MojeBegina → přihlásit se svým účtem → **Povolit**.
4. Zkusit třeba: „Co mám tento týden za leady k ozvání?“

Zápisy až později: nastavit `MCP_ALLOW_WRITE=on`, nasadit, odpojit a znovu
připojit konektor a na souhlasové stránce zápisy zaškrtnout.

## Ochrana dat (GDPR)

Odpovědi nástrojů (jména, telefony, e-maily kontaktů, poznámky) odcházejí do
OpenAI. Na ChatGPT Plus proto v Settings › Data controls vypněte
**„Improve the model for everyone“**. Firemní smlouvu o zpracování (DPA)
nabízí OpenAI až u Business/Enterprise. Před rozšířením na kolegy je dobré to
rozhodnout a doplnit do Zásad ochrany osobních údajů.

## Produkce

Až po sloučení do `main` (viz pořadí výše) a ověřeném pilotu: `10_before.sql`,
`11_migration.sql`, `12_after.sql` nad Production a proměnné pro Production
s `MCP_ISSUER=https://moje.begina.cz`.

## Provoz

- **Odvolat svůj přístup:** `/rizeni-firmy/asistent` › Odvolat, nebo odpojit konektor v ChatGPT.
- **Odpojit všechny najednou:** změnit `MCP_OAUTH_CLIENT_ID` (nebo smazat
  proměnné `MCP_*`) a nasadit. Všechny dosavadní tokeny okamžitě přestanou platit.
- **Přidat kolegu:** jeho userId přidat do `MCP_ALLOWED_USER_IDS` (čárkou).
  Musí mít roli ADMIN nebo EXECUTIVE (`lib/agent/oauthCore.ts`, `AGENT_ROLES`).
  Pro roli EMPLOYEE/obchodník je potřeba nejdřív rozšířit brány domén
  (`crmAuth.ts`, `companyNodeAuth.ts`). Asistent nikdy nesmí víc než účet.
- **Odebrání role** v MojeBegina platí pro asistenta okamžitě, ne až po
  vypršení tokenu.

## Známá omezení a otevřené body

- **Číslo migrace a Google Kalendář:** viz „Kontroly před nasazením“, bod 1.
- **Idempotence a zápis nejsou v jedné transakci:** kdyby spadlo spojení mezi
  zabráním klíče a zápisem, zůstane klíč „nedokončený“ a asistent dostane
  pokyn ověřit stav v MojeBegina. Dvojitý zápis tím vzniknout nemůže.
- **Souhlas nemá pevné datum konce.** Dokud se používá, refresh token se
  obnovuje. Při nepoužívání vyprší po 30 dnech.
- **Denní volání** (fronta `/rizeni-firmy/obchod/dnes`) zatím asistent nečte. Má
  vlastní, užší bránu (konkrétní kurátor/pracovník).
- ChatGPT konektory jsou v Developer Mode beta a OpenAI je mění. Hlášené
  potíže: konektor občas zmizí nebo vyžaduje nové přihlášení.

## Soubory

- `lib/agent/config.ts`: proměnné `MCP_*`, metadata discovery
- `lib/agent/oauthCore.ts`: čisté funkce (PKCE, parametry, `?next=`, role)
- `lib/agent/oauthStore.ts`: souhlasy, kódy, tokeny, odvolání, token → identita
- `lib/agent/context.ts`: identita asistenta pro jedno volání (AsyncLocalStorage)
- `lib/agent/mcp/*`: protokol, nástroje, argumenty, audit a idempotence
- `app/api/mcp`, `app/api/oauth/*`, `app/oauth/authorize`, `app/.well-known/*`
- `app/rizeni-firmy/asistent`: přehled a odvolání
- `drizzle/0022_gpt_mcp_pilot.sql`, `docs/gpt-mcp/*.sql`
- Testy: `lib/agent/__tests__/*` (včetně celého toku nad PGlite),
  `lib/data/__tests__/agentNoteValidation.test.ts`, generálka v
  `lib/eshop/__tests__/productionRehearsal.test.ts`

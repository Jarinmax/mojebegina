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

## Nasazení pilotu (nejdřív Preview)

### 1. Databáze (Neon SQL Editor, větev Preview)

V tomto pořadí, a pokaždé porovnat výsledek s komentářem v souboru:

1. `docs/gpt-mcp/10_before.sql` → očekáváno `0`
2. `docs/gpt-mcp/11_migration.sql` (jedna transakce, při opakování se sám zastaví)
3. `docs/gpt-mcp/12_after.sql` → očekáváno `4 | 4 | 0 | 0`

Návrat: `docs/gpt-mcp/19_rollback.sql`. Nejdřív ale smažte proměnné `MCP_*`.
Pokud už existují poznámky u zákazníků, skript se zastaví, aby se neztratily.

### 2. Proměnné ve Vercelu (Preview)

| Proměnná | Hodnota |
|---|---|
| `MCP_ISSUER` | **stabilní** adresa Preview bez lomítka na konci, např. `https://<branch-alias>.vercel.app`. Běžná Preview URL se mění s každým nasazením a ChatGPT potřebuje pořád stejnou. |
| `MCP_OAUTH_CLIENT_ID` | libovolný název, např. `chatgpt-begina` |
| `MCP_OAUTH_CLIENT_SECRET` | náhodný řetězec, aspoň 32 znaků (`openssl rand -base64 48`) |
| `MCP_ALLOWED_USER_IDS` | userId Jaroslava Vinera. Zjistíte ho dotazem `SELECT user_id FROM user_profiles WHERE email = '<váš e-mail>';` |
| `MCP_OAUTH_REDIRECT_URIS` | callback adresa z ChatGPT (krok 3), přesně jak ji ChatGPT ukáže |

Pozor: Preview s Vercel Deployment Protection ChatGPT nepustí dovnitř. Na
alias pro pilot je potřeba výjimka (nebo pilot rovnou na `moje.begina.cz`).

### 3. ChatGPT (Plus, Developer Mode)

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
3. **Connect** → ChatGPT otevře MojeBegina → přihlásit se svým účtem → na
   souhlasové stránce zvolit roli a zda povolit zápisy → **Povolit**.
4. V chatu zapnout konektor (Developer mode) a zkusit třeba: „Co mám tento týden
   za leady k ozvání?“ nebo „Najdi kavárnu U Lípy a připiš poznámku, že chtějí
   ochutnávku.“ Asistent má před zápisem říct, co a kam zapíše.

Doporučený postup: nejdřív povolit jen čtení. Zápisy zapnout po pár dnech
(odvolat a připojit znovu se zaškrtnutými zápisy).

### 4. Ochrana dat (GDPR)

Odpovědi nástrojů (jména, telefony, e-maily kontaktů, poznámky) odcházejí do
OpenAI. Na ChatGPT Plus proto v Settings › Data controls vypněte
**„Improve the model for everyone“**. Firemní smlouvu o zpracování (DPA)
nabízí OpenAI až u Business/Enterprise. Před rozšířením na kolegy je dobré to
rozhodnout a doplnit do Zásad ochrany osobních údajů.

### 5. Produkce

Stejné kroky 1–3 nad Production DB a s `MCP_ISSUER=https://moje.begina.cz`.
Nejdřív projít pilot na Preview.

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

- **Číslo migrace:** `0022_gpt_mcp_pilot` navazuje na `main`. Větve
  `feature/sklad-1-0` a `feature/google-calendar-1-0` mají vlastní 0021–0023,
  takže kdo se slučuje později, musí migraci přečíslovat (`drizzle-kit generate`
  nad sloučeným schématem). SQL v `docs/gpt-mcp/` na číslu nezávisí.
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

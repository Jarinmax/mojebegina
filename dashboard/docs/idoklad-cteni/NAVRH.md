# Čtení iDokladu přes MojeBegina pro Lucy (ChatGPT) a Claude — návrh a stav

Návrh 23. 10. 2026. Nic nenasazeno, migrace 0023 nespuštěna, ostrá fakturace beze změny.

## Cíl

Lucy (ChatGPT) i Claude si samy načtou údaje z iDokladu (faktury, řady, audit
číslování, neuhrazené) **bez přeposílání screenshotů** — jen čtením, pod účtem
oprávněné osoby, s auditní stopou. Jedna implementace iDokladu, žádná druhá integrace.

## Současný stav (prověřeno 23. 10. 2026)

- `main`: žádný MCP server ani API pro asistenty. iDoklad se čte jen ze serveru
  (`lib/eshop/invoicing`: přístupové údaje `IDOKLAD_ESHOP_*` jen ve Vercelu, HTTP klient
  s pojistkou zápisů, preflight, audit číslování na stránce Kontrola připojení iDokladu).
- **PR #21 (Draft, neslučovat)** — „ChatGPT ↔ MojeBegina: pilot MCP + OAuth“:
  - `/api/mcp` (bezstavový MCP server) + OAuth 2.1 (PKCE, statický klient z env,
    allowlist uživatelů `MCP_ALLOWED_USER_IDS`, role z DB při každém volání),
  - identita asistenta přes `AsyncLocalStorage` v `getAuthContext()` — stávající brány
    platí beze změny,
  - nástroje CRM a mapy firmy, zápisy za `MCP_ALLOW_WRITE` (výchozí vypnuto),
    audit `agent_audit_log`, limity,
  - **jeden OAuth klient** (`MCP_OAUTH_CLIENT_ID`), víc redirect URI povoleno,
  - migrace 0022/0023 v PR #21 se musí přečíslovat (kolize s `main`).
  - Tento PR do větve PR #21 **nesahá**.
- Claude Code v cloudu: síťová politika prostředí neumožňuje `moje.begina.cz`
  ani `api.idoklad.cz` (403). Přímé volání MojeBegina z cloudu proto není cesta.

## Zvolené řešení: jedno jádro, jeden MCP server, dva klienti

```
 Lucy (ChatGPT, MCP konektor) ─┐                         ┌─ UI MojeBegina (stránka iDoklad)
                               ├─ /api/mcp (PR #21) ─┐   │
 Claude (claude.ai konektor) ──┘   OAuth = osoba     │   │
   → i v Claude Code sessions                        ▼   ▼
                                     lib/idoklad-read/tools.ts  runIdokladRead()
                                       1 argumenty  2 oprávnění osoby  3 kanál
                                       4 limit  5 audit PŘED čtením  6 čtení
                                                     │
                                     lib/idoklad-read/service.ts (hledání, detail,
                                       řady, audit, neuhrazené) — jen get/list
                                                     │
                                     lib/eshop/invoicing/idokladHttp.ts
                                       (stávající klient, writesAllowed: false,
                                        povolené jen GET cesty, údaje jen na serveru)
                                                     │
                                                 iDoklad API v3
```

- **Jádro (tento PR):** `lib/idoklad-read/` — služby, katalog 5 nástrojů, společný
  runner, auditní tabulka `idoklad_read_log` (migrace 0023), čas v pražském pásmu.
  Stávající audit číslování v UI běží přes stejný runner (zapisuje se do auditu).
- **MCP (navazující krok v PR #21, ne zde):** registrace jedním řádkem
  `...idokladAgentTools(defineTool, () => currentAgentChannel())` z `lib/idoklad-read/mcp.ts`.
- **Claude:** stejný `/api/mcp` jako vlastní konektor v claude.ai (Nastavení →
  Konektory → Přidat vlastní konektor, URL `https://moje.begina.cz/api/mcp`,
  OAuth Client ID / Secret v pokročilém nastavení). Konektor je pak dostupný v Claude
  i v Claude Code sessions (konektory se načtou při startu session). Volání jdou přes
  infrastrukturu Anthropicu, ne ze sítě cloudového prostředí — síťovou politiku není
  třeba měnit. Pro místní Claude Code CLI: `claude mcp add --transport http
  mojebegina https://moje.begina.cz/api/mcp` (OAuth v prohlížeči).

## Nástroje (jen čtení)

| Nástroj | Co vrací |
|---|---|
| `idoklad_search_invoices` | Faktury podle čísla, IČO, nebo v období (≤ 366 dní) podle VS / části jména odběratele; jen neuhrazené. Souhrn: číslo, řada (podle formátu), odběratel, částka, stav úhrady, data (vystavení, DUZP, splatnost, úhrada), vytvoření v pražském čase. |
| `idoklad_get_invoice` | Detail: řada ověřená v iDokladu, odběratel (název, IČO, DIČ; sídlo jen u firmy), položky, částka a uhrazeno, data, vytvoření a poslední změna (pražský čas), o kolik dní po datu vystavení doklad vznikl. |
| `idoklad_list_series` | Řady vydaných faktur, za rok počet, první/poslední číslo, duplicity a mezery. |
| `idoklad_numbering_audit` | Úplný audit za rok (číslování + datování) v pražském čase, u vybraných čísel detail. |
| `idoklad_unpaid_and_discrepancies` | Neuhrazené (po splatnosti první) a nesrovnalosti: částečně / přeplaceno, úhrada u neuhrazené, zpětně vystavené, nesoulad s fakturami z MojeBegina. |

Data a čas: `DateCreated` vrací iDoklad v UTC (ověřeno na 9260001), porovnává se v pražském
čase; `1753-01-01` = nevyplněné datum (oficiální SDK ho převádí na null) → `null`.

## Bezpečnostní kontrola

| Požadavek | Jak je splněn | Test |
|---|---|---|
| Jen čtení | Klient `writesAllowed: false` (zápis by zablokovala i brána); služby dostanou jen `get`/`list`; povolené jen GET cesty (`READ_PATHS`); v katalogu žádný zápisový nástroj; žádné PDF, e-maily, úhrady | volání jen GET; neznámý nástroj „idoklad_issue_invoice“ odmítnut |
| Jen oprávnění | Osoba z `getAuthContext()` (u MCP ta, která udělila OAuth souhlas) musí být vystavovatel faktur (Jaroslav Viner, Lucie Königsbergová s aktivní rolí); asistent navíc jen v povoleném kanálu `IDOKLAD_READ_CHANNELS` (výchozí žádný) + allowlist uživatelů v PR #21 | cizí osoba, bez role, nepřihlášený, nepovolený kanál → odmítnuto, iDoklad nevolán |
| Audit | `idoklad_read_log`: kdo, kanál, nástroj, argumenty bez osobních údajů (jméno zákazníka jen délka), stav, počet výsledků, počet požadavků, doba, chyba. Zápis PŘED čtením — bez zápisu se nečte | audit u každého stavu; bez DB → „čtení zablokované“ |
| Tajné klíče | Přístupové údaje iDokladu jen v env serveru; do odpovědi ani logu se nedostanou (redakce v klientovi, průběh požadavků se nevrací) | v odpovědi ani auditu žádný token / údaj |
| Limity API | 20 volání/min a 300/h na osobu; nejvýš 60 požadavků na iDoklad za volání; hledání nejvýš 10 stran po 100 a 366 dní; nejvýš 100 výsledků; opakování jen u čtení (stávající klient) | limit → „rate_limited“ bez volání iDokladu |
| Osobní údaje | Odběratel jen název/jméno, IČO, DIČ, obec; ulice a PSČ jen u firmy; nikdy e-mail, telefon, účet; popis nástrojů upozorňuje na důvěrnost | v odpovědi není e-mail, telefon, účet ani ulice osoby |
| Rozpracované MCP | Větev PR #21 beze změny; adaptér je samostatný soubor, typ `defineTool` se neimportuje | — |

Zbývající rizika: ~~v PR #21 je jeden OAuth klient~~ — vyřešeno v navazujícím PR k #21
(24. 10. 2026): klienti ChatGPT a Claude zvlášť, kanál `mcp:chatgpt` / `mcp:claude`
z ověřeného tokenu, nástroje skryté bez `IDOKLAD_READ_CHANNELS`; obsah faktur
(popisy, položky) je text od lidí — asistent ho má brát jako data, ne pokyny (nástroje jsou
jen ke čtení, zápis tudy neprojde).

## Proměnné prostředí (Production, až po schválení)

- `IDOKLAD_READ_CHANNELS=mcp:chatgpt,mcp:claude` — povolení asistentů (bez ní jen UI).
- stávající `IDOKLAD_ESHOP_CLIENT_ID / _CLIENT_SECRET / _APPLICATION_ID` — beze změny.

## Postup (každý krok jen se souhlasem)

1. Sloučit PR #27 + #28 (tento PR na nich stojí — složené filtry iDokladu).
2. Neon main: `docs/idoklad-cteni/10_pred.sql` → `ne | ano`; `11_migrace_0023.sql`;
   `12_po.sql` → `ano | 0 | 2`. Návrat jen bez záznamů: `19_navrat.sql`.
3. Sloučit tento PR, nasadit — UI audit číslování teď zapisuje do `idoklad_read_log`.
4. PR #21 (samostatně, se souhlasem; připraveno 24. 10. 2026, migrace pilotu 0024/0025): přečíslovat migrace, registrovat
   `idokladAgentTools`, seznam OAuth klientů (`chatgpt`, `claude`) a kanál podle klienta,
   redirect pro Claude `https://claude.ai/api/mcp/auth_callback` (ověřit v nastavení konektoru).
5. Preview → Production podle `GPT_MCP_PILOT.md` (PR #21), `MCP_ALLOW_WRITE` nenastavovat.
6. Konektor v ChatGPT (Lucy) a v claude.ai (Claude) — každý pod svým účtem MojeBegina.

## Cílový test

- Lucy (ChatGPT) i Claude: „Načti fakturu 9260001 z iDokladu“ → `idoklad_get_invoice`
  → řada E-shop Begina (7277293), vystaveno 19. 10. 2026, vytvořeno 20. 10. 2026 12:13:30,
  12 647 Kč, uhrazeno 19. 10.; „Spusť audit číslování za rok 2026“ → `idoklad_numbering_audit`.
- V `idoklad_read_log` dva záznamy na volání s kanály `mcp:chatgpt` a `mcp:claude`.
- Ověřeno automatickým testem nad PGlite a napodobeninou iDokladu
  (`lib/idoklad-read/__tests__/idokladRead.test.ts`); živé ověření až po krocích 2–6.

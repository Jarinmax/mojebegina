# Google Kalendář 1.0: postup nasazení

Stav: **PŘIPRAVENO, NESPUŠTĚNO.** V Production DB nic nezměněno a nic nenasazeno.
Integrace podle `ETAPA0_INTEGRACE_VETVI.md`, krok A. Každý krok v Production
schvaluje vedení samostatně.

## Co se nasazuje

- **Migrace 0025:** dvě nové tabulky (`google_calendar_connections`,
  `lead_calendar_sync`). Nic existujícího se nemění. Stávající kód s novým
  schématem funguje dál.
- **Převod K8:** 16 starých termínů uložených jako „jen datum“ (12:00 UTC) se převede na
  09:00 Europe/Prague téhož dne. Zálohuje se a jde vrátit.
- **Kód:**
  - propojení Google účtu Jaroslava Blahouta a synchronizace Dalšího kontaktu;
  - jednotná pravidla termínu: bez času = 09:00; prázdné pole termín nemění; smazání jen výslovně;
  - MCP `set_lead_next_step` s `follow_up_time` a `clear_follow_up`.

## Pořadí (Neon SQL Editor, vždy nejdřív Preview větev, pak Production `main`)

| # | Soubor | Očekáváno v Production |
|---|---|---|
| 1 | `10_pred.sql` | `0 \| ano` |
| 2 | `11_migrace_0025.sql` | NOTICE „tabulky … založeny“ |
| 3 | `12_po.sql` | `2 \| 0 \| 0 \| 1` |
| 4 | `20_terminy_pred.sql` | `16 \| 16 \| 0 \| ne` (stav 26. 10. 2026; před spuštěním znovu ověřit) |
| 5 | `21_terminy_prevod.sql` | NOTICE „převedeno 16 termínů“ |
| 6 | `22_terminy_po.sql` | `16 \| 0 \| 16 \| 0` |
| 7 | **nasazení kódu** (sloučení PR do `main` → Vercel) | — |
| 8 | propojení Google účtu (Jaroslav Blahout, Denní volání → „Propojit Google Kalendář“) | po propojení se automaticky dosynchronizují všechny aktivní termíny |

**Krok 5 musí proběhnout před krokem 7.** Převod se sám zastaví, jakmile nový kód zapíše
první řádek do `lead_calendar_sync`. Od té chvíle by termín 13:00 v zimě (= 12:00 UTC)
nešel bezpečně odlišit od starého zápisu.

## Proměnné prostředí (Vercel → Production, před krokem 7)

| Proměnná | Hodnota |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | z Google Cloud Console (OAuth klient typu „Web application“) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | dtto |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://moje.begina.cz/api/google-calendar/callback` |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | 32 náhodných bajtů v base64 (`openssl rand -base64 32`). **Uložit bezpečně:** při ztrátě je nutné nové propojení. |

`NEXT_PUBLIC_APP_URL` **není potřeba**. Návratová adresa a odkazy v událostech používají
`getAppOrigin()`, který v Production vrací `https://moje.begina.cz`.

Bez těchto proměnných a bez propojení aplikace funguje beze změny. Synchronizace zůstává
ve stavu „čeká“ a nehlásí chybu.

## Google Cloud Console

1. Zapnout **Google Calendar API**.
2. OAuth consent screen: typ podle účtu Beginy (Internal pro Workspace, jinak External
   s testovacím uživatelem Blahoutova účtu). Scope **jen**
   `https://www.googleapis.com/auth/calendar.app.created`. Aplikace tak vidí jen
   kalendář „MojeBegina – volání“, který sama založí, nikdy osobní kalendář.
3. Authorized redirect URI: `https://moje.begina.cz/api/google-calendar/callback`
   (pro Preview i adresa Preview nasazení).

## Ověření po nasazení

- **Detail leadu → zápis po hovoru:**
  - datum bez času → „Další kontakt: … 9:00“;
  - prázdné datum termín nemění;
  - „Odstranit naplánovaný kontakt“ termín smaže.
- **Denní volání:** totéž. Termín smaže jen zaškrtnuté „Smazat naplánovaný další kontakt“.
- **Po propojení:** v Google Kalendáři „MojeBegina – volání“ jsou události aktivních leadů.
  Změna termínu událost přesune, uzavření leadu ji smaže.
- **ChatGPT/MCP:** `set_lead_next_step` s datem bez času → 9:00; `clear_follow_up` termín smaže.

## Návrat

1. Kód: revert PR (Vercel → předchozí nasazení).
2. Termíny: `29_terminy_navrat.sql`. Vrátí jen termíny, které od převodu nikdo nezměnil.
3. Migrace: zrušit přístup aplikace v Google účtu, označit propojení
   `revoked_at`, pak `19_navrat.sql`.

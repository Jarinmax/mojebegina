# Google Kalendář: upozornění na hovory v mobilu Jardy

Zadání 10. 11. 2026: když nastane termín „Ozvat se později“, má Jardovi
(Android, účet `jaroslavblahout@begina.cz`) pípnout mobil s telefonním číslem.
Událost má upozornění **60 min předem, 5 min předem a v čase hovoru**.

Je jen jedno pole s časem: **„Další kontakt“** (datum i hodina). Řídí frontu Denního
volání, kalendář, sekci „Naplánované hovory dnes“ na /prace i ranní souhrnné upozornění
z webu (PR #170, Vercel Cron, potřebuje VAPID klíče a `CRON_SECRET`). Dřívější
samostatné pole „Přesný čas hovoru“ (`leads.scheduled_call_at`) se od 13. 11. 2026
nepoužívá.

## Co se stane při nasazení (automaticky, `scripts/migrate-google-calendar.mjs` v prebuild)

V jedné transakci proběhne:
1. **Migrace 0038:** nové tabulky `google_calendar_connections` a `lead_calendar_sync`.
2. **Převod starých termínů** (`21_terminy_prevod.sql`): termíny uložené dřív jako
   „jen datum“ (12:00 UTC) se převedou na **09:00** téhož dne.
   - 10. 11. 2026 jich bylo 38.
   - Záloha je v tabulce `lead_follow_up_k8_backup`.
   - Převod proběhne jen jednou, spolu s vytvořením tabulek.

Potom samostatně proběhne **migrace 0039**: `daily_call_queue.resulting_activity_id` (Denní volání 1.1).

Při jakékoli chybě se transakce vrátí, build skončí a dál běží dosavadní verze.

Bez proměnných prostředí a bez propojení funguje aplikace jako dřív (s výběrem hodiny).
Synchronizace jen čeká.

## 1. Google Cloud Console (console.cloud.google.com)

1. Vytvořit projekt, např. „MojeBegina“.
2. **APIs & Services → Library → Google Calendar API → Enable.**
3. **OAuth consent screen (Google Auth Platform → Branding / Audience):**
   - Typ uživatelů:
     - **Internal**, pokud begina.cz běží na Google Workspace;
     - jinak **External**.
   - Název aplikace „MojeBegina“, kontaktní e-mail.
   - **Data access / Scopes:** přidat **jen** `https://www.googleapis.com/auth/calendar.app.created`.
     Aplikace tak vidí jen kalendář „MojeBegina – volání“, který sama založí, nikdy osobní kalendář.
   - U typu External: **Audience → Publish app (In production).**
     - Ve stavu „Testing“ by propojení každých 7 dní přestalo fungovat.
     - Aplikace bez ověření Googlem při přihlášení ukáže varování „Google tuto aplikaci
       neověřil“. Jarda klepne na **Rozšířené → Přejít do MojeBegina**.
4. **Credentials (Clients) → Create OAuth client ID → Web application:**
   - Authorized redirect URI: `https://moje.begina.cz/api/google-calendar/callback`.
   - Zkopírovat **Client ID** a **Client secret**. Nikam je neposílat, jen do Vercelu.

## 2. Vercel → mojebegina → Settings → Environment Variables (Production)

| Proměnná | Hodnota |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID z kroku 1.4 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client secret z kroku 1.4 |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://moje.begina.cz/api/google-calendar/callback` |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | 32 náhodných bajtů v base64 (`openssl rand -base64 32`). Uložit bezpečně, při ztrátě je nutné nové propojení. |

Pak **Redeploy** produkce.

## 3. Propojení (Jarda v mobilu)

1. Na moje.begina.cz otevřít **Řízení firmy → Obchod → Dnešní volání → Propojit Google Kalendář**.
2. Přihlásit se účtem `jaroslavblahout@begina.cz` a povolit přístup.
3. Po propojení se automaticky založí kalendář „MojeBegina – volání“ a do něj všechny aktivní termíny.

## 4. Mobil s Androidem

1. Mít aplikaci **Google Kalendář** a v ní účet `jaroslavblahout@begina.cz`.
2. V menu (☰) mít zaškrtnutý kalendář **„MojeBegina – volání“**.
3. **Nastavení telefonu → Aplikace → Kalendář Google → Oznámení:** povolená.
   Pro spolehlivost vypnout pro Kalendář omezení baterie.
4. Test: u kontaktu nastavit „Další kontakt“ za 10 minut. Za 5 minut mobil pípne
   „📞 Zavolat: jméno · číslo“. Klepnutí otevře událost, klepnutí na číslo vytáčí.

## Ověření po nasazení

- **Detail kontaktu i Denní volání:**
  - datum bez času → 9:00;
  - prázdné datum termín nemění;
  - smazání termínu jen výslovnou volbou.
- **Po propojení:** změna termínu událost přesune; smazání termínu nebo uzavření kontaktu
  (Nezájem, Převeden) ji smaže.
- **ChatGPT/MCP:** `set_lead_next_step` s datem bez času → 9:00; `clear_follow_up` termín smaže.

## Návrat

1. Kód: revert PR (Vercel → předchozí nasazení).
2. Termíny: `29_terminy_navrat.sql` vrátí jen termíny, které od převodu nikdo nezměnil.
3. Propojení: zrušit přístup aplikace v Google účtu, pak `19_navrat.sql`.

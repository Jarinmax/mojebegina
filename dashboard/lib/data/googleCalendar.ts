// Security Phase 20 (Google Kalendář 1.0) — server-only wiring na Google
// Calendar API a šifrované uložení refresh tokenu. Kontrola a zápis jsou
// neoddělitelné, stejný princip jako dailyCalls.ts/orders.ts — každá
// exportovaná funkce si sama volá požadovanou googleCalendarAuth kontrolu.
//
// Čistá rozhodovací logika (resolveReconcileAction, createOrPatchEvent,
// pragueDateTimeToUtc, šifrování) žije v googleCalendarValidation.ts a
// googleCalendarCrypto.ts (bez "server-only", testovatelné bez DB/sítě) —
// tenhle soubor jen DODÁVÁ skutečné DB čtení/zápisy a skutečný Google
// klient těm čistým funkcím, stejný vzor jako buildLogDailyCallOutcomeQuery
// v dailyCallsValidation.ts / dailyCalls.ts.
import "server-only";
import { randomBytes } from "crypto";
import { google, calendar_v3 } from "googleapis";
import { CodeChallengeMethod } from "google-auth-library";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { googleCalendarConnections, leadCalendarSync, leads, leadActivity } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import {
  requireGoogleCalendarConnectAccess,
  requireGoogleCalendarStatusAccess,
  GOOGLE_CALENDAR_CONNECT_USER_ID,
} from "./googleCalendarAuth";
import { encryptToken, decryptToken } from "./googleCalendarCrypto";
import { leadDisplayName, type LeadStage } from "./leadValidation";
import {
  effectiveNextFollowUpAt,
  resolveReconcileAction,
  createOrPatchEvent,
  buildGoogleEventId,
  buildEventTitle,
  buildEventDescription,
  buildReminderMinutes,
  EVENT_DURATION_MINUTES,
  GoogleConflictError,
  type GoogleCalendarClient,
  type CalendarEventInput,
  type SyncStatus,
} from "./googleCalendarValidation";

const SECONDARY_CALENDAR_NAME = "MojeBegina – volání";
const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "openid",
  "email",
];
const MAX_ERROR_LENGTH = 300;

function getEncryptionKey(): string {
  const key = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY není nastavený.");
  }
  return key;
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth proměnné prostředí nejsou kompletní.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// --- Zahájení OAuth propojení (jen Blahout sám) -----------------------------
//
// state je kryptograficky náhodný a svázaný s přihlášeným userId a
// expirací — route handler ho uloží do krátkodobé httpOnly cookie a při
// callbacku ověří shodu PŘED výměnou kódu za token (CSRF ochrana). PKCE
// (code_verifier/code_challenge) jde stejnou cestou — knihovna ho umí
// vygenerovat (generateCodeVerifierAsync), route handler uloží
// codeVerifier do téže cookie.
export type OAuthFlightState = {
  state: string;
  codeVerifier: string;
  userId: string;
  expiresAt: number;
};

export async function beginGoogleCalendarConnect(): Promise<{ url: string; flight: OAuthFlightState }> {
  const ctx = await getAuthContext();
  const authorized = requireGoogleCalendarConnectAccess(ctx);

  const client = getOAuthClient();
  const state = randomBytes(32).toString("base64url");
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();

  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // vynutí refresh_token i při opakovaném souhlasu
    scope: OAUTH_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });

  return {
    url,
    flight: {
      state,
      codeVerifier,
      userId: authorized.userId,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minut
    },
  };
}

export type OAuthCallbackResult = { ok: true } | { ok: false; error: string };

// Volá route handler PO ověření, že `returnedState` odpovídá uložené
// `flight.state`, `flight` nevypršela a `ctx.userId === flight.userId` —
// tahle funkce to ověřuje ZNOVU jako druhou nezávislou pojistku, protože
// nikdy nedůvěřuje jen tomu, co prošlo route handlerem.
export async function completeGoogleCalendarConnect(
  flight: OAuthFlightState,
  returnedState: string,
  code: string
): Promise<OAuthCallbackResult> {
  const ctx = await getAuthContext();
  const authorized = requireGoogleCalendarConnectAccess(ctx);

  if (flight.expiresAt < Date.now()) {
    return { ok: false, error: "Propojení vypršelo, zkuste to prosím znovu." };
  }
  if (flight.state !== returnedState || flight.userId !== authorized.userId) {
    return { ok: false, error: "Neplatný stav propojení (state nesedí)." };
  }

  const client = getOAuthClient();
  let refreshToken: string;
  let email: string;
  try {
    const { tokens } = await client.getToken({ code, codeVerifier: flight.codeVerifier });
    if (!tokens.refresh_token) {
      return { ok: false, error: "Google nevrátil refresh token — zkuste propojení znovu (odpojte předchozí přístup v účtu Google, pokud existuje)." };
    }
    refreshToken = tokens.refresh_token;
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ auth: client, version: "v2" });
    const me = await oauth2.userinfo.get();
    if (!me.data.email) {
      return { ok: false, error: "Google nevrátil e-mail účtu." };
    }
    email = me.data.email;
  } catch {
    // Nikdy nelogovat/neukládat syrovou chybu — mohla by obsahovat kód
    // nebo token. Obecná zpráva stačí, uživatel akci jen zopakuje.
    return { ok: false, error: "Výměna autorizačního kódu za token selhala." };
  }

  let calendarId: string;
  try {
    calendarId = await createSecondaryCalendar(client);
  } catch {
    return { ok: false, error: "Vytvoření kalendáře „MojeBegina – volání“ v Google účtu selhalo." };
  }

  const encryptedToken = encryptToken(refreshToken, getEncryptionKey());

  await db
    .insert(googleCalendarConnections)
    .values({
      userId: authorized.userId,
      googleAccountEmail: email,
      googleCalendarId: calendarId,
      refreshTokenEncrypted: encryptedToken,
      grantedScopes: OAUTH_SCOPES.join(" "),
      revokedAt: null,
    })
    .onConflictDoUpdate({
      target: googleCalendarConnections.userId,
      set: {
        googleAccountEmail: email,
        googleCalendarId: calendarId,
        refreshTokenEncrypted: encryptedToken,
        grantedScopes: OAUTH_SCOPES.join(" "),
        connectedAt: new Date(),
        revokedAt: null,
      },
    });

  return { ok: true };
}

async function createSecondaryCalendar(authClient: InstanceType<typeof google.auth.OAuth2>): Promise<string> {
  const calendar = google.calendar({ version: "v3", auth: authClient });
  const res = await calendar.calendars.insert({ requestBody: { summary: SECONDARY_CALENDAR_NAME } });
  if (!res.data.id) {
    throw new Error("Google nevrátil id nového kalendáře.");
  }
  return res.data.id;
}

// --- Stav propojení (čte Viner i Blahout) -----------------------------------

export type ConnectionStatus =
  | { connected: false }
  | { connected: true; googleAccountEmail: string; connectedAt: Date };

export async function getGoogleCalendarConnectionStatus(): Promise<ConnectionStatus> {
  const ctx = await getAuthContext();
  requireGoogleCalendarStatusAccess(ctx);

  const [row] = await db
    .select({
      googleAccountEmail: googleCalendarConnections.googleAccountEmail,
      connectedAt: googleCalendarConnections.connectedAt,
      revokedAt: googleCalendarConnections.revokedAt,
    })
    .from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.userId, GOOGLE_CALENDAR_CONNECT_USER_ID))
    .limit(1);

  if (!row || row.revokedAt !== null) {
    return { connected: false };
  }
  return { connected: true, googleAccountEmail: row.googleAccountEmail, connectedAt: row.connectedAt };
}

// --- Autorizovaný klient pro reconcile ---------------------------------------

async function getAuthorizedClientForOwner(): Promise<
  { ok: true; client: InstanceType<typeof google.auth.OAuth2>; calendarId: string } | { ok: false }
> {
  const [row] = await db
    .select()
    .from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.userId, GOOGLE_CALENDAR_CONNECT_USER_ID))
    .limit(1);

  if (!row || row.revokedAt !== null) {
    return { ok: false };
  }

  const refreshToken = decryptToken(row.refreshTokenEncrypted, getEncryptionKey());
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return { ok: true, client, calendarId: row.googleCalendarId };
}

function isConflictError(err: unknown): boolean {
  const code = (err as { code?: number | string } | undefined)?.code;
  const status = (err as { response?: { status?: number } } | undefined)?.response?.status;
  return code === 409 || code === "409" || status === 409;
}

function toCalendarResource(event: CalendarEventInput): calendar_v3.Schema$Event {
  const endUtc = new Date(event.startUtc.getTime() + event.durationMinutes * 60000);
  return {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.startUtc.toISOString(), timeZone: "Europe/Prague" },
    end: { dateTime: endUtc.toISOString(), timeZone: "Europe/Prague" },
    reminders: {
      useDefault: false,
      overrides: event.reminderMinutes.map((minutes) => ({ method: "popup", minutes })),
    },
  };
}

function buildRealClient(authClient: InstanceType<typeof google.auth.OAuth2>): GoogleCalendarClient {
  const calendar = google.calendar({ version: "v3", auth: authClient });
  return {
    async insertEvent(calendarId, eventId, event) {
      try {
        await calendar.events.insert({
          calendarId,
          requestBody: { id: eventId, ...toCalendarResource(event) },
        });
      } catch (err) {
        if (isConflictError(err)) {
          throw new GoogleConflictError("event already exists");
        }
        throw err;
      }
    },
    async patchEvent(calendarId, eventId, event) {
      await calendar.events.patch({ calendarId, eventId, requestBody: toCalendarResource(event) });
    },
    async deleteEvent(calendarId, eventId) {
      try {
        await calendar.events.delete({ calendarId, eventId });
      } catch (err) {
        // 410/404 = událost už neexistuje (dřívější úspěšné smazání, jen
        // se to nestihlo zapsat do DB) — pro "smazat" je to stejně
        // úspěšný výsledek, ne chyba k zopakování.
        const status = (err as { response?: { status?: number } } | undefined)?.response?.status;
        if (status !== 404 && status !== 410) {
          throw err;
        }
      }
    },
  };
}

// --- Reconcile ----------------------------------------------------------------
//
// V TÉŽE db.batch() operaci, která mění leads.next_follow_up_at nebo
// leads.stage, se musí nejdřív zavolat upsertPendingLeadCalendarSync(leadId)
// (viz níže) — teprve PO úspěšném commitu té operace se volá tahle funkce.
// Selhání tady NIKDY nevrací zpět už commitnutý CRM zápis (volající ji
// obaluje v try/catch, stejný princip jako logDailyCallOutcomeAction).
export async function reconcileLeadCalendarEvent(leadId: string): Promise<void> {
  const [lead] = await db
    .select({
      stage: leads.stage,
      nextFollowUpAt: leads.nextFollowUpAt,
      companyName: leads.companyName,
      contactName: leads.contactName,
      contactEmail: leads.contactEmail,
      contactPhone: leads.contactPhone,
    })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!lead) return;

  const [syncRow] = await db.select().from(leadCalendarSync).where(eq(leadCalendarSync.leadId, leadId)).limit(1);
  const current = effectiveNextFollowUpAt(lead.stage as LeadStage, lead.nextFollowUpAt);
  const syncStatus = (syncRow?.syncStatus ?? "pending") as SyncStatus;

  const action = resolveReconcileAction({
    currentNextFollowUpAt: current,
    syncedNextFollowUpAt: syncRow?.syncedNextFollowUpAt ?? null,
    googleEventId: syncRow?.googleEventId ?? null,
    syncStatus,
  });

  if (action === "noop") return;

  const owner = await getAuthorizedClientForOwner();
  if (!owner.ok) {
    await markSyncFailed(leadId, "Google Kalendář není propojen.");
    return;
  }

  const client = buildRealClient(owner.client);
  const eventId = buildGoogleEventId(leadId);
  const [lastNoteRow] = await db
    .select({ body: leadActivity.body })
    .from(leadActivity)
    .where(eq(leadActivity.leadId, leadId))
    .orderBy(desc(leadActivity.createdAt))
    .limit(1);

  try {
    if (action === "delete") {
      await client.deleteEvent(owner.calendarId, eventId);
      await markSyncSynced(leadId, null, null);
      return;
    }

    if (!current) return; // create/update vždy mají current != null

    const event: CalendarEventInput = {
      summary: buildEventTitle(
        leadDisplayName({
          companyName: lead.companyName,
          contactName: lead.contactName,
          contactEmail: lead.contactEmail,
          contactPhone: lead.contactPhone,
        })
      ),
      description: buildEventDescription({
        contactPhone: lead.contactPhone,
        note: lastNoteRow?.body ?? null,
        leadUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/rizeni-firmy/obchod/leady/${leadId}`,
      }),
      startUtc: current,
      durationMinutes: EVENT_DURATION_MINUTES,
      reminderMinutes: buildReminderMinutes(current),
    };

    await createOrPatchEvent(client, owner.calendarId, eventId, event);
    await markSyncSynced(leadId, eventId, current);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Neznámá chyba";
    await markSyncFailed(leadId, message);
  }
}

async function markSyncSynced(leadId: string, googleEventId: string | null, syncedAt: Date | null): Promise<void> {
  await db
    .update(leadCalendarSync)
    .set({ syncStatus: "synced", googleEventId, syncedNextFollowUpAt: syncedAt, lastError: null, updatedAt: new Date() })
    .where(eq(leadCalendarSync.leadId, leadId));
}

async function markSyncFailed(leadId: string, error: string): Promise<void> {
  // Bezpečně zkrácená, obecná zpráva — nikdy syrová výjimka/token/kód.
  const safeMessage = error.slice(0, MAX_ERROR_LENGTH);
  await db
    .update(leadCalendarSync)
    .set({ syncStatus: "failed", lastError: safeMessage, updatedAt: new Date() })
    .where(eq(leadCalendarSync.leadId, leadId));
}

// Volající (dailyCalls.ts/leads.ts) tohle vloží do SVÉHO db.batch() pole
// vedle zápisu nextFollowUpAt/stage — ON CONFLICT upsert, aby fungoval i
// pro lead, co dosud žádný sync řádek nemá.
export function upsertPendingLeadCalendarSync(leadId: string) {
  return db
    .insert(leadCalendarSync)
    .values({ leadId, syncStatus: "pending", updatedAt: new Date() })
    .onConflictDoUpdate({
      target: leadCalendarSync.leadId,
      set: { syncStatus: "pending", updatedAt: new Date() },
    });
}

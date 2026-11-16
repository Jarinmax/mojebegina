// Čtení Google tabulky servisním účtem Google (jen ke čtení, scope
// spreadsheets.readonly) — pro import leadů z Mety. Tabulku stačí nasdílet
// e-mailu servisního účtu jako „Čtenář“; k ničemu jinému účet přístup nemá.
//
// Klíč servisního účtu je JEN v proměnné prostředí GOOGLE_SERVICE_ACCOUNT_KEY
// na Vercelu (obsah staženého JSON souboru, případně v base64) — nikdy v kódu.
// Bez ní se import tiše přeskočí (stav „nenastaveno“).
import "server-only";
import { createSign } from "node:crypto";

type ServiceAccountKey = { client_email: string; private_key: string };

export function serviceAccountKey(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return null;
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const parsed = JSON.parse(json) as Partial<ServiceAccountKey>;
  if (!parsed.client_email || !parsed.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY: chybí client_email nebo private_key.");
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

async function accessToken(key: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 600,
    })
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google přihlášení servisního účtu selhalo (${res.status}).`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Google nevrátil přístupový token.");
  return body.access_token;
}

/** Hodnoty z rozsahu (např. „A:Z“ = první list). 403/404 = tabulka není nasdílená servisnímu účtu. */
export async function readSheetValues(key: ServiceAccountKey, spreadsheetId: string, range: string): Promise<unknown[][]> {
  const token = await accessToken(key);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 403 || res.status === 404) {
    throw new Error(`Tabulka není dostupná (${res.status}) — je nasdílená e-mailu servisního účtu ${key.client_email}?`);
  }
  if (!res.ok) throw new Error(`Čtení tabulky selhalo (${res.status}).`);
  const body = (await res.json()) as { values?: unknown[][] };
  return body.values ?? [];
}

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

/**
 * Klíč z proměnné prostředí. Snese, jak se hodnota do Vercelu typicky vloží:
 * celý JSON soubor, JSON v uvozovkách (i jako escapovaný řetězec), base64,
 * neviditelný znak BOM na začátku, private_key se zapsanými „\n“.
 * Chybová hláška nikdy neobsahuje obsah klíče.
 */
export function serviceAccountKey(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw || !raw.trim()) return null;
  return parseServiceAccountKey(raw);
}

const INVALID = "Klíč GOOGLE_SERVICE_ACCOUNT_KEY na Vercelu není obsah JSON souboru servisního účtu — vložte celý obsah staženého souboru (začíná znakem { a končí }) a znovu nasaďte (Redeploy).";

export function parseServiceAccountKey(raw: string): ServiceAccountKey {
  let text = raw.replace(/^\uFEFF/, "").trim();
  // Hodnota vložená i s názvem proměnné („GOOGLE_SERVICE_ACCOUNT_KEY={…}“).
  text = text.replace(/^[A-Z][A-Z0-9_]*\s*=\s*/, "");
  let parsed: unknown;
  for (let attempt = 0; attempt < 4 && parsed === undefined; attempt++) {
    if (text.startsWith("{")) {
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(INVALID);
      }
    } else if (text.startsWith('"') || text.startsWith("'")) {
      // JSON vložený jako řetězec v uvozovkách: "{\"type\": …}" nebo '{…}'
      try {
        const inner = JSON.parse(text);
        text = typeof inner === "string" ? inner.trim() : text.slice(1, -1).trim();
      } catch {
        text = text.replace(/^["']+|["']+$/g, "").trim();
      }
    } else if (text.includes("PRIVATE KEY")) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_KEY obsahuje jen soukromý klíč — na Vercel je potřeba vložit CELÝ obsah staženého souboru .json (začíná znakem { a končí })."
      );
    } else if (/^[A-Za-z0-9+/=_-]+$/.test(text.replace(/\s+/g, ""))) {
      const decoded = Buffer.from(text.replace(/\s+/g, ""), "base64").toString("utf8").replace(/^\uFEFF/, "").trim();
      if (!decoded.startsWith("{")) throw new Error(INVALID);
      text = decoded;
    } else {
      throw new Error(INVALID);
    }
  }
  const key = parsed as Partial<ServiceAccountKey> | undefined;
  if (!key || typeof key !== "object" || !key.client_email || !key.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY: v klíči chybí client_email nebo private_key — je to opravdu JSON klíč servisního účtu?");
  }
  const privateKey = key.private_key.includes("\n") ? key.private_key : key.private_key.replace(/\\n/g, "\n");
  return { client_email: key.client_email, private_key: privateKey };
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

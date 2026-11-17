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

/** E-mail servisního účtu (není tajný) — použije se, když v proměnné je jen soukromý klíč. */
export const DEFAULT_SERVICE_ACCOUNT_EMAIL = "mojebegina-leady@mojebegina.iam.gserviceaccount.com";

const PEM_RE = /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/;
const EMAIL_RE = /[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com/;
const INVISIBLE_RE = /[\uFEFF\u200B-\u200D\u2060\u00A0]/g;

/** Soukromý klíč v tvaru, který Node přijme: tělo bez mezer a uvozovek, řádky po 64 znacích. */
function normalizePem(pem: string): string {
  const header = pem.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----/)![0];
  const footer = header.replace("BEGIN", "END");
  const body = pem.slice(header.length, pem.lastIndexOf("-----END")).replace(/[^A-Za-z0-9+/=]/g, "");
  return `${header}\n${body.match(/.{1,64}/g)!.join("\n")}\n${footer}\n`;
}

/** Bezpečný popis obsahu proměnné pro chybovou hlášku — nikdy ne obsah klíče. */
function describe(raw: string): string {
  const t = raw.replace(INVISIBLE_RE, "").trim();
  const first = t.codePointAt(0);
  const firstLabel = first === undefined ? "nic" : `„${String.fromCodePoint(first)}“ (U+${first.toString(16).toUpperCase().padStart(4, "0")})`;
  return `délka ${t.length} znaků, začíná znakem ${firstLabel}, soukromý klíč: ${PEM_RE.test(t.replace(/\\n/g, "\n")) ? "ano" : "ne"}, e-mail servisního účtu: ${EMAIL_RE.test(t) ? "ano" : "ne"}`;
}

/**
 * Z hodnoty proměnné vytáhne e-mail servisního účtu a soukromý klíč — bez
 * ohledu na to, jak byla vložena: celý JSON soubor (i v uvozovkách, base64,
 * s neviditelnými znaky, s „KLÍČ=“ před hodnotou), řádky zkopírované
 * z náhledu JSON ve Firefoxu, nebo jen samotný soukromý klíč (pak se použije
 * známý e-mail servisního účtu). Chybová hláška nikdy neobsahuje obsah klíče.
 */
export function parseServiceAccountKey(raw: string, fallbackEmail: string = DEFAULT_SERVICE_ACCOUNT_EMAIL): ServiceAccountKey {
  let text = raw.replace(INVISIBLE_RE, "").trim();
  text = text.replace(/^[A-Z][A-Z0-9_]*\s*=\s*/, "");

  // base64 celého souboru
  const compact = text.replace(/\s+/g, "");
  if (!text.includes("{") && !PEM_RE.test(text) && /^[A-Za-z0-9+/=_-]+$/.test(compact)) {
    text = Buffer.from(compact, "base64").toString("utf8").replace(INVISIBLE_RE, "").trim();
  }

  // JSON (i zabalený v uvozovkách nebo s čímkoli okolo)
  const candidates: string[] = [];
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1));
  try {
    const inner = JSON.parse(text);
    if (typeof inner === "string") candidates.unshift(inner);
  } catch {
    // není JSON řetězec
  }
  for (const c of candidates) {
    for (const variant of [c, c.replace(/\\"/g, '"')]) {
      try {
        const obj = JSON.parse(variant) as Partial<ServiceAccountKey>;
        if (obj && typeof obj.private_key === "string" && PEM_RE.test(obj.private_key.replace(/\\n/g, "\n"))) {
          return {
            client_email: typeof obj.client_email === "string" && obj.client_email ? obj.client_email : fallbackEmail,
            private_key: normalizePem(obj.private_key.replace(/\\n/g, "\n").match(PEM_RE)![0]),
          };
        }
      } catch {
        // zkusit další podobu
      }
    }
  }

  // Cokoli jiného (náhled JSON z Firefoxu, jen soukromý klíč…): najít klíč a e-mail v textu.
  const unescaped = text.replace(/\\n/g, "\n");
  const pem = unescaped.match(PEM_RE)?.[0];
  if (pem) {
    return { client_email: text.match(EMAIL_RE)?.[0] ?? fallbackEmail, private_key: normalizePem(pem) };
  }

  throw new Error(
    `V proměnné GOOGLE_SERVICE_ACCOUNT_KEY na Vercelu není klíč servisního účtu (${describe(raw)}). Vložte celý obsah staženého souboru .json a znovu nasaďte (Redeploy).`
  );
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
  if (!res.ok) {
    // Google vrací jen kód a popis chyby (nic tajného), např. invalid_grant / Invalid JWT Signature.
    let reason = "";
    try {
      const err = (await res.json()) as { error?: string; error_description?: string };
      reason = [err.error, err.error_description].filter(Boolean).join(": ");
    } catch {
      // bez těla
    }
    throw new Error(
      `Google odmítl přihlášení servisního účtu ${key.client_email} (${res.status}${reason ? ` – ${reason}` : ""}). Je klíč aktuální (nesmazaný) a patří tomuto účtu?`
    );
  }
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

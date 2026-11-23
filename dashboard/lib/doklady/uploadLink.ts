// DOKLADY — jednorázový odkaz pro nahrání PDF/fotky dokladu asistentem
// (Lucie 19. a 20. 11. 2026: „od teď chci, aby se všechny účtenky ukládaly“).
//
// Proč: economy_attach_document chce celý soubor jako base64 přímo v
// argumentu nástroje. I malá faktura (28 kB) je pak desítky tisíc tokenů a
// do jednoho volání se nevejde — PDF z e-mailu se proto nedalo připojit.
//
// Jak: nástroj economy_document_upload_link (po stejných kontrolách jako
// economy_attach_document) vydá podepsaný odkaz na POST
// /api/doklady/nahrat?token=…, platný 15 minut a vázaný na KONKRÉTNÍ řádek
// Ekonomiky, uživatele, typ souboru, velikost a SHA-256 otisk souboru.
// Asistent pak soubor pošle přímo (např. curl --data-binary), bez průchodu
// konverzací. Jiný soubor než ten s daným otiskem server odmítne, stejný
// soubor podruhé se nezapíše (duplicita), takže odkaz nejde zneužít ani
// opakovat. Bez stavu v DB — jen HMAC podpis.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const UPLOAD_LINK_MINUTES = 15;

export type UploadLinkClaims = {
  /** Kdo odkaz vydal (stabilní userId) a s jakou aktivní rolí. */
  userId: string;
  systemRole: string;
  uploaderName: string;
  entryId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  issuedAt: number;
};

function linkKey(secret: string): Buffer {
  return createHash("sha256").update(`mojebegina:doklady-upload-link:${secret}`).digest();
}

/** Tajemství podpisu — stejný zdroj jako preview_token fakturace. */
export function uploadLinkSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.MCP_OAUTH_CLIENT_SECRET?.trim() ?? "";
  if (secret.length < 32) throw new Error("MCP_OAUTH_CLIENT_SECRET chybí");
  return secret;
}

export function signUploadLink(claims: UploadLinkClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const mac = createHmac("sha256", linkKey(secret)).update(body).digest("base64url");
  return `v1.${body}.${mac}`;
}

export function verifyUploadLink(
  token: string,
  secret: string,
  now: number = Date.now()
): { ok: true; claims: UploadLinkClaims } | { ok: false; error: string } {
  const invalid = { ok: false as const, error: "Odkaz pro nahrání dokladu je neplatný — vyžádejte si nový (economy_document_upload_link)." };
  const [version, body, mac, ...rest] = token.split(".");
  if (version !== "v1" || !body || !mac || rest.length > 0) return invalid;
  const good = createHmac("sha256", linkKey(secret)).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== good.length || !timingSafeEqual(given, good)) return invalid;
  let claims: UploadLinkClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UploadLinkClaims;
  } catch {
    return invalid;
  }
  if (typeof claims.issuedAt !== "number" || !(now - claims.issuedAt >= 0 && now - claims.issuedAt <= UPLOAD_LINK_MINUTES * 60_000)) {
    return { ok: false, error: `Odkaz pro nahrání dokladu je starší než ${UPLOAD_LINK_MINUTES} minut — vyžádejte si nový.` };
  }
  return { ok: true, claims };
}

/** Ověří, že nahraný soubor je přesně ten, pro který byl odkaz vydán. */
export function checkUploadedBytes(claims: UploadLinkClaims, bytes: Uint8Array): { ok: true } | { ok: false; error: string } {
  if (bytes.byteLength !== claims.sizeBytes) {
    return { ok: false, error: `Velikost souboru (${bytes.byteLength} B) nesedí s odkazem (${claims.sizeBytes} B).` };
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== claims.sha256) return { ok: false, error: "Otisk souboru (SHA-256) nesedí s odkazem — nahrajte stejný soubor, pro který byl odkaz vydán." };
  return { ok: true };
}

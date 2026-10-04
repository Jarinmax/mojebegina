// Security Phase 20 (Google Kalendář 1.0) — šifrování refresh tokenu na
// aplikační vrstvě, klíč jen ve Vercel env proměnné
// (GOOGLE_TOKEN_ENCRYPTION_KEY), nikdy v databázi — stejný řádek v DB by
// jinak byl čitelný kýmkoli s DB přístupem (včetně read-only nástrojů
// používaných při vývoji/auditu). Bez "server-only": klíč se čte a
// předává zvenčí (parametr, ne process.env uvnitř), takže je to čistá,
// testovatelná funkce — stejný princip jako jinde v projektu (čistá
// logika odděleně od I/O).
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encryptToken(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptToken(encoded: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

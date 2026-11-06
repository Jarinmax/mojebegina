// Práce 2.0 — soukromé úložiště fotografií úkolů (Cloudflare R2, EU).
//
// • Bucket je SOUKROMÝ (bez veřejného přístupu a bez r2.dev domény).
// • Nahrává jen server (po kontrole a vyčištění), klient do úložiště nikdy
//   nepíše přímo.
// • Prohlížení: server ověří oprávnění a vrátí podepsaný odkaz platný
//   PHOTO_LINK_TTL_SECONDS (5 min) s vynuceným Content-Type image/jpeg.
// • Klíče přístupu jen v env proměnných (Vercel), nikdy v kódu:
//     R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
//     R2_JURISDICTION (výchozí "eu" → https://<účet>.eu.r2.cloudflarestorage.com)
import { AwsClient } from "aws4fetch";

export const PHOTO_LINK_TTL_SECONDS = 300;

export interface PhotoStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  signedGetUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}

type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; jurisdiction: string };

export function r2ConfigFromEnv(env: Record<string, string | undefined> = process.env): R2Config | null {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, jurisdiction: env.R2_JURISDICTION?.trim() || "eu" };
}

export function r2ObjectUrl(config: Pick<R2Config, "accountId" | "bucket" | "jurisdiction">, key: string): string {
  const host =
    config.jurisdiction === "default"
      ? `${config.accountId}.r2.cloudflarestorage.com`
      : `${config.accountId}.${config.jurisdiction}.r2.cloudflarestorage.com`;
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `https://${host}/${encodeURIComponent(config.bucket)}/${path}`;
}

export function createR2Storage(config: R2Config): PhotoStorage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  return {
    async put(key, bytes) {
      const res = await client.fetch(r2ObjectUrl(config, key), {
        method: "PUT",
        body: new Uint8Array(bytes), // kopie s ArrayBuffer (typ BodyInit)
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
      });
      if (!res.ok) throw new Error(`Úložiště odmítlo fotografii (HTTP ${res.status}).`);
    },
    async signedGetUrl(key) {
      const url = new URL(r2ObjectUrl(config, key));
      url.searchParams.set("X-Amz-Expires", String(PHOTO_LINK_TTL_SECONDS));
      url.searchParams.set("response-content-type", "image/jpeg");
      url.searchParams.set("response-content-disposition", "inline");
      url.searchParams.set("response-cache-control", "private, no-store");
      const signed = await client.sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } });
      return signed.url;
    },
    async delete(key) {
      const res = await client.fetch(r2ObjectUrl(config, key), { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`Fotografii se nepodařilo smazat z úložiště (HTTP ${res.status}).`);
    },
  };
}

// Testy si podstrčí úložiště v paměti; v aplikaci se vždy čte z env.
let override: PhotoStorage | null | undefined;
export function setPhotoStorageForTests(storage: PhotoStorage | null | undefined): void {
  override = storage;
}

/** null = úložiště není nastavené (fotky jsou vypnuté, aplikace jinak funguje). */
export function getPhotoStorage(): PhotoStorage | null {
  if (override !== undefined) return override;
  const config = r2ConfigFromEnv();
  return config ? createR2Storage(config) : null;
}

export function isPhotoStorageConfigured(): boolean {
  return getPhotoStorage() !== null;
}

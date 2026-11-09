// Práce 2.0 — soukromé úložiště fotografií úkolů.
//
// Dvě možnosti (první nastavená vyhrává):
//  1) Cloudflare R2 (EU) — env R2_* níže; prohlížení přes podepsaný odkaz.
//  2) Vercel Blob (privátní store, který projekt už používá pro sklad) —
//     BLOB_STORE_ID + OIDC na Vercelu, nebo BLOB_READ_WRITE_TOKEN. Fotku
//     streamuje server (/api/prace/foto/[id]) po ověření oprávnění, klient
//     nikdy nevidí adresu v úložišti.
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
import { del as blobDel, get as blobGet, put as blobPut } from "@vercel/blob";

export const PHOTO_LINK_TTL_SECONDS = 300;

export interface PhotoStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** R2: podepsaný odkaz (route přesměruje). */
  signedGetUrl?(key: string): Promise<string>;
  /** Blob: obsah fotky streamuje server (null = nenalezena). */
  read?(key: string): Promise<ReadableStream<Uint8Array> | null>;
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

/** Vercel Blob je k dispozici (privátní store přes OIDC, nebo token). */
export function blobConfiguredFromEnv(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.BLOB_STORE_ID?.trim() || env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function createBlobStorage(): PhotoStorage {
  return {
    async put(key, bytes) {
      await blobPut(key, Buffer.from(bytes), {
        access: "private",
        contentType: "image/jpeg",
        addRandomSuffix: false,
        allowOverwrite: false,
      });
    },
    async read(key) {
      const blob = await blobGet(key, { access: "private" });
      if (!blob || blob.statusCode !== 200 || !blob.stream) return null;
      return blob.stream as ReadableStream<Uint8Array>;
    },
    async delete(key) {
      await blobDel(key);
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
  if (config) return createR2Storage(config);
  return blobConfiguredFromEnv() ? createBlobStorage() : null;
}

export function isPhotoStorageConfigured(): boolean {
  return getPhotoStorage() !== null;
}

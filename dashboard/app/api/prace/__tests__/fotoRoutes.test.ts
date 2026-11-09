// Práce 2.0 — API cesty fotek: ochrana požadavku, limit velikosti, krátký
// soukromý odkaz bez cache, 404 bez oprávnění.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addWorkTaskPhoto: vi.fn(),
  resolveWorkTaskPhoto: vi.fn(),
  storage: { signedGetUrl: vi.fn(async (key: string) => `https://acc.eu.r2.cloudflarestorage.com/b/${key}?X-Amz-Expires=300`) } as unknown,
}));
vi.mock("@/lib/data/workTasks", () => ({ addWorkTaskPhoto: mocks.addWorkTaskPhoto, resolveWorkTaskPhoto: mocks.resolveWorkTaskPhoto }));
vi.mock("@/lib/prace/photoStorage", () => ({ getPhotoStorage: () => mocks.storage }));

import { POST } from "../foto/route";
import { GET } from "../foto/[id]/route";
import { ForbiddenError } from "@/lib/data/errors";

const upload = (headers: Record<string, string>, bytes = new Uint8Array([0xff, 0xd8])) => {
  const form = new FormData();
  form.set("taskId", "11111111-1111-4111-8111-111111111111");
  form.set("photo", new Blob([bytes], { type: "image/jpeg" }), "foto.jpg");
  return new Request("https://moje.begina.cz/api/prace/foto", { method: "POST", body: form, headers: { host: "moje.begina.cz", ...headers } });
};

beforeEach(() => {
  mocks.addWorkTaskPhoto.mockReset();
  mocks.resolveWorkTaskPhoto.mockReset();
});

describe("POST /api/prace/foto", () => {
  it("požadavek z cizího webu odmítne a nic neuloží", async () => {
    expect((await POST(upload({ origin: "https://zly-web.cz" }))).status).toBe(403);
    expect((await POST(upload({ "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect(mocks.addWorkTaskPhoto).not.toHaveBeenCalled();
  });

  it("z vlastní stránky předá soubor datové vrstvě; odpověď se necachuje", async () => {
    mocks.addWorkTaskPhoto.mockResolvedValue({ ok: true, photoId: "p1" });
    const res = await POST(upload({ origin: "https://moje.begina.cz", "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, photoId: "p1" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.addWorkTaskPhoto).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", expect.any(Uint8Array));
  });

  it("příliš velký soubor odmítne dřív, než ho čte", async () => {
    const res = await POST(upload({ origin: "https://moje.begina.cz", "content-length": String(10 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect(mocks.addWorkTaskPhoto).not.toHaveBeenCalled();
  });

  it("chyba kontroly souboru = 400 s hláškou; bez oprávnění = 403", async () => {
    mocks.addWorkTaskPhoto.mockResolvedValueOnce({ ok: false, error: "Soubor není fotografie ve formátu JPEG." });
    expect((await POST(upload({ origin: "https://moje.begina.cz" }))).status).toBe(400);
    mocks.addWorkTaskPhoto.mockRejectedValueOnce(new ForbiddenError());
    expect((await POST(upload({ origin: "https://moje.begina.cz" }))).status).toBe(403);
  });
});

describe("GET /api/prace/foto/[id]", () => {
  const get = (id: string) => GET(new Request(`https://moje.begina.cz/api/prace/foto/${id}`), { params: Promise.resolve({ id }) });

  it("oprávněnému přesměruje na podepsaný odkaz platný 5 minut, bez cache a bez referreru", async () => {
    mocks.resolveWorkTaskPhoto.mockResolvedValue({ storageKey: "prace/t/p.jpg" });
    const res = await get("p");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("X-Amz-Expires=300");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("Vercel Blob (privátní): fotku streamuje server jako JPEG, bez cache; chybějící = 404", async () => {
    const prev = mocks.storage;
    const read = vi.fn(async (key: string) =>
      key === "prace/t/p.jpg" ? new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([0xff, 0xd8, 0xff])); c.close(); } }) : null
    );
    mocks.storage = { read };
    try {
      mocks.resolveWorkTaskPhoto.mockResolvedValue({ storageKey: "prace/t/p.jpg" });
      const res = await get("p");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
      mocks.resolveWorkTaskPhoto.mockResolvedValue({ storageKey: "prace/t/jina.jpg" });
      expect((await get("p")).status).toBe(404);
    } finally {
      mocks.storage = prev;
    }
  });

  it("bez oprávnění nebo neexistující fotka = 404 (neprozradí, že existuje)", async () => {
    mocks.resolveWorkTaskPhoto.mockResolvedValueOnce(null);
    expect((await get("x")).status).toBe(404);
    mocks.resolveWorkTaskPhoto.mockRejectedValueOnce(new ForbiddenError());
    expect((await get("x")).status).toBe(404);
  });
});

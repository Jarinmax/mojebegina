import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";

vi.mock("server-only", () => ({}));
import { readSheetValues, serviceAccountKey } from "../googleSheetsRead";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KEY = { client_email: "mojebegina-leady@projekt.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
});

describe("googleSheetsRead", () => {
  it("klíč z proměnné prostředí: JSON i base64; bez proměnné null", () => {
    expect(serviceAccountKey()).toBeNull();
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify(KEY);
    expect(serviceAccountKey()).toEqual(KEY);
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = Buffer.from(JSON.stringify(KEY)).toString("base64");
    expect(serviceAccountKey()).toEqual(KEY);
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: "x" });
    expect(() => serviceAccountKey()).toThrow("chybí client_email nebo private_key");
  });

  it("podepsaný JWT (jen čtení tabulek) → token → hodnoty prvního listu", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "tok" });
      return Response.json({ values: [["id"], ["l:1"]] });
    });
    expect(await readSheetValues(KEY, "SHEET", "A:Z")).toEqual([["id"], ["l:1"]]);

    const assertion = new URLSearchParams(String(calls[0].init?.body)).get("assertion")!;
    const [h, c, sig] = assertion.split(".");
    expect(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toMatchObject({
      iss: KEY.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
    });
    expect(calls[1].url).toBe("https://sheets.googleapis.com/v4/spreadsheets/SHEET/values/A%3AZ");
    expect((calls[1].init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("nenasdílená tabulka → srozumitelná chyba s e-mailem servisního účtu", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("oauth2") ? Response.json({ access_token: "tok" }) : new Response("forbidden", { status: 403 })
    );
    await expect(readSheetValues(KEY, "SHEET", "A:Z")).rejects.toThrow(
      "Tabulka není dostupná (403) — je nasdílená e-mailu servisního účtu mojebegina-leady@projekt.iam.gserviceaccount.com?"
    );
  });
});

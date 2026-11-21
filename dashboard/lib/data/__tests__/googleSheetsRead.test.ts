import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, createSign, createVerify } from "node:crypto";

vi.mock("server-only", () => ({}));
import { DEFAULT_SERVICE_ACCOUNT_EMAIL, parseServiceAccountKey, readSheetValues, serviceAccountKey } from "../googleSheetsRead";

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
    expect(() => serviceAccountKey()).toThrow("není klíč servisního účtu");
  });

  it("z jakékoli podoby vytáhne e-mail a soukromý klíč, který jde použít k podpisu", () => {
    const file = JSON.stringify({ type: "service_account", project_id: "mojebegina", ...KEY }, null, 2);
    const firefoxTable = `type\tservice_account\nproject_id\tmojebegina\nprivate_key\t${KEY.private_key}\nclient_email\t${KEY.client_email}\n`;
    const variants = {
      celySoubor: file,
      bomANovyRadek: `\uFEFF${file}\n`,
      neviditelnaMezera: `\u200B${file}`,
      escapovanyRetezec: JSON.stringify(file),
      vApostrofech: `'${file}'`,
      vUvozovkach: `"${file}"`,
      sNazvemPromenne: `GOOGLE_SERVICE_ACCOUNT_KEY=${file}`,
      base64: Buffer.from(file).toString("base64"),
      jednoRadkoveEscapovane: JSON.stringify(JSON.parse(file)),
      nahledFirefoxu: firefoxTable,
    };
    for (const [name, raw] of Object.entries(variants)) {
      const key = parseServiceAccountKey(raw);
      expect(key.client_email, name).toBe(KEY.client_email);
      // klíč musí jít opravdu použít k podpisu (stejný jako originál)
      const sig = createSign("RSA-SHA256").update("x").sign(key.private_key);
      expect(createVerify("RSA-SHA256").update("x").verify(publicKey, sig), name).toBe(true);
    }
  });

  it("jen soukromý klíč (i s rozbitými řádky) → použije známý e-mail servisního účtu", () => {
    const onlyPem = parseServiceAccountKey(KEY.private_key);
    expect(onlyPem.client_email).toBe(DEFAULT_SERVICE_ACCOUNT_EMAIL);
    const oneLine = KEY.private_key.replace(/\n/g, " ");
    const sig = createSign("RSA-SHA256").update("x").sign(parseServiceAccountKey(oneLine).private_key);
    expect(createVerify("RSA-SHA256").update("x").verify(publicKey, sig)).toBe(true);
    expect(parseServiceAccountKey(`"${KEY.private_key.replace(/\n/g, "\\n")}"`).client_email).toBe(DEFAULT_SERVICE_ACCOUNT_EMAIL);
  });

  it("bez soukromého klíče: srozumitelná chyba s bezpečným popisem obsahu, bez obsahu klíče", () => {
    expect(() => parseServiceAccountKey("{nedokončený")).toThrow(/není klíč servisního účtu \(délka 12 znaků, začíná znakem „\{“ \(U\+007B\), soukromý klíč: ne, e-mail servisního účtu: ne\)/);
    expect(() => parseServiceAccountKey("YWhvag==")).toThrow("není klíč servisního účtu");
    expect(() => parseServiceAccountKey(`{"client_email": "${KEY.client_email}"}`)).toThrow("e-mail servisního účtu: ano");
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

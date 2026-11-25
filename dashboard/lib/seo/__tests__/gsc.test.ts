import { describe, expect, it } from "vitest";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { buildJwt, parseServiceAccount, summarizeQueries } from "../gsc";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const json = JSON.stringify({ client_email: "a@b.iam.gserviceaccount.com", private_key: pem });

describe("parseServiceAccount", () => {
  it("přijme čistý JSON i base64", () => {
    expect(parseServiceAccount(json)?.client_email).toBe("a@b.iam.gserviceaccount.com");
    expect(parseServiceAccount(Buffer.from(json).toString("base64"))?.client_email).toBe("a@b.iam.gserviceaccount.com");
  });
  it("odmítne prázdné a vadné", () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount("{}")).toBeNull();
    expect(parseServiceAccount("nesmysl")).toBeNull();
  });
});

describe("buildJwt", () => {
  it("vytvoří platně podepsaný JWT se správnými údaji", () => {
    const account = parseServiceAccount(json)!;
    const jwt = buildJwt(account, 1_000_000);
    const [header, claims, signature] = jwt.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64"))).toBe(true);
    const body = JSON.parse(Buffer.from(claims, "base64").toString());
    expect(body).toMatchObject({ iss: "a@b.iam.gserviceaccount.com", scope: "https://www.googleapis.com/auth/webmasters.readonly", iat: 1_000_000, exp: 1_003_600 });
  });
});

describe("summarizeQueries", () => {
  it("sečte kliknutí a váží pozici zobrazeními", () => {
    const result = summarizeQueries([
      { query: "dýňová polévka", clicks: 2, impressions: 10, position: 4 },
      { query: "dýňová polévka", clicks: 1, impressions: 30, position: 8 },
      { query: "bylinný sirup", clicks: 0, impressions: 5, position: 20 },
    ]);
    expect(result[0]).toEqual({ query: "dýňová polévka", clicks: 3, impressions: 40, position: 7 });
    expect(result[1].query).toBe("bylinný sirup");
  });
});

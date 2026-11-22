import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkUploadedBytes, signUploadLink, UPLOAD_LINK_MINUTES, uploadLinkSecret, verifyUploadLink, type UploadLinkClaims } from "../uploadLink";

const SECRET = "x".repeat(40);
const bytes = new TextEncoder().encode("%PDF-1.5 faktura");
const claims: UploadLinkClaims = {
  userId: "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c",
  systemRole: "ADMIN",
  uploaderName: "Jaroslav Viner (asistent)",
  entryId: "d6c91d4f-98b2-4cd4-91a8-5842fe41e53a",
  filename: "Vydaná faktura - 20263175.pdf",
  mimeType: "application/pdf",
  sizeBytes: bytes.byteLength,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  issuedAt: 1_000_000,
};

describe("odkaz pro nahrání dokladu", () => {
  it("platný odkaz projde a vrátí stejné údaje", () => {
    const token = signUploadLink(claims, SECRET);
    const result = verifyUploadLink(token, SECRET, claims.issuedAt + 60_000);
    expect(result).toEqual({ ok: true, claims });
  });

  it("jiné tajemství, upravený obsah nebo nesmysl neprojde", () => {
    const token = signUploadLink(claims, SECRET);
    expect(verifyUploadLink(token, "y".repeat(40), claims.issuedAt).ok).toBe(false);
    const [v, , mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, entryId: "00000000-0000-0000-0000-000000000000" })).toString("base64url");
    expect(verifyUploadLink(`${v}.${forged}.${mac}`, SECRET, claims.issuedAt).ok).toBe(false);
    expect(verifyUploadLink("v1.abc", SECRET, claims.issuedAt).ok).toBe(false);
    expect(verifyUploadLink(`${token}.navic`, SECRET, claims.issuedAt).ok).toBe(false);
  });

  it(`po ${UPLOAD_LINK_MINUTES} minutách odkaz vyprší`, () => {
    const token = signUploadLink(claims, SECRET);
    expect(verifyUploadLink(token, SECRET, claims.issuedAt + UPLOAD_LINK_MINUTES * 60_000).ok).toBe(true);
    expect(verifyUploadLink(token, SECRET, claims.issuedAt + UPLOAD_LINK_MINUTES * 60_000 + 1).ok).toBe(false);
    expect(verifyUploadLink(token, SECRET, claims.issuedAt - 1).ok).toBe(false);
  });

  it("přijme jen přesně ten soubor (velikost i otisk)", () => {
    expect(checkUploadedBytes(claims, bytes)).toEqual({ ok: true });
    expect(checkUploadedBytes(claims, new TextEncoder().encode("%PDF-1.5 jina fa")).ok).toBe(false);
    expect(checkUploadedBytes(claims, new TextEncoder().encode("kratsi")).ok).toBe(false);
  });

  it("bez tajemství na serveru nic nepodepíše", () => {
    expect(() => uploadLinkSecret({})).toThrow();
    expect(() => uploadLinkSecret({ MCP_OAUTH_CLIENT_SECRET: "kratke" })).toThrow();
    expect(uploadLinkSecret({ MCP_OAUTH_CLIENT_SECRET: SECRET })).toBe(SECRET);
  });
});

import { describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { encryptToken, decryptToken } from "../googleCalendarCrypto";

const KEY = randomBytes(32).toString("base64");

describe("googleCalendarCrypto — Security Phase 20", () => {
  it("round-trip: dešifrovaný text odpovídá původnímu", () => {
    const plaintext = "1//0gExampleRefreshTokenValue";
    const encrypted = encryptToken(plaintext, KEY);
    expect(decryptToken(encrypted, KEY)).toBe(plaintext);
  });

  it("zašifrovaná hodnota neobsahuje čitelný text tokenu", () => {
    const plaintext = "1//0gExampleRefreshTokenValue";
    const encrypted = encryptToken(plaintext, KEY);
    expect(encrypted).not.toContain(plaintext);
  });

  it("dva šifrovací běhy se stejným vstupem dávají různý výstup (náhodné IV)", () => {
    const plaintext = "stejny-token";
    expect(encryptToken(plaintext, KEY)).not.toBe(encryptToken(plaintext, KEY));
  });

  it("dešifrování s jiným klíčem selže (auth tag nesedí)", () => {
    const otherKey = randomBytes(32).toString("base64");
    const encrypted = encryptToken("tajny-token", KEY);
    expect(() => decryptToken(encrypted, otherKey)).toThrow();
  });

  it("pozměněný šifrovaný text je odhalen (auth tag) a dešifrování selže", () => {
    const encrypted = encryptToken("tajny-token", KEY);
    const tampered = Buffer.from(encrypted, "base64");
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptToken(tampered.toString("base64"), KEY)).toThrow();
  });
});

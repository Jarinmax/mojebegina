import { describe, expect, it } from "vitest";
import { deriveNeonAuthBaseUrl } from "../neonAuthBaseUrl";

describe("deriveNeonAuthBaseUrl", () => {
  it("odvodí Auth URL z pooled hostname (s -pooler)", () => {
    expect(
      deriveNeonAuthBaseUrl(
        "ep-example-node-12345678-pooler.c-1.eu-central-1.aws.neon.tech",
        "neondb"
      )
    ).toBe(
      "https://ep-example-node-12345678.neonauth.c-1.eu-central-1.aws.neon.tech/neondb/auth"
    );
  });

  it("odvodí Auth URL i z hostname bez -pooler (přímé/unpooled spojení)", () => {
    expect(
      deriveNeonAuthBaseUrl(
        "ep-example-node-12345678.c-1.eu-central-1.aws.neon.tech",
        "neondb"
      )
    ).toBe(
      "https://ep-example-node-12345678.neonauth.c-1.eu-central-1.aws.neon.tech/neondb/auth"
    );
  });

  it("vrátí null pro chybějící hostname (volající spadne na fallback)", () => {
    expect(deriveNeonAuthBaseUrl(undefined, "neondb")).toBeNull();
    expect(deriveNeonAuthBaseUrl("", "neondb")).toBeNull();
  });

  it("vrátí null pro chybějící jméno databáze", () => {
    expect(
      deriveNeonAuthBaseUrl(
        "ep-example-node-12345678-pooler.c-1.eu-central-1.aws.neon.tech",
        undefined
      )
    ).toBeNull();
  });

  it("vrátí null pro nesmyslný/neúplný hostname (žádná tečka, žádný region)", () => {
    expect(deriveNeonAuthBaseUrl("localhost", "neondb")).toBeNull();
    expect(deriveNeonAuthBaseUrl("ep-example-node-12345678-pooler", "neondb")).toBeNull();
    expect(deriveNeonAuthBaseUrl(".", "neondb")).toBeNull();
  });
});

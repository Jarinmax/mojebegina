import { describe, expect, it } from "vitest";
import { pushConfig } from "../pushConfig";

const FULL_ENV = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-key",
  VAPID_PRIVATE_KEY: "private-key",
  VAPID_SUBJECT: "mailto:info@begina.cz",
};

describe("pushConfig — Jarda, upozornění na naplánovaný hovor", () => {
  it("se všemi třemi proměnnými vrátí konfiguraci", () => {
    expect(pushConfig(FULL_ENV)).toEqual({ publicKey: "public-key", privateKey: "private-key", subject: "mailto:info@begina.cz" });
  });

  it("bez jakékoliv proměnné vrátí null (bezpečné vypnutí, žádná výjimka)", () => {
    expect(pushConfig({})).toBeNull();
  });

  it("chybějící jen jedna z trojice = null", () => {
    expect(pushConfig({ ...FULL_ENV, VAPID_PRIVATE_KEY: undefined })).toBeNull();
    expect(pushConfig({ ...FULL_ENV, NEXT_PUBLIC_VAPID_PUBLIC_KEY: "" })).toBeNull();
    expect(pushConfig({ ...FULL_ENV, VAPID_SUBJECT: "   " })).toBeNull();
  });
});

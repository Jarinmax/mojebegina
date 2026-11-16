import { describe, expect, it } from "vitest";
import { parentHref } from "../parentHref";

describe("Zpět o jeden krok", () => {
  it("ze sekce na Řízení firmy, z Řízení firmy na úvod role", () => {
    expect(parentHref("/rizeni-firmy/ekonomika", "/admin")).toBe("/rizeni-firmy");
    expect(parentHref("/rizeni-firmy/receptury/cenik", "/admin")).toBe("/rizeni-firmy/receptury");
    expect(parentHref("/rizeni-firmy/receptury/lipovy-sirup", "/admin")).toBe("/rizeni-firmy/receptury");
    expect(parentHref("/rizeni-firmy", "/admin")).toBe("/admin");
    expect(parentHref("/rizeni-firmy/", "/executive")).toBe("/executive");
  });

  it("mezistupně bez vlastní stránky přeskočí", () => {
    expect(parentHref("/rizeni-firmy/obchod/leady/abc", "/admin")).toBe("/rizeni-firmy/obchod");
    expect(parentHref("/rizeni-firmy/obchod/leady/abc/prevest", "/admin")).toBe("/rizeni-firmy/obchod/leady/abc");
    expect(parentHref("/rizeni-firmy/sklad/prijemky/7/kontrola", "/admin")).toBe("/rizeni-firmy/sklad/prijemky/7");
    expect(parentHref("/rizeni-firmy/sklad/prijemky/7", "/admin")).toBe("/rizeni-firmy/sklad");
    expect(parentHref("/rizeni-firmy/uzel/xyz", "/admin")).toBe("/rizeni-firmy");
    expect(parentHref("/prace/ukol/5", "/admin")).toBe("/prace");
  });

  it("Práce a neznámé adresy", () => {
    expect(parentHref("/prace/hovory", "/executive")).toBe("/prace");
    expect(parentHref("/prace", "/executive")).toBe("/executive");
    expect(parentHref(null, "/admin")).toBe("/admin");
    expect(parentHref("/jinde/neco", "/admin")).toBe("/admin");
  });
});

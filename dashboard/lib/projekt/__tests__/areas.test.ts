import { describe, expect, it } from "vitest";
import { cleanUrl, findArea, PROJECT_AREAS, validateProjectInput } from "../areas";

describe("Projekt Begina — oblasti a kontrola vstupu", () => {
  it("7 oblastí s jedinečnými slugy", () => {
    expect(PROJECT_AREAS).toHaveLength(7);
    expect(new Set(PROJECT_AREAS.map((a) => a.slug)).size).toBe(7);
    expect(findArea("konkurence")?.name).toBe("Konkurence");
    expect(findArea("neco")).toBeNull();
  });

  it("stav potřebuje text a titulek zahodí", () => {
    expect(validateProjectInput({ area: "web", kind: "status", body: "  " })).toMatchObject({ ok: false });
    expect(validateProjectInput({ area: "web", kind: "status", title: "x", body: "Měříme konverzi." })).toEqual({
      ok: true,
      value: { area: "web", kind: "status", title: null, body: "Měříme konverzi.", url: null },
    });
  });

  it("rozhodnutí a výstup potřebují titulek; neznámá oblast/druh neprojde", () => {
    expect(validateProjectInput({ area: "etikety", kind: "decision", body: "proč" })).toMatchObject({ ok: false });
    expect(validateProjectInput({ area: "etikety", kind: "decision", title: "Sirupy 650 ml" })).toMatchObject({ ok: true });
    expect(validateProjectInput({ area: "x", kind: "decision", title: "a" })).toMatchObject({ ok: false });
    expect(validateProjectInput({ area: "web", kind: "note", title: "a" })).toMatchObject({ ok: false });
  });

  it("odkaz jen http(s)", () => {
    expect(cleanUrl("https://begina.cz/a")).toBe("https://begina.cz/a");
    expect(cleanUrl("javascript:alert(1)")).toBe("invalid");
    expect(cleanUrl("")).toBeNull();
    expect(validateProjectInput({ area: "obrazky", kind: "output", title: "Fotky", url: "ftp://x" })).toMatchObject({ ok: false });
  });
});

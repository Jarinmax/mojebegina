import { describe, expect, it } from "vitest";
import { DEFAULT_ESHOP_URL, resolveEshopLink } from "../eshopLink";

describe("resolveEshopLink — kam vedou tlačítka E-shop", () => {
  it("bez nastavení vede na /eshop v téže aplikaci", () => {
    expect(resolveEshopLink(undefined)).toEqual({ href: "/eshop", external: false });
    expect(resolveEshopLink("  ")).toEqual({ href: DEFAULT_ESHOP_URL, external: false });
  });

  it("přepnutí na begina.cz je jedna hodnota (externí → nová záložka)", () => {
    expect(resolveEshopLink("https://begina.cz")).toEqual({ href: "https://begina.cz", external: true });
    expect(resolveEshopLink(" https://begina.cz/eshop ")).toEqual({ href: "https://begina.cz/eshop", external: true });
    expect(resolveEshopLink("/obchod")).toEqual({ href: "/obchod", external: false });
  });

  it("nebezpečná nebo nesmyslná hodnota spadne zpět na /eshop", () => {
    for (const bad of ["javascript:alert(1)", "http://begina.cz", "//evil.example", "begina.cz", "https://", "/ eshop"]) {
      expect(resolveEshopLink(bad), bad).toEqual({ href: "/eshop", external: false });
    }
  });
});

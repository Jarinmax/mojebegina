import { describe, expect, it } from "vitest";
import { pageShareMeta } from "../shareMeta";

describe("náhled odkazu podle stránky", () => {
  it("nese titulek, popis a adresu stránky", () => {
    const m = pageShareMeta("Pro kavárny", "Popis", "/pro-kavarny");
    expect(m.openGraph).toMatchObject({ title: "Pro kavárny | Begina", description: "Popis", url: "/pro-kavarny" });
    expect(m.twitter).toMatchObject({ title: "Pro kavárny | Begina", description: "Popis" });
  });
});

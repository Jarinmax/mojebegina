// 28. 11. 2026: na begina.cz se servírují jen statické soubory z public/eshop/… (lib/site/routing.ts).
// Fotky z public/fotky-eshop se tam nezobrazí – proto musí fotky úvodu ležet v public/eshop.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HOME_BESTSELLER_PHOTOS, HOME_DOORS } from "@/lib/eshop/homeContent";

describe("fotky úvodní stránky", () => {
  const all = [...HOME_DOORS.map((d) => d.photo), ...Object.values(HOME_BESTSELLER_PHOTOS)];
  it("jsou v public/eshop (jinak je begina.cz nezobrazí) a existují", () => {
    for (const src of all) {
      expect(src.startsWith("/eshop/")).toBe(true);
      expect(existsSync(path.join(__dirname, "../../../public", src))).toBe(true);
    }
  });
});

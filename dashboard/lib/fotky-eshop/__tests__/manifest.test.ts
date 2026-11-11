import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, scan } from "../../../scripts/fotky-eshop/build-manifest.mjs";
import { fotkyDisplayName, fotkyFolderKeys } from "../structure";

describe("fotky na e-shop", () => {
  it("manifest odpovídá souborům v public/fotky-eshop", () => {
    const current = readFileSync(join(__dirname, "..", "manifest.ts"), "utf8");
    expect(current).toBe(render(scan()));
  });
  it("soubory jsou jen ve známých složkách", () => {
    const known = new Set(fotkyFolderKeys());
    for (const key of Object.keys(scan())) expect(known.has(key)).toBe(true);
  });
  it("hezké názvy produktů", () => {
    expect(fotkyDisplayName("bylinny-sirup-saman.jpg")).toBe("Bylinný sirup Šaman");
    expect(fotkyDisplayName("rajcatova-polevka.jpg")).toBe("Tomatová polévka");
  });
});

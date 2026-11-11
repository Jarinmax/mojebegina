import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, scan } from "../../../scripts/etikety/build-manifest.mjs";
import { folderKeys } from "../structure";

describe("úložiště etiket", () => {
  it("manifest odpovídá souborům v public/etikety", () => {
    const current = readFileSync(join(__dirname, "..", "manifest.ts"), "utf8");
    expect(current).toBe(render(scan()));
  });
  it("soubory jsou jen ve známých složkách", () => {
    const known = new Set(folderKeys());
    for (const key of Object.keys(scan())) expect(known.has(key)).toBe(true);
  });
});

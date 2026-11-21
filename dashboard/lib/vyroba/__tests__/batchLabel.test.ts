import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildBatchLabelPdf, findBatchLine, resolveLabelFile } from "../batchLabel";

const pub = (p: string) => join(__dirname, "../../../public/etikety", p);

describe("šarže – etiketa", () => {
  it("najde soubor etikety podle produktu a balení", () => {
    expect(resolveLabelFile("polevky", "rajcatova-polevka", "Tomatová polévka", 3000)).toBe("polevky/slozeni/Tomatova-polevka.png");
    expect(resolveLabelFile("sirupy", "lipovy-sirup", "Lipový sirup", 650)).toBe("sirupy/650ml/lipovy-sirup.png");
    expect(resolveLabelFile("polevky", "dynova-polevka", "Dýňová polévka", 200)).toBeNull();
  });
  it("najde řádek Šarže na etiketě polévky i sirupu", async () => {
    for (const f of ["polevky/slozeni/Dynova-polevka.png", "sirupy/3l/lipovy-sirup.png"]) {
      const { data, info } = await sharp(readFileSync(pub(f))).greyscale().raw().toBuffer({ resolveWithObject: true });
      const pos = findBatchLine(new Uint8Array(data), info.width, info.height);
      expect(pos).not.toBeNull();
      expect(pos!.labelEnd).toBeLessThan(130);
    }
  });
  it("vyrobí PDF s požadovaným počtem stran", async () => {
    const pdf = await buildBatchLabelPdf(readFileSync(pub("polevky/slozeni/Dynova-polevka.png")), "PDYN-211126", "2026-12-12", 3);
    expect(pdf).not.toBeNull();
    expect(Buffer.from(pdf!).subarray(0, 4).toString()).toBe("%PDF");
  });
});

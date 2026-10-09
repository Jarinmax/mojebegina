// Sklad 1.0 (mobilní tok) — čistá matematika zmenšení, bez DOM (viz
// komentář v imageResize.ts), stejná konvence jako skladValidation.test.ts.
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_DIMENSION_PX, UPLOAD_JPEG_QUALITY, computeResizeTarget } from "../imageResize";

describe("computeResizeTarget", () => {
  it("fotku pod limitem nezvětšuje, vrátí beze změny", () => {
    expect(computeResizeTarget(1000, 800)).toEqual({ width: 1000, height: 800 });
  });

  it("fotku přesně na limitu nezvětšuje ani nezmenšuje", () => {
    expect(computeResizeTarget(MAX_UPLOAD_DIMENSION_PX, 1500)).toEqual({
      width: MAX_UPLOAD_DIMENSION_PX,
      height: 1500,
    });
  });

  it("širokou fotku nad limitem zmenší na přesně MAX_UPLOAD_DIMENSION_PX na delší straně, druhou proporčně", () => {
    const result = computeResizeTarget(4400, 2200);
    expect(result.width).toBe(MAX_UPLOAD_DIMENSION_PX);
    expect(result.height).toBe(1100);
  });

  it("vysokou fotku (na výšku) zmenší podle výšky, ne šířky", () => {
    const result = computeResizeTarget(2200, 4400);
    expect(result.height).toBe(MAX_UPLOAD_DIMENSION_PX);
    expect(result.width).toBe(1100);
  });

  it("čtvercovou fotku nad limitem zmenší na čtverec s MAX_UPLOAD_DIMENSION_PX", () => {
    expect(computeResizeTarget(5000, 5000)).toEqual({
      width: MAX_UPLOAD_DIMENSION_PX,
      height: MAX_UPLOAD_DIMENSION_PX,
    });
  });

  it("výsledné rozměry jsou vždy celá čísla a aspoň 1px", () => {
    const result = computeResizeTarget(100000, 1);
    expect(Number.isInteger(result.width)).toBe(true);
    expect(Number.isInteger(result.height)).toBe(true);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it("respektuje vlastní maxDimension parametr", () => {
    expect(computeResizeTarget(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
  });

  it("výchozí kvalita JPEG je v rozumném rozsahu (0,1]", () => {
    expect(UPLOAD_JPEG_QUALITY).toBeGreaterThan(0);
    expect(UPLOAD_JPEG_QUALITY).toBeLessThanOrEqual(1);
  });
});

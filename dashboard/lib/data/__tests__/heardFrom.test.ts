import { describe, expect, it } from "vitest";
import { HEARD_FROM_MISSING_ERROR, suggestHeardFrom, validateHeardFromInput } from "../heardFrom";

describe("Odkud nás zná", () => {
  it("po dovolání bez uložené informace nejde uložit", () => {
    expect(validateHeardFromInput({ heardFrom: "", heardFromDetail: "" }, { reached: true, alreadyKnown: false })).toEqual({
      ok: false,
      error: HEARD_FROM_MISSING_ERROR,
    });
  });
  it("bez dovolání nebo když už lead informaci má, je nepovinné", () => {
    expect(validateHeardFromInput({ heardFrom: "", heardFromDetail: "" }, { reached: false, alreadyKnown: false }).ok).toBe(true);
    expect(validateHeardFromInput({ heardFrom: "", heardFromDetail: "" }, { reached: true, alreadyKnown: true }).ok).toBe(true);
  });
  it("u Jiné je upřesnění povinné", () => {
    expect(validateHeardFromInput({ heardFrom: "jine", heardFromDetail: " " }, { reached: true, alreadyKnown: false }).ok).toBe(false);
    expect(validateHeardFromInput({ heardFrom: "jine", heardFromDetail: "letáček na trhu" }, { reached: true, alreadyKnown: false })).toEqual({
      ok: true,
      value: { heardFrom: "jine", heardFromDetail: "letáček na trhu" },
    });
  });
  it("neznámá hodnota je chyba", () => {
    expect(validateHeardFromInput({ heardFrom: "tiktok", heardFromDetail: "" }, { reached: true, alreadyKnown: false }).ok).toBe(false);
  });
  it("Meta lead předvyplní Facebook / Instagram", () => {
    expect(suggestHeardFrom("meta")).toBe("facebook_instagram");
    expect(suggestHeardFrom("web_kavarny")).toBeNull();
  });
});

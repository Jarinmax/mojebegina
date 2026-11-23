import { describe, expect, it } from "vitest";
import { continuousModeFor, mergeTranscripts } from "../dictationText";

describe("mergeTranscripts", () => {
  it("Android: kumulativní výsledky se neopakují (Dominika Větrovská 23. 11.)", () => {
    expect(
      mergeTranscripts([
        "Tak dneska jsem mluvil s paní Větrovskou",
        "Tak dneska jsem mluvil s paní Větrovskou a domluvili jsme se že se podívá večer na web",
        "tak dneska jsem mluvil s paní Větrovskou a domluvili jsme se že se podívá večer na web objednávku provede do tří dnů",
      ])
    ).toBe("tak dneska jsem mluvil s paní Větrovskou a domluvili jsme se že se podívá večer na web objednávku provede do tří dnů");
  });

  it("Safari/počítač: navazující kousky se spojí s mezerou", () => {
    expect(mergeTranscripts(["Domluvili jsme ochutnávku", " pošlu vzorky v úterý"])).toBe("Domluvili jsme ochutnávku pošlu vzorky v úterý");
  });

  it("stejný kousek dvakrát se nezdvojí", () => {
    expect(mergeTranscripts(["zavolat v pátek", "zavolat v pátek"])).toBe("zavolat v pátek");
  });

  it("prázdné výsledky ignoruje", () => {
    expect(mergeTranscripts(["", "  ", "ahoj"])).toBe("ahoj");
  });
});

describe("continuousModeFor", () => {
  it("na Androidu vypnuto, jinde zapnuto", () => {
    expect(continuousModeFor("Mozilla/5.0 (Linux; Android 14; SM-A546B) Chrome/131.0 Mobile Safari/537.36")).toBe(false);
    expect(continuousModeFor("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1")).toBe(true);
  });
});

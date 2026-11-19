import { describe, expect, it } from "vitest";
import { suggestSalutation } from "../salutation";

describe("návrh oslovení", () => {
  it.each([
    ["Lenka Odrazilová", "paní Odrazilová"],
    ["Jiří Průcha", "pane Průcho"],
    ["Petr Novák", "pane Nováku"],
    ["Jan Hájek", "pane Hájku"],
    ["Pavel Novotný", "pane Novotný"],
    ["Ondřej Bartoš", "pane Bartoši"],
    ["Mgr. Karolína Pospíšilová", "paní magistro"],
    ["Ing. Petr Novák", "pane inženýre"],
    ["Ing. Jana Nová", "paní inženýrko"],
    ["MUDr. Eva Malá", "paní doktorko"],
    ["prof. Ing. Josef Veselý, CSc.", "pane profesore"],
    ["Bc. Tereza Králová", "paní Králová"],
    ["Ing. Petr Novák, Ph.D.", "pane inženýre"],
    ["Lisichkina Tatiana", "paní Lisichkina"],
    ["Tatiana Lisichkina", "paní Lisichkina"],
    ["Lubomir Simko", "pane Simko"],
    ["Monika Chuda", "paní Chuda"],
    ["", ""],
    [null, ""],
  ])("%s → %s", (name, expected) => {
    expect(suggestSalutation(name)).toBe(expected);
  });
});

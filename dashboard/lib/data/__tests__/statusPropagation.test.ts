import { describe, expect, it } from "vitest";
import { computeAutoStatus, selectStatusDriver, type StatusChild } from "../statusPropagation";

function child(
  id: string,
  status: StatusChild["status"],
  priority: StatusChild["priority"],
  updatedAt = new Date("2026-01-01T00:00:00Z")
): StatusChild {
  return { id, status, priority, updatedAt };
}

describe("computeAutoStatus — Security Phase 12", () => {
  it("žádné děti = zelená (schváleno explicitně: 'auto uzel bez aktivních dětí = nic nevyžaduje zásah')", () => {
    expect(computeAutoStatus([])).toBe("green");
  });

  it("všechny děti zelené = zelená", () => {
    expect(computeAutoStatus([child("a", "green", "high"), child("b", "green", "low")])).toBe(
      "green"
    );
  });

  it("jedno oranžové dítě, jinak zelené = oranžová", () => {
    expect(computeAutoStatus([child("a", "amber", "medium"), child("b", "green", "low")])).toBe(
      "amber"
    );
  });

  it("červené dítě s nízkou/střední prioritou samo NEzbarví rodiče červeně — jen oranžová", () => {
    expect(computeAutoStatus([child("a", "red", "low")])).toBe("amber");
    expect(computeAutoStatus([child("a", "red", "medium")])).toBe("amber");
  });

  it("červené dítě s prioritou high nebo critical = červená", () => {
    expect(computeAutoStatus([child("a", "red", "high")])).toBe("red");
    expect(computeAutoStatus([child("a", "red", "critical")])).toBe("red");
  });

  it("kombinace: jedno bezvýznamné červené + jedno kritické červené = červená", () => {
    const children = [child("a", "red", "low"), child("b", "red", "critical")];
    expect(computeAutoStatus(children)).toBe("red");
  });

  it("kombinace: bezvýznamné červené + oranžové, žádné významné červené = oranžová", () => {
    const children = [child("a", "red", "low"), child("b", "amber", "medium")];
    expect(computeAutoStatus(children)).toBe("amber");
  });
});

describe("selectStatusDriver — Security Phase 12", () => {
  it("zelený výsledek = žádný driver", () => {
    expect(selectStatusDriver([child("a", "green", "low")], "green")).toBeNull();
  });

  it("prázdný seznam dětí = žádný driver", () => {
    expect(selectStatusDriver([], "red")).toBeNull();
  });

  it("červený výsledek vybere jediné významně červené dítě", () => {
    const children = [child("a", "red", "high"), child("b", "green", "low")];
    expect(selectStatusDriver(children, "red")?.id).toBe("a");
  });

  it("mezi více významně červenými vyhrává vyšší priorita", () => {
    const children = [child("a", "red", "high"), child("b", "red", "critical")];
    expect(selectStatusDriver(children, "red")?.id).toBe("b");
  });

  it("při shodné prioritě vyhrává novější updatedAt", () => {
    const children = [
      child("a", "red", "critical", new Date("2026-01-01T00:00:00Z")),
      child("b", "red", "critical", new Date("2026-02-01T00:00:00Z")),
    ];
    expect(selectStatusDriver(children, "red")?.id).toBe("b");
  });

  it("oranžový výsledek vybere nezelené dítě i s nízkou prioritou", () => {
    const children = [child("a", "red", "low"), child("b", "green", "medium")];
    expect(selectStatusDriver(children, "amber")?.id).toBe("a");
  });
});

import { describe, expect, it } from "vitest";
import { ArgError } from "../mcp/args";
import { auditArgs } from "../mcp/audit";
import { buildSource, excerpt, pageInfo, parsePaging } from "../mcp/envelope";
import { copyInfo, domainActivity, environmentFromBranch, sourceWarnings } from "@/lib/data/dataSourceValidation";

describe("stránkování", () => {
  it("výchozí a maximální velikost stránky", () => {
    expect(parsePaging({}, { a: 1 })).toMatchObject({ limit: 20, offset: 0 });
    expect(parsePaging({ limit: 500 }, { a: 1 }).limit).toBe(50);
    for (const bad of [0, -1, 2.5, "10"]) {
      expect(() => parsePaging({ limit: bad }, {}), String(bad)).toThrow(ArgError);
    }
  });

  it("cursor pokračuje jen u stejného dotazu", () => {
    const filters = { preset: "overdue", owner: "Blahout" };
    const first = parsePaging({ limit: 2 }, filters);
    const page = pageInfo(5, first, 2);
    expect(page).toMatchObject({ totalMatching: 5, returned: 2, complete: false, truncated: true });
    const second = parsePaging({ limit: 2, cursor: page.nextCursor }, filters);
    expect(second.offset).toBe(2);
    const last = pageInfo(5, parsePaging({ limit: 2, cursor: pageInfo(5, second, 2).nextCursor }, filters), 1);
    expect(last).toMatchObject({ offset: 4, truncated: false, nextCursor: null, complete: false });
    // jiný filtr nebo podvržený cursor
    expect(() => parsePaging({ cursor: page.nextCursor }, { preset: "closed" })).toThrow(/jinému dotazu/);
    expect(() => parsePaging({ cursor: "nesmysl" }, filters)).toThrow(ArgError);
    expect(() => parsePaging({ cursor: Buffer.from('{"o":-5,"k":"x"}').toString("base64url") }, filters)).toThrow(ArgError);
  });

  it("úplný výsledek na jedné stránce", () => {
    expect(pageInfo(3, parsePaging({}, {}), 3)).toMatchObject({ complete: true, truncated: false, nextCursor: null });
    expect(pageInfo(0, parsePaging({}, {}), 0)).toMatchObject({ complete: true, totalMatching: 0 });
  });

  it("výňatek dlouhého textu", () => {
    expect(excerpt("a".repeat(301))).toHaveLength(301);
    expect(excerpt("krátké")).toBe("krátké");
    expect(excerpt(null)).toBeNull();
  });
});

describe("zdroj dat: prostředí, stáří kopie a poslední aktivita", () => {
  const now = new Date("2026-10-18T10:00:00Z");

  it("prostředí podle skutečné Neon větve", () => {
    expect(environmentFromBranch("br-odd-surf-b2by4tja")).toBe("Production");
    expect(environmentFromBranch("br-super-dust-b2wbw2wk")).toBe("Preview");
    expect(environmentFromBranch(null)).toBe("neznámé");
    expect(environmentFromBranch("br-jina")).toBe("neznámé");
  });

  it("stáří kopie jen u známé Preview kopie", () => {
    expect(copyInfo("br-super-dust-b2wbw2wk", now)).toEqual({
      copiedFromProductionAt: "2026-10-13T22:27:00.000Z",
      copiedFromProductionAtPrague: "2026-10-14 00:27",
      copyAgeDays: 4,
      approximate: true,
    });
    expect(copyInfo("br-odd-surf-b2by4tja", now)).toBeNull();
    expect(copyInfo(null, now)).toBeNull();
  });

  it("varování plyne z prostředí a stáří kopie, NE ze staré obchodní aktivity", () => {
    expect(sourceWarnings("Production", null)).toEqual([]);
    expect(sourceWarnings("Preview", copyInfo("br-super-dust-b2wbw2wk", now))[0]).toMatch(
      /Preview KOPIE Production přibližně ze 2026-10-14 00:27 \(stáří kopie 4 dní\)/
    );
    expect(sourceWarnings("Preview", null)[0]).toMatch(/neznámého stáří/);
    expect(sourceWarnings("neznámé", null)[0]).toMatch(/Nepodařilo se ověřit/);
    // měsíc stará poslední aktivita v Production = jen informace, žádné varování
    const quiet = domainActivity("crm", new Date("2026-09-18T10:00:00Z"), now);
    expect(quiet).toEqual({
      domain: "crm",
      label: "CRM (leady a jejich historie)",
      lastRecordedActivityAt: "2026-09-18T10:00:00.000Z",
      lastRecordedActivityAtPrague: "2026-09-18 12:00",
      daysSinceLastRecordedActivity: 30,
    });
    const info = { deployment: "production", environment: "Production" as const, neonBranchId: "br-odd-surf-b2by4tja", copy: null, queriedAt: now.toISOString(), queriedAtPrague: "x", activity: [quiet] };
    expect(buildSource(info).warnings).toEqual([]);
    expect(domainActivity("focus", null, now)).toMatchObject({ lastRecordedActivityAt: null, daysSinceLastRecordedActivity: null });
  });

  it("hlavička source nese prostředí, kopii a úplnost", () => {
    const info = {
      deployment: "preview",
      environment: "Preview" as const,
      neonBranchId: "br-super-dust-b2wbw2wk",
      copy: copyInfo("br-super-dust-b2wbw2wk", now),
      queriedAt: now.toISOString(),
      queriedAtPrague: "2026-10-18 12:00",
      activity: [domainActivity("crm", now, now)],
    };
    expect(buildSource(info)).toMatchObject({
      environment: "Preview",
      deployment: "preview",
      neonBranchId: "br-super-dust-b2wbw2wk",
      copy: { copyAgeDays: 4 },
      complete: true,
      truncated: false,
      nextCursor: null,
      lastRecordedActivity: [expect.objectContaining({ domain: "crm" })],
    });
    const page = pageInfo(80, parsePaging({}, {}), 20);
    expect(buildSource(info, { page, warnings: ["x"] })).toMatchObject({ complete: false, truncated: true });
    expect(buildSource(info, { page, warnings: ["x"] }).warnings).toHaveLength(2);
  });
});

describe("audit čtení bez osobních údajů", () => {
  it("data, předvolby a čísla zůstanou, jména a hledaný text jen jako délka", () => {
    expect(
      auditArgs({
        salesperson: "Jaroslav Blahout",
        query: "+420 777 111 222",
        owner: "Blahout",
        date_from: "2026-10-14",
        preset: "overdue",
        limit: 20,
        stages: ["new", "contacted"],
        lead_id: "00000000-0000-4000-8000-000000000101",
      })
    ).toEqual({
      salesperson: "[16 znaků]",
      query: "[16 znaků]",
      owner: "[7 znaků]",
      date_from: "2026-10-14",
      preset: "overdue",
      limit: 20,
      stages: "[pole]",
      lead_id: "00000000-0000-4000-8000-000000000101",
    });
  });
});

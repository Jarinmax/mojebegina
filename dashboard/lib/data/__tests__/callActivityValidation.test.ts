import { describe, expect, it } from "vitest";
import {
  earliestCallByLead,
  formatPragueDateTime,
  matchSalesperson,
  pragueDayStart,
  summarizeCallActivity,
  validateCallActivityRange,
  type CallActivityRow,
  type EarliestCallRow,
} from "../callActivityValidation";

describe("hranice dne v Europe/Prague", () => {
  it("zima UTC+1, léto UTC+2", () => {
    expect(pragueDayStart("2026-01-15").toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(pragueDayStart("2026-07-15").toISOString()).toBe("2026-07-14T22:00:00.000Z");
  });

  it("dny přechodu času: 29. 3. má 23 h, 25. 10. má 25 h", () => {
    const spring = validateCallActivityRange("2026-03-29", null);
    expect(spring).toMatchObject({ ok: true });
    if (!spring.ok) return;
    expect(spring.value.start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(spring.value.end.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(spring.value.end.getTime() - spring.value.start.getTime()).toBe(23 * 3600_000);

    const autumn = validateCallActivityRange("2026-10-25", null);
    if (!autumn.ok) throw new Error(autumn.error);
    expect(autumn.value.start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(autumn.value.end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(autumn.value.end.getTime() - autumn.value.start.getTime()).toBe(25 * 3600_000);
  });

  it("období je včetně posledního dne, konec je začátek dalšího dne", () => {
    const range = validateCallActivityRange("2026-10-12", "2026-10-16");
    if (!range.ok) throw new Error(range.error);
    expect(range.value).toMatchObject({ dateFrom: "2026-10-12", dateTo: "2026-10-16" });
    expect(range.value.start.toISOString()).toBe("2026-10-11T22:00:00.000Z");
    expect(range.value.end.toISOString()).toBe("2026-10-16T22:00:00.000Z");
  });

  it("neplatné datum, obrácené nebo příliš dlouhé období", () => {
    for (const bad of ["2026-02-30", "14. 10. 2026", "2026-1-5", ""]) {
      expect(validateCallActivityRange(bad, null), bad).toMatchObject({ ok: false });
    }
    expect(validateCallActivityRange("2026-10-14", "2026-10-13")).toMatchObject({ ok: false });
    expect(validateCallActivityRange("2026-10-01", "2026-10-31")).toMatchObject({ ok: true });
    expect(validateCallActivityRange("2026-10-01", "2026-11-01")).toMatchObject({ ok: false });
  });

  it("čas hovoru v pražském čase", () => {
    expect(formatPragueDateTime(new Date("2026-10-13T22:30:00Z"))).toBe("2026-10-14 00:30");
    expect(formatPragueDateTime(new Date("2026-01-14T22:59:00Z"))).toBe("2026-01-14 23:59");
  });
});

describe("výběr obchodníka", () => {
  const staff = [
    { userId: "u-blahout", name: "Jaroslav Blahout", email: "blahout@begina.cz" },
    { userId: "u-viner", name: "Jaroslav Viner", email: "jaroslav@begina.cz" },
    { userId: "u-bez-jmena", name: null, email: "pomocnik@begina.cz" },
  ];

  it("celé jméno, příjmení, bez diakritiky a velikosti písmen, e-mail", () => {
    for (const query of ["Jaroslav Blahout", "blahout", "  JAROSLAV   blahout ", "Blahout Jaroslav", "blahout@begina.cz"]) {
      expect(matchSalesperson(query, staff), query).toEqual({ kind: "one", person: staff[0] });
    }
    expect(matchSalesperson("Jaroslav Vinér", staff)).toEqual({ kind: "one", person: staff[1] });
    expect(matchSalesperson("pomocnik@begina.cz", staff)).toEqual({ kind: "one", person: staff[2] });
  });

  it("nejednoznačné jméno se nehádá, neznámé se nenajde, část slova nestačí", () => {
    expect(matchSalesperson("Jaroslav", staff)).toEqual({ kind: "many", candidates: [staff[0], staff[1]] });
    expect(matchSalesperson("Novák", staff)).toEqual({ kind: "none" });
    expect(matchSalesperson("Blah", staff)).toEqual({ kind: "none" });
    expect(matchSalesperson("", staff)).toEqual({ kind: "none" });
  });
});

describe("souhrn hovorů", () => {
  const lead = (stage = "contacted") => ({
    companyName: null,
    contactName: null,
    contactEmail: null,
    contactPhone: "+420 777 000 000",
    stage,
  });
  const row = (
    id: string,
    leadId: string,
    at: string,
    metadata: Record<string, unknown>,
    body: string | null = "Poznámka",
    imported = false
  ): CallActivityRow => ({
    id,
    leadId,
    createdAt: new Date(at),
    body,
    metadata,
    lead: { ...lead(), companyName: `Lead ${leadId}` },
    imported,
  });
  const earliest = (rows: EarliestCallRow[]) => earliestCallByLead(rows);

  it("lead volaný vícekrát = jeden unikátní lead, ale všechny hovory se počítají", () => {
    const calls = [
      row("a1", "L1", "2026-10-14T07:00:00Z", { from: "new", callResult: "no_answer", nextFollowUpAt: "2026-10-15T12:00:00.000Z" }),
      row("a2", "L1", "2026-10-14T12:00:00Z", { from: "new", callResult: "reached_interested", nextFollowUpAt: "2026-10-20T12:00:00.000Z" }),
      row("a3", "L2", "2026-10-14T08:00:00Z", { from: "contacted", callResult: "call_back_later", nextFollowUpAt: "2026-10-21T12:00:00.000Z" }),
    ];
    const summary = summarizeCallActivity(
      [calls[0], calls[2], calls[1]],
      earliest([
        { id: "a1", leadId: "L1", createdAt: new Date("2026-10-14T07:00:00Z") },
        { id: "a2", leadId: "L1", createdAt: new Date("2026-10-14T12:00:00Z") },
        { id: "a0", leadId: "L2", createdAt: new Date("2026-09-30T08:00:00Z") },
        { id: "a3", leadId: "L2", createdAt: new Date("2026-10-14T08:00:00Z") },
      ])
    );
    expect(summary.totals).toEqual({
      recordedCalls: 3,
      uniqueLeads: 2,
      firstContactLeads: 1,
      firstContactImportedLeads: 0,
      repeatOnlyLeads: 1,
      repeatCalls: 2,
      incompleteCalls: 0,
    });
    const l1 = summary.leads.find((l) => l.leadId === "L1")!;
    expect(l1).toMatchObject({
      callsInPeriod: 2,
      contactType: "first_recorded",
      firstCallAtPrague: "2026-10-14 09:00",
      lastCallAtPrague: "2026-10-14 14:00",
      lastResultLabel: "Dovoláno – zájem",
      nextContactDate: "2026-10-20",
    });
    expect(l1.calls.map((c) => c.contactType)).toEqual(["first_recorded", "repeat"]);
    expect(l1.calls[1]).toMatchObject({ note: "Poznámka", result: "reached_interested", resultLabel: "Dovoláno – zájem" });
    // L2 měl hovor už 30. 9. — opakovaný, i když letos poprvé v tomto období
    expect(summary.leads.find((l) => l.leadId === "L2")).toMatchObject({ contactType: "repeat", callsInPeriod: 1 });
  });

  it("první kontakt = první zaznamenaný hovor bez ohledu na fázi; import = první evidovaný hovor v MojeBegina", () => {
    const calls = [
      row("b1", "L3", "2026-10-14T09:00:00Z", { from: "interested", stageChangedTo: "sample_offer", nextFollowUpAt: "2026-10-18T12:00:00.000Z" }),
      row("b2", "L4", "2026-10-14T10:00:00Z", { from: "contacted", callResult: "no_answer", nextFollowUpAt: "2026-10-18T12:00:00.000Z" }, "x", true),
    ];
    const summary = summarizeCallActivity(calls, earliest(calls.map((c) => ({ id: c.id, leadId: c.leadId, createdAt: c.createdAt }))));
    expect(summary.totals).toMatchObject({ firstContactLeads: 2, firstContactImportedLeads: 1, repeatOnlyLeads: 0 });
    // fáze „Zájem“ před hovorem na prvním kontaktu nic nemění
    expect(summary.leads[0]).toMatchObject({ contactType: "first_recorded", lastResultLabel: "posun na fázi „Vzorek/Nabídka“" });
    expect(summary.leads[0].calls[0].warnings).toEqual([]);
    expect(summary.leads[1].contactType).toBe("first_recorded_imported");
  });

  it("starší hovor jiného autora dělá z hovoru opakovaný kontakt (shoda času → menší id)", () => {
    const at = new Date("2026-10-14T09:00:00Z");
    const map = earliest([
      { id: "z-mine", leadId: "L4", createdAt: at },
      { id: "a-kolega", leadId: "L4", createdAt: at },
    ]);
    expect(map.get("L4")?.id).toBe("a-kolega");
    const summary = summarizeCallActivity([row("z-mine", "L4", at.toISOString(), { from: "new", callResult: "no_answer", nextFollowUpAt: "nesmysl" })], map);
    expect(summary.leads[0].contactType).toBe("repeat");
    // nečitelný termín v metadatech nesmí shodit výpis — počítá se jako chybějící
    expect(summary.leads[0].calls[0]).toMatchObject({ nextContactDate: null, warnings: ["missing_next_contact"] });
  });

  it("upozornění na neúplný zápis; po nezájmu nebo neplatném kontaktu termín nechybí", () => {
    const calls = [
      row("c1", "L5", "2026-10-14T08:00:00Z", { from: "new", stageChangedTo: null, nextFollowUpAt: null }, null),
      row("c2", "L6", "2026-10-14T09:00:00Z", { from: "new", callResult: "reached_interested", nextFollowUpAt: null }),
      row("c3", "L7", "2026-10-14T10:00:00Z", { from: "new", callResult: "reached_not_interested", nextFollowUpAt: null }),
      row("c4", "L8", "2026-10-14T11:00:00Z", { from: "new", callResult: "invalid_contact", nextFollowUpAt: null }),
      row("c5", "L9", "2026-10-14T12:00:00Z", { from: "contacted", stageChangedTo: "not_interested", nextFollowUpAt: null }),
      row("c6", "L10", "2026-10-14T13:00:00Z", { from: "new", callResult: "no_answer", nextFollowUpAt: null }, "   "),
    ];
    const summary = summarizeCallActivity(calls, earliest(calls.map((c) => ({ id: c.id, leadId: c.leadId, createdAt: c.createdAt }))));
    const warningsOf = (leadId: string) => summary.leads.find((l) => l.leadId === leadId)!.calls[0].warnings;
    expect(warningsOf("L5")).toEqual(["missing_result", "missing_note", "missing_next_contact"]);
    expect(warningsOf("L6")).toEqual(["missing_next_contact"]);
    expect(warningsOf("L7")).toEqual([]);
    expect(warningsOf("L8")).toEqual([]);
    expect(warningsOf("L9")).toEqual([]);
    expect(warningsOf("L10")).toEqual(["missing_note", "missing_next_contact"]);
    expect(summary.totals.incompleteCalls).toBe(3);
    expect(summary.incompleteRecords[0]).toEqual({
      leadId: "L5",
      name: "Lead L5",
      atPrague: "2026-10-14 10:00",
      warnings: ["chybí výsledek hovoru", "chybí poznámka", "chybí termín dalšího kontaktu"],
    });
  });

  it("detail hovorů je omezený, počty zůstávají úplné", () => {
    const calls = Array.from({ length: 5 }, (_, i) =>
      row(`d${i}`, `M${i % 2}`, `2026-10-14T0${i}:00:00Z`, { from: "new", callResult: "no_answer", nextFollowUpAt: "2026-10-15T12:00:00.000Z" })
    );
    const summary = summarizeCallActivity(calls, earliest([]), 3);
    expect(summary.totals).toMatchObject({ recordedCalls: 5, uniqueLeads: 2 });
    expect(summary.leads.reduce((n, l) => n + l.calls.length, 0)).toBe(3);
    expect(summary.leads.map((l) => l.callsInPeriod)).toEqual([3, 2]);
    expect(summary.detailsTruncated).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { historyText } from "../workTaskLabels";

const at = new Date("2026-10-27T08:05:00Z"); // 9:05 Praha
const h = (kind: string, metadata: unknown = null) => historyText({ kind, metadata, actorName: "Jaroslav Viner", createdAt: at });

describe("Práce 1.1 — čitelná historie", () => {
  it("každá změna s časem, popisem a uživatelem", () => {
    expect(h("created")).toMatch(/^27\. 10\.,? 09:05 — zadáno \(Jaroslav Viner\)$/);
    expect(h("priority_changed", { from: "normal", to: "urgent" })).toContain("priorita: běžná → urgentní");
    expect(h("reassigned", { from: "06240ac4-c050-47ea-998c-6c81389edf9f", to: "x" })).toContain("přeřazeno: Jaroslav Blahout → x");
    expect(h("cancelled", { reason: "Hotovo jinak" })).toContain("zrušeno (důvod: Hotovo jinak)");
    expect(h("cancelled", { reason: null })).toContain("— zrušeno (");
    expect(
      h("updated", { changes: { title: { from: "A", to: "B" }, dueDate: { from: "2026-10-27", to: "2026-10-29" }, description: { from: null, to: "x" } } })
    ).toContain("upraveno: název „A“ → „B“; termín 27. 10. 2026 → 29. 10. 2026; popis změněn");
  });
});

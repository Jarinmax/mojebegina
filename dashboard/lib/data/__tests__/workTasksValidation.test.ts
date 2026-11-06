import { describe, expect, it } from "vitest";
import { diffWorkTask, pragueToday, validateCancelReason, validateCreateWorkTask, validateReturnReason, workTaskTone } from "../workTasksValidation";
import { landingForExecutive } from "../workTasksAuth";

const A = ["u1"];
describe("validateCreateWorkTask", () => {
  it("název povinný, termín jen platný den, priorita normal/urgent", () => {
    expect(validateCreateWorkTask({ title: " Úkol ", description: " ", assigneeUserId: "u1", dueDate: "2026-10-27", priority: "" }, A))
      .toEqual({
        ok: true,
        value: { title: "Úkol", description: null, assigneeUserId: "u1", dueDate: "2026-10-27", priority: "normal", photoRequirement: "none", requiresApproval: false },
      });
    expect(validateCreateWorkTask({ title: "", description: "", assigneeUserId: "u1", dueDate: "", priority: "normal" }, A).ok).toBe(false);
    expect(validateCreateWorkTask({ title: "x", description: "", assigneeUserId: "u2", dueDate: "", priority: "normal" }, A).ok).toBe(false);
    expect(validateCreateWorkTask({ title: "x", description: "", assigneeUserId: "u1", dueDate: "2026-02-30", priority: "normal" }, A).ok).toBe(false);
    expect(validateCreateWorkTask({ title: "x", description: "", assigneeUserId: "u1", dueDate: "", priority: "high" }, A).ok).toBe(false);
  });
});

describe("workTaskTone — schválené barvy", () => {
  const today = "2026-10-27";
  it("zelená splněno, červená urgentní i po termínu, oranžová dnes/zítra, modrá ostatní", () => {
    expect(workTaskTone({ status: "done", priority: "urgent", dueDate: "2026-10-01" }, today)).toBe("green");
    expect(workTaskTone({ status: "open", priority: "urgent", dueDate: null }, today)).toBe("red");
    expect(workTaskTone({ status: "open", priority: "normal", dueDate: "2026-10-26" }, today)).toBe("red");
    expect(workTaskTone({ status: "open", priority: "normal", dueDate: "2026-10-27" }, today)).toBe("orange");
    expect(workTaskTone({ status: "open", priority: "normal", dueDate: "2026-10-28" }, today)).toBe("orange");
    expect(workTaskTone({ status: "open", priority: "normal", dueDate: "2026-10-30" }, today)).toBe("blue");
    expect(workTaskTone({ status: "open", priority: "normal", dueDate: null }, today)).toBe("blue");
  });
  it("dnešek v Praze (ne UTC)", () => {
    expect(pragueToday(new Date("2026-10-27T23:30:00Z"))).toBe("2026-10-28");
  });
});

describe("přistání po přihlášení", () => {
  it("Blahout → /prace, ostatní EXECUTIVE → /executive", () => {
    expect(landingForExecutive("06240ac4-c050-47ea-998c-6c81389edf9f")).toBe("/prace");
    expect(landingForExecutive("jiny")).toBe("/executive");
  });
});

describe("Práce 1.1 — diffWorkTask, zrušené, důvod", () => {
  const base = { title: "A", description: null, dueDate: "2026-10-27", priority: "normal", assigneeUserId: "u1" };
  it("beze změny = nic; obsah, priorita a přeřazení = samostatné záznamy", () => {
    expect(diffWorkTask(base, { ...base })).toEqual([]);
    expect(diffWorkTask(base, { ...base, title: "B", dueDate: null, priority: "urgent", assigneeUserId: "u2" })).toEqual([
      { kind: "updated", metadata: { changes: { title: { from: "A", to: "B" }, dueDate: { from: "2026-10-27", to: null } } } },
      { kind: "priority_changed", metadata: { from: "normal", to: "urgent" } },
      { kind: "reassigned", metadata: { from: "u1", to: "u2" } },
    ]);
  });
  it("zrušený úkol je šedý i když byl urgentní", () => {
    expect(workTaskTone({ status: "cancelled", priority: "urgent", dueDate: "2026-01-01" }, "2026-10-27")).toBe("grey");
  });
  it("důvod zrušení je nepovinný, max. 500 znaků", () => {
    expect(validateCancelReason("  ")).toEqual({ ok: true, value: null });
    expect(validateCancelReason("x".repeat(501)).ok).toBe(false);
  });
});

describe("Práce 2.0 — fotografie, schválení, barvy", () => {
  const base = { title: "x", description: "", assigneeUserId: "u1", dueDate: "", priority: "normal" };
  it("nastavení fotografie: none / required / optional; jiné odmítne", () => {
    for (const p of ["none", "required", "optional"]) {
      const r = validateCreateWorkTask({ ...base, photoRequirement: p, requiresApproval: true }, ["u1"]);
      expect(r.ok && r.value).toMatchObject({ photoRequirement: p, requiresApproval: true });
    }
    expect(validateCreateWorkTask({ ...base, photoRequirement: "always" }, ["u1"]).ok).toBe(false);
  });
  it("vráceno k opravě = červená, čeká na schválení = vlastní tón, schválené = zelená", () => {
    const today = "2026-10-27";
    expect(workTaskTone({ status: "returned", priority: "normal", dueDate: "2026-12-01" }, today)).toBe("red");
    expect(workTaskTone({ status: "submitted", priority: "urgent", dueDate: "2026-10-01" }, today)).toBe("waiting");
    expect(workTaskTone({ status: "done", priority: "normal", dueDate: null }, today)).toBe("green");
  });
  it("důvod vrácení je povinný", () => {
    expect(validateReturnReason(" ").ok).toBe(false);
    expect(validateReturnReason(" Chybí fotka ")).toEqual({ ok: true, value: "Chybí fotka" });
    expect(validateReturnReason("x".repeat(1001)).ok).toBe(false);
  });
  it("změna nastavení fotky a schválení je v historii úprav", () => {
    const before = { title: "A", description: null, dueDate: null, priority: "normal", assigneeUserId: "u1", photoRequirement: "none", requiresApproval: false };
    expect(diffWorkTask(before, { ...before, photoRequirement: "required", requiresApproval: true })).toEqual([
      { kind: "updated", metadata: { changes: { photoRequirement: { from: "none", to: "required" }, requiresApproval: { from: "ne", to: "ano" } } } },
    ]);
  });
});

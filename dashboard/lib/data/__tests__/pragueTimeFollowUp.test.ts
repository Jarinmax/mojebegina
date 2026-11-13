// Etapa 0 (rozhodnutí 3) — jednotné pravidlo termínu dalšího kontaktu
// (pragueTime.ts:parseFollowUpInput), sdílené CRM, Denním voláním i MCP.
import { describe, expect, it } from "vitest";
import { DEFAULT_FOLLOW_UP_TIME, parseFollowUpInput } from "../pragueTime";

const iso = (r: ReturnType<typeof parseFollowUpInput>) => (r.ok ? r.value?.toISOString() ?? null : `ERR:${r.error}`);

describe("parseFollowUpInput", () => {
  it("výchozí čas je 09:00", () => {
    expect(DEFAULT_FOLLOW_UP_TIME).toBe("09:00");
  });

  it("nic nevyplněno = null (termín se nemění)", () => {
    expect(parseFollowUpInput("", "")).toEqual({ ok: true, value: null });
    expect(parseFollowUpInput(null, undefined)).toEqual({ ok: true, value: null });
    expect(parseFollowUpInput("  ", " ")).toEqual({ ok: true, value: null });
  });

  it("jen datum = 09:00 Europe/Prague v létě i v zimě", () => {
    expect(iso(parseFollowUpInput("2026-10-24", ""))).toBe("2026-10-24T07:00:00.000Z"); // poslední den letního času
    expect(iso(parseFollowUpInput("2026-10-25", ""))).toBe("2026-10-25T08:00:00.000Z"); // den přechodu, 9:00 už zimní
    expect(iso(parseFollowUpInput("2026-03-29", ""))).toBe("2026-03-29T07:00:00.000Z"); // den jarního přechodu
  });

  it("datum + čas = přesně ten čas v Praze", () => {
    expect(iso(parseFollowUpInput("2026-11-02", "14:30"))).toBe("2026-11-02T13:30:00.000Z");
  });

  it("jen čas bez data, neexistující a dvojznačný čas = chyba", () => {
    expect(parseFollowUpInput("", "10:00").ok).toBe(false);
    expect(parseFollowUpInput("2026-03-29", "02:30").ok).toBe(false); // jarní díra
    expect(parseFollowUpInput("2026-10-25", "02:30").ok).toBe(false); // podzimní dvojznačnost
    expect(parseFollowUpInput("2026-02-30", "").ok).toBe(false);
  });
});

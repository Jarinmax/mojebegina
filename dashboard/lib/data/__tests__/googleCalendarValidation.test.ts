import { describe, expect, it } from "vitest";
import {
  pragueDateTimeToUtc,
  effectiveNextFollowUpAt,
  resolveReconcileAction,
  buildGoogleEventId,
  buildEventTitle,
  buildEventDescription,
  buildReminderMinutes,
  createOrPatchEvent,
  GoogleConflictError,
  EVENT_DURATION_MINUTES,
  type GoogleCalendarClient,
  type CalendarEventInput,
} from "../googleCalendarValidation";

// Security Phase 20 (Google Kalendář 1.0) — Europe/Prague bez ručního
// offsetu, přes Luxon s explicitní round-trip kontrolou existence a
// samostatnou kontrolou dvojznačnosti (schváleno explicitně — žádné
// spoléhání na to, kterou variantu by si knihovna vybrala sama).
describe("pragueDateTimeToUtc — Security Phase 20", () => {
  it("běžný zimní čas (CET, UTC+1)", () => {
    const result = pragueDateTimeToUtc("2026-01-15", "10:00");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toISOString()).toBe("2026-01-15T09:00:00.000Z");
    }
  });

  it("běžný letní čas (CEST, UTC+2)", () => {
    const result = pragueDateTimeToUtc("2026-07-15", "10:00");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toISOString()).toBe("2026-07-15T08:00:00.000Z");
    }
  });

  it("neexistující čas při jarním přechodu (2026-03-29, 2:00→3:00) je odmítnut, i kdyby ho Luxon tiše posunul", () => {
    const result = pragueDateTimeToUtc("2026-03-29", "02:30");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/neexistuje/);
    }
  });

  it("dvojznačný čas při podzimním přechodu (2026-10-25, 3:00→2:00) je odmítnut", () => {
    const result = pragueDateTimeToUtc("2026-10-25", "02:30");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/nejednoznačný/);
    }
  });

  it("normální čas v den jarního přechodu mimo problematickou hodinu projde (před přechodem, CET)", () => {
    const result = pragueDateTimeToUtc("2026-03-29", "01:30");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toISOString()).toBe("2026-03-29T00:30:00.000Z");
    }
  });

  it("normální čas v den jarního přechodu mimo problematickou hodinu projde (po přechodu, CEST)", () => {
    const result = pragueDateTimeToUtc("2026-03-29", "03:30");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    }
  });

  it("normální čas v den podzimního přechodu mimo problematickou hodinu projde (před přechodem, CEST)", () => {
    const result = pragueDateTimeToUtc("2026-10-25", "01:30");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toISOString()).toBe("2026-10-24T23:30:00.000Z");
    }
  });

  it("normální čas v den podzimního přechodu mimo problematickou hodinu projde (po přechodu, CET)", () => {
    const result = pragueDateTimeToUtc("2026-10-25", "04:30");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toISOString()).toBe("2026-10-25T03:30:00.000Z");
    }
  });

  it("neplatný formát data/času je odmítnut", () => {
    expect(pragueDateTimeToUtc("15.1.2026", "10:00").ok).toBe(false);
    expect(pragueDateTimeToUtc("2026-01-15", "10h00").ok).toBe(false);
  });
});

describe("effectiveNextFollowUpAt — Security Phase 20", () => {
  const someDate = new Date("2026-06-01T10:00:00.000Z");

  it("aktivní fáze vrací skutečný termín", () => {
    expect(effectiveNextFollowUpAt("new", someDate)).toBe(someDate);
    expect(effectiveNextFollowUpAt("callback_later", someDate)).toBe(someDate);
  });

  it("converted vrací vždy null, i když je termín v DB vyplněný", () => {
    expect(effectiveNextFollowUpAt("converted", someDate)).toBeNull();
  });

  it("not_interested vrací vždy null, i když je termín v DB vyplněný", () => {
    expect(effectiveNextFollowUpAt("not_interested", someDate)).toBeNull();
  });

  it("aktivní fáze bez termínu vrací null", () => {
    expect(effectiveNextFollowUpAt("new", null)).toBeNull();
  });
});

// Pořadí priorit je závazné — mazání má nejvyšší prioritu (oprava chyby,
// kdy termín=null + existující event + pending/failed chybně vycházelo
// jako update).
describe("resolveReconcileAction — Security Phase 20", () => {
  const now = new Date("2026-06-01T10:00:00.000Z");
  const later = new Date("2026-06-02T10:00:00.000Z");

  it("termín null + existující event + pending → delete (ne update)", () => {
    expect(
      resolveReconcileAction({
        currentNextFollowUpAt: null,
        syncedNextFollowUpAt: now,
        googleEventId: "mbabc",
        syncStatus: "pending",
      })
    ).toBe("delete");
  });

  it("termín null + existující event + failed → delete (ne update)", () => {
    expect(
      resolveReconcileAction({
        currentNextFollowUpAt: null,
        syncedNextFollowUpAt: now,
        googleEventId: "mbabc",
        syncStatus: "failed",
      })
    ).toBe("delete");
  });

  it("termín null + existující event + synced → delete", () => {
    expect(
      resolveReconcileAction({
        currentNextFollowUpAt: null,
        syncedNextFollowUpAt: now,
        googleEventId: "mbabc",
        syncStatus: "synced",
      })
    ).toBe("delete");
  });

  it("termín null + žádný event → noop", () => {
    expect(
      resolveReconcileAction({
        currentNextFollowUpAt: null,
        syncedNextFollowUpAt: null,
        googleEventId: null,
        syncStatus: "synced",
      })
    ).toBe("noop");
  });

  it("termín vyplněný + žádný event → create", () => {
    expect(
      resolveReconcileAction({
        currentNextFollowUpAt: now,
        syncedNextFollowUpAt: null,
        googleEventId: null,
        syncStatus: "pending",
      })
    ).toBe("create");
  });

  it("termín vyplněný, beze změny, event existuje, pending → update (retry/obsah mohl zůstat)", () => {
    expect(
      resolveReconcileAction({
        currentNextFollowUpAt: now,
        syncedNextFollowUpAt: now,
        googleEventId: "mbabc",
        syncStatus: "pending",
      })
    ).toBe("update");
  });

  it("termín vyplněný, beze změny, event existuje, failed → update", () => {
    expect(
      resolveReconcileAction({
        currentNextFollowUpAt: now,
        syncedNextFollowUpAt: now,
        googleEventId: "mbabc",
        syncStatus: "failed",
      })
    ).toBe("update");
  });

  it("termín se změnil, event existuje, synced → update", () => {
    expect(
      resolveReconcileAction({
        currentNextFollowUpAt: later,
        syncedNextFollowUpAt: now,
        googleEventId: "mbabc",
        syncStatus: "synced",
      })
    ).toBe("update");
  });

  it("termín beze změny, event existuje, synced → noop", () => {
    expect(
      resolveReconcileAction({
        currentNextFollowUpAt: now,
        syncedNextFollowUpAt: now,
        googleEventId: "mbabc",
        syncStatus: "synced",
      })
    ).toBe("noop");
  });
});

describe("buildGoogleEventId — Security Phase 20", () => {
  it("je deterministické — stejný leadId dá vždy stejné id", () => {
    const leadId = "384780b8-a988-4fec-badc-2f613f958bd4";
    expect(buildGoogleEventId(leadId)).toBe(buildGoogleEventId(leadId));
  });

  it("obsahuje jen znaky platné pro Google event id (base32hex: 0-9a-v)", () => {
    const id = buildGoogleEventId("384780b8-a988-4fec-badc-2f613f958bd4");
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it("různé leady dají různá id", () => {
    expect(buildGoogleEventId("11111111-1111-1111-1111-111111111111")).not.toBe(
      buildGoogleEventId("22222222-2222-2222-2222-222222222222")
    );
  });
});

describe("obsah události — Security Phase 20", () => {
  it("buildEventTitle má formát 'Zavolat: <jméno>'", () => {
    expect(buildEventTitle("Drops Dino")).toBe("Zavolat: Drops Dino");
  });

  it("buildEventDescription obsahuje telefon, poznámku a odkaz", () => {
    const desc = buildEventDescription({
      contactPhone: "+420 604 495 505",
      note: "Chce vzorek",
      leadUrl: "https://mojebegina.cz/rizeni-firmy/obchod/leady/abc",
    });
    expect(desc).toContain("+420 604 495 505");
    expect(desc).toContain("Chce vzorek");
    expect(desc).toContain("https://mojebegina.cz/rizeni-firmy/obchod/leady/abc");
  });

  it("buildEventDescription vynechá chybějící telefon/poznámku", () => {
    const desc = buildEventDescription({ contactPhone: null, note: null, leadUrl: "https://x/y" });
    expect(desc).not.toContain("Telefon:");
    expect(desc).not.toContain("Poznámka:");
  });

  it("trvání události je 15 minut", () => {
    expect(EVENT_DURATION_MINUTES).toBe(15);
  });
});

describe("buildReminderMinutes — Security Phase 20", () => {
  it("hovor ve 20:00 (po 9:00) dá tři odlišná upozornění: 20, 120 a minuty do 9:00", () => {
    const start = pragueDateTimeToUtc("2026-07-15", "20:00");
    if (!start.ok) throw new Error("setup failed");
    expect(buildReminderMinutes(start.value)).toEqual([20, 120, 660]);
  });

  it("hovor v 11:00 dedupuje shodné upozornění (9:00 i 2h před = 120 minut)", () => {
    const start = pragueDateTimeToUtc("2026-07-15", "11:00");
    if (!start.ok) throw new Error("setup failed");
    expect(buildReminderMinutes(start.value)).toEqual([20, 120]);
  });

  it("hovor před 9:00 nemá upozornění na 9:00", () => {
    const start = pragueDateTimeToUtc("2026-07-15", "08:30");
    if (!start.ok) throw new Error("setup failed");
    expect(buildReminderMinutes(start.value)).toEqual([20, 120]);
  });

  it("hovor přesně v 9:00 má upozornění 0 minut před (splývá se začátkem)", () => {
    const start = pragueDateTimeToUtc("2026-07-15", "09:00");
    if (!start.ok) throw new Error("setup failed");
    expect(buildReminderMinutes(start.value)).toEqual([0, 20, 120]);
  });
});

// Simuluje přesně nahlášený rizikový scénář: Google událost vytvoří,
// Vercel spadne před zápisem google_event_id do DB, uživatel klikne
// "Zkusit znovu" — retry musí jít přes patch, nikdy druhý insert.
function makeEvent(): CalendarEventInput {
  return {
    summary: "Zavolat: Drops Dino",
    description: "Telefon: +420 604 495 505",
    startUtc: new Date("2026-06-01T10:00:00.000Z"),
    durationMinutes: 15,
    reminderMinutes: [20, 120],
  };
}

describe("createOrPatchEvent — Security Phase 20 (idempotence vůči pádu mezi Googlem a DB)", () => {
  it("běžný případ: event ještě neexistuje → jen insertEvent, žádný patch", async () => {
    const calls: string[] = [];
    const client: GoogleCalendarClient = {
      insertEvent: async () => {
        calls.push("insert");
      },
      patchEvent: async () => {
        calls.push("patch");
      },
      deleteEvent: async () => {
        calls.push("delete");
      },
    };
    const result = await createOrPatchEvent(client, "cal-1", "mbabc", makeEvent());
    expect(result).toBe("created");
    expect(calls).toEqual(["insert"]);
  });

  it("retry po pádu mezi Googlem a DB: insertEvent vrátí konflikt → spadne na patch, žádný druhý insert", async () => {
    const calls: string[] = [];
    const client: GoogleCalendarClient = {
      insertEvent: async () => {
        calls.push("insert");
        throw new GoogleConflictError("already exists");
      },
      patchEvent: async () => {
        calls.push("patch");
      },
      deleteEvent: async () => {
        calls.push("delete");
      },
    };
    const result = await createOrPatchEvent(client, "cal-1", "mbabc", makeEvent());
    expect(result).toBe("patched");
    // Přesně jeden insert pokus (ten, co narazí na konflikt) a přesně
    // jeden patch — nikdy druhý insert, žádná duplicitní událost.
    expect(calls).toEqual(["insert", "patch"]);
  });

  it("jiná chyba než konflikt se nepohltí a nejde na patch", async () => {
    const client: GoogleCalendarClient = {
      insertEvent: async () => {
        throw new Error("network timeout");
      },
      patchEvent: async () => {
        throw new Error("nemělo se volat");
      },
      deleteEvent: async () => {},
    };
    await expect(createOrPatchEvent(client, "cal-1", "mbabc", makeEvent())).rejects.toThrow("network timeout");
  });
});

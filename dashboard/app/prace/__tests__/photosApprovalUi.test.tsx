// @vitest-environment jsdom
//
// Práce 2.0 — ovládání klepnutím: tlačítka podle typu úkolu, fotoaparát a
// galerie, povinný důvod vrácení, texty historie.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({
  setWorkTaskDoneAction: async () => null,
  reviewWorkTaskAction: async () => null,
  removeWorkTaskPhotoAction: async () => null,
}));

import TaskCard from "../TaskCard";
import PhotoUploader from "../ukol/[id]/PhotoUploader";
import ReviewPanel from "../ukol/[id]/ReviewPanel";
import PhotoGallery from "../ukol/[id]/PhotoGallery";
import { historyText } from "../workTaskLabels";

afterEach(() => cleanup());

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Destičky",
  description: null,
  assigneeName: "Jaroslav Blahout",
  dueLabel: "termín dnes",
  urgent: false,
  done: false,
  cancelled: false,
  doneLabel: null,
  tone: "orange" as const,
  toneLabel: "Blíží se termín",
  history: [],
};

describe("TaskCard — tlačítko podle typu úkolu", () => {
  it("úkol s fotkou: „Přiložit fotky“ vede na detail", () => {
    render(<TaskCard task={{ ...base, action: "photos" }} showAssignee={false} />);
    expect(screen.getByRole("link", { name: "Přiložit fotky" }).getAttribute("href")).toBe(`/prace/ukol/${base.id}`);
  });
  it("úkol se schválením: „Odeslat ke kontrole“", () => {
    render(<TaskCard task={{ ...base, action: "submit" }} showAssignee={false} />);
    expect(screen.getByRole("button", { name: "Odeslat ke kontrole" })).toBeTruthy();
  });
  it("čeká na schválení: žádné tlačítko; vrácený úkol ukáže důvod", () => {
    render(<TaskCard task={{ ...base, action: "none", tone: "red", toneLabel: "Vráceno k opravě", alert: "Vráceno k opravě: chybí detail" }} showAssignee={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Vráceno k opravě: chybí detail")).toBeTruthy();
  });
});

describe("PhotoUploader", () => {
  it("„Vyfotit“ otevře fotoaparát, „Z galerie“ dovolí víc fotek", () => {
    const { container } = render(<PhotoUploader taskId={base.id} remaining={12} />);
    const inputs = container.querySelectorAll('input[type="file"]');
    expect(inputs[0].getAttribute("capture")).toBe("environment");
    expect(inputs[0].getAttribute("accept")).toBe("image/*");
    expect(inputs[1].hasAttribute("multiple")).toBe(true);
    expect(screen.getByRole("button", { name: /Vyfotit/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Z galerie" })).toBeTruthy();
  });
  it("po dosažení limitu jsou tlačítka neaktivní", () => {
    render(<PhotoUploader taskId={base.id} remaining={0} />);
    expect((screen.getByRole("button", { name: /Vyfotit/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ReviewPanel", () => {
  it("„Vrátit k opravě“ nejdřív ukáže povinné pole pro důvod", () => {
    render(<ReviewPanel taskId={base.id} />);
    expect(screen.getByRole("button", { name: "Schválit" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Vrátit k opravě" }));
    const reason = screen.getByLabelText("Důvod vrácení") as HTMLTextAreaElement;
    expect(reason.required).toBe(true);
    expect(screen.queryByRole("button", { name: "Schválit" })).toBeNull();
  });
});

describe("PhotoGallery", () => {
  it("fotky se otevírají přes ověřený odkaz; odstranit jde jen nezamčenou", () => {
    render(<PhotoGallery taskId={base.id} photos={[{ id: "p1", caption: "J. B. · 9:05", removable: true }, { id: "p2", caption: "x", removable: false }]} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/api/prace/foto/p1", "/api/prace/foto/p2"]);
    expect(screen.getAllByRole("button", { name: "Odstranit" })).toHaveLength(1);
  });
});

describe("historie — Práce 2.0", () => {
  const at = new Date("2026-10-27T08:05:00Z");
  const h = (kind: string, metadata: unknown = null, actorName = "Jaroslav Blahout") => historyText({ kind, metadata, actorName, createdAt: at });
  it("kdo a kdy přidal fotku, odeslal, schválil nebo vrátil (s důvodem)", () => {
    expect(h("photo_added")).toMatch(/09:05 — přidána fotografie \(Jaroslav Blahout\)$/);
    expect(h("photo_removed")).toContain("odstraněna fotografie");
    expect(h("submitted", { photos: 2 })).toContain("odesláno ke kontrole (2 fot.)");
    expect(h("approved", null, "Jaroslav Viner")).toContain("schváleno (Jaroslav Viner)");
    expect(h("returned", { reason: "Chybí detail" }, "Jaroslav Viner")).toContain("vráceno k opravě (důvod: Chybí detail) (Jaroslav Viner)");
    expect(h("updated", { changes: { photoRequirement: { from: "none", to: "required" }, requiresApproval: { from: "ne", to: "ano" } } }))
      .toContain("fotografie nevyžadována → povinná; schválení ne → ano");
  });
});

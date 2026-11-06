// @vitest-environment jsdom
//
// Práce 1.1 — ovládání klepnutím: karta úkolu je obyčejný odkaz na detail,
// zrušení potřebuje dvě klepnutí (Zrušit úkol → Ano, zrušit).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../actions", () => ({
  setWorkTaskDoneAction: async () => null,
  cancelWorkTaskAction: async () => null,
}));

import TaskCard from "../TaskCard";
import CancelTaskPanel from "../ukol/[id]/CancelTaskPanel";

afterEach(() => cleanup());

const card = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Navrhnout zahrádku",
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

describe("TaskCard", () => {
  it("klepnutí na úkol vede na detail; tlačítko Splněno je mimo odkaz", () => {
    render(<TaskCard task={card} showAssignee={false} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(`/prace/ukol/${card.id}`);
    expect(link.textContent).toContain("Navrhnout zahrádku");
    const button = screen.getByRole("button", { name: "Splněno" });
    expect(link.contains(button)).toBe(false);
  });
  it("zrušený úkol nemá tlačítko Splněno", () => {
    render(<TaskCard task={{ ...card, cancelled: true, tone: "grey", toneLabel: "Zrušeno" }} showAssignee={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("CancelTaskPanel", () => {
  it("první klepnutí jen ukáže potvrzení; „Ne, ponechat“ vrátí zpět", () => {
    render(<CancelTaskPanel taskId={card.id} />);
    fireEvent.click(screen.getByRole("button", { name: "Zrušit úkol" }));
    expect(screen.getByRole("button", { name: "Ano, zrušit" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ne, ponechat" }));
    expect(screen.getByRole("button", { name: "Zrušit úkol" })).toBeTruthy();
  });
});

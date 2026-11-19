// @vitest-environment jsdom
// Štítek platby: po celém zapsaném vrácení „Vráceno“ místo „Zaplaceno“.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PaymentBadge } from "../OrderStatusBadges";

afterEach(cleanup);

describe("PaymentBadge", () => {
  it("zaplacená bez vrácení → Zaplaceno", () => {
    render(<PaymentBadge status="paid" refunded={false} />);
    expect(screen.getByText("Zaplaceno")).toBeTruthy();
  });

  it("peníze vrácené celé → Vráceno (přednost před stavem i splatností)", () => {
    render(<PaymentBadge status="paid" overdue refunded />);
    expect(screen.getByText("Vráceno")).toBeTruthy();
    expect(screen.queryByText("Zaplaceno")).toBeNull();
    expect(screen.queryByText("Po splatnosti")).toBeNull();
  });
});

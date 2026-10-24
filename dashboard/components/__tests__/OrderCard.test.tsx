// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import OrderCard from "../OrderCard";
import type { Order } from "@/mock/customer";

const unpaid: Order = {
  id: "idoklad-901",
  orderNumber: "Faktura č. 20260192",
  date: "22. 10. 2026",
  monthKey: "2026-10",
  items: [],
  products: "2× Dýňová polévka",
  totalKc: 758,
  status: "Neuhrazeno",
  paymentHref: "/faktury/901/zaplatit",
};

afterEach(cleanup);

describe("OrderCard", () => {
  it("ukáže zákazníkovi platbu u neuhrazené faktury", () => {
    render(<OrderCard order={unpaid} showPaymentAction />);
    expect(screen.getByRole("link", { name: "Zaplatit" }).getAttribute("href")).toBe("/faktury/901/zaplatit");
  });

  it("v administraci platební tlačítko nezobrazí", () => {
    render(<OrderCard order={unpaid} />);
    expect(screen.queryByRole("link", { name: "Zaplatit" })).toBeNull();
  });

  it("u uhrazené faktury platbu nenabídne", () => {
    render(<OrderCard order={{ ...unpaid, status: "Uhrazeno" }} showPaymentAction />);
    expect(screen.queryByRole("link", { name: "Zaplatit" })).toBeNull();
  });
});

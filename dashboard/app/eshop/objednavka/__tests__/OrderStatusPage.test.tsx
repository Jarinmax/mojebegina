// @vitest-environment jsdom
// Zákaznická stránka objednávky (odkaz z potvrzovacího e-mailu): stornovaná
// objednávka už nesmí vyzývat k platbě ani ukazovat platební údaje a QR.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PaymentOrder } from "@/lib/eshop/stripe/payment";

const ID = "48596a19-6622-4e65-b0c5-1840b2e6e149";
const state = vi.hoisted(() => ({ order: null as PaymentOrder | null }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/eshop/stripe/payment", async () => {
  const actual = await vi.importActual<typeof import("@/lib/eshop/stripe/payment")>("@/lib/eshop/stripe/payment");
  return { ...actual, loadPaymentOrder: async () => state.order };
});
vi.mock("../[id]/PayAgainButton", () => ({ default: () => <button>Zaplatit kartou</button> }));

const saved = { ...process.env };
beforeAll(() => {
  process.env.ESHOP_BANK_ACCOUNT = "19-2000145399/0800";
  process.env.ESHOP_BANK_IBAN = "CZ65 0800 0000 1920 0014 5399";
});
afterAll(() => {
  process.env = saved;
});
afterEach(cleanup);

function order(overrides: Partial<PaymentOrder>): PaymentOrder {
  return {
    id: ID,
    orderNumber: null,
    paymentVs: "70000001",
    orderedAt: new Date(),
    channel: "eshop",
    paymentMethodCode: "prevod",
    paymentStatus: "unpaid",
    fulfillmentStatus: "preparing",
    contactEmail: "viner.test@example.cz",
    subtotalKc: 129,
    discountKc: 0,
    shippingKc: 0,
    totalKc: 129,
    shippingMethodLabel: "Osobní vyzvednutí",
    items: [{ name: "Svařák Deluxe", quantity: 1, unitPriceKc: 129 }],
    ...overrides,
  } as PaymentOrder;
}

async function renderPage() {
  const { default: OrderStatusPage } = await import("../[id]/page");
  render(await OrderStatusPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) } as never));
}

describe("stránka objednávky pro zákazníka", () => {
  it("nezaplacená převodem: výzva k platbě s VS (kontrola, že platební údaje jinak jsou)", async () => {
    state.order = order({});
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Objednávka čeká na platbu převodem");
    expect(document.body.textContent).toContain("70000001");
    expect(document.querySelectorAll("svg").length).toBeGreaterThan(1); // ikona + QR
  });

  it("stornovaná nezaplacená: „byla zrušena“, už nehradit — žádné platební údaje, QR ani tlačítko platby", async () => {
    state.order = order({ fulfillmentStatus: "cancelled" });
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Objednávka byla zrušena");
    expect(document.body.textContent).toContain("Objednávku už prosím nehraďte.");
    expect(document.body.textContent).not.toMatch(/70000001|Číslo účtu|IBAN|Splatnost|po splatnosti/);
    // jediné SVG je ikona u nadpisu — žádný QR kód
    expect(document.querySelectorAll("svg")).toHaveLength(1);
    expect(document.body.textContent).not.toContain("QR");
    expect(screen.queryByText("Zaplatit kartou")).toBeNull();
  });

  it("stornovaná zaplacená: platba přijata, vrácení se domluví (nic automaticky)", async () => {
    state.order = order({ fulfillmentStatus: "cancelled", paymentStatus: "paid" });
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Objednávka byla zrušena");
    expect(document.body.textContent).toContain("Platbu za objednávku jsme přijali. O jejím vrácení se s vámi domluvíme");
    expect(document.body.textContent).not.toMatch(/automaticky|Zaplaceno — děkujeme/);
  });
});

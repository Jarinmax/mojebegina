// @vitest-environment jsdom
// Historie objednávky: u odeslaného potvrzení je vidět, jaké přílohy šly
// (obchodní podmínky a jejich znění, faktura), a varování, když PDF podmínek chybí.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import OrderActivityTimeline from "../OrderActivityTimeline";
import type { OrderActivityEntry } from "@/lib/data/orders";

afterEach(cleanup);

const entry = (id: string, kind: string, metadata: Record<string, unknown>): OrderActivityEntry => ({
  id,
  kind,
  actorType: "system",
  authorUserId: null,
  authorName: "E-shop",
  body: null,
  metadata,
  createdAt: new Date("2026-10-27T10:00:00Z"),
});

describe("historie objednávky — obchodní podmínky a přílohy", () => {
  it("vznik objednávky ukazuje znění podmínek, se kterým zákazník souhlasil", () => {
    render(<OrderActivityTimeline activity={[entry("1", "created", { channel: "eshop", termsVersion: "2026-10-27" })]} />);
    expect(screen.getByText(/založil\(a\) objednávku \(souhlas s obchodními podmínkami ve znění 2026-10-27\)/)).toBeTruthy();
  });

  it("odeslané potvrzení: přílohy (podmínky se zněním, faktura); bez příloh nic navíc", () => {
    render(
      <OrderActivityTimeline
        activity={[
          entry("1", "email_sent", {
            template: "customer_confirmation",
            to: ["jana@example.cz"],
            attachments: [
              { kind: "invoice", filename: "faktura-9260002.pdf", bytes: 1000 },
              { kind: "terms", version: "2026-10-27", filename: "obchodni-podminky-begina-2026-10-27.pdf", bytes: 48133, sha256: "x" },
            ],
          }),
          entry("2", "email_sent", { template: "internal_new_order", to: ["jaroslav@begina.cz"] }),
        ]}
      />
    );
    expect(
      screen.getByText(/potvrzení zákazníkovi \(jana@example\.cz\) — přílohy: faktura-9260002\.pdf, obchodní podmínky ve znění 2026-10-27 \(PDF\)/)
    ).toBeTruthy();
    expect(screen.getByText(/odeslal\(a\) e-mail: upozornění pro Beginu \(jaroslav@begina\.cz\)$/)).toBeTruthy();
  });

  it("PDF podmínek se nepodařilo přiložit → varování", () => {
    render(
      <OrderActivityTimeline
        activity={[entry("1", "email_sent", { template: "customer_confirmation", to: ["jana@example.cz"], termsAttachment: "failed" })]}
      />
    );
    expect(screen.getByText(/⚠ PDF obchodních podmínek se nepodařilo přiložit \(zákazník dostal odkaz ke stažení\)/)).toBeTruthy();
  });
});

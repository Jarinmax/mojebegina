import { describe, expect, it } from "vitest";
import { validateCheckoutInput, type CheckoutInput } from "../checkout";

function baseInput(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    cart: JSON.stringify([{ slug: "kulajda", quantity: 2 }]),
    name: "Jana Nováková",
    email: "jana@example.cz",
    phone: "+420 777 123 456",
    shippingMethodId: "rozvoz",
    paymentMethodId: "prevod",
    street: "Prvního pluku 14",
    city: "Praha",
    zip: "18600",
    note: "",
    termsAccepted: true,
    ...overrides,
  };
}

describe("validateCheckoutInput — E-shop 1.0", () => {
  it("platný vstup projde, ořízne mezery a naformátuje PSČ", () => {
    const result = validateCheckoutInput(baseInput({ name: "  Jana Nováková  " }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Jana Nováková");
      expect(result.value.address).toEqual({ street: "Prvního pluku 14", city: "Praha", zip: "186 00" });
      expect(result.value.pricedCart.totalKc).toBe(2 * 379 + 99);
      expect(result.value.note).toBeNull();
    }
  });

  it("osobní odběr adresu nevyžaduje ani neukládá", () => {
    const result = validateCheckoutInput(
      baseInput({ shippingMethodId: "osobni-odber", street: "", city: "", zip: "" })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.address).toBeNull();
    }
  });

  it("rozvoz bez adresy nebo se špatným PSČ = DENY", () => {
    expect(validateCheckoutInput(baseInput({ street: "" })).ok).toBe(false);
    expect(validateCheckoutInput(baseInput({ zip: "1860" }))).toEqual({
      ok: false,
      error: "Zadejte PSČ ve tvaru 123 45.",
    });
  });

  it("chybné kontaktní údaje = DENY", () => {
    expect(validateCheckoutInput(baseInput({ name: "  " })).ok).toBe(false);
    expect(validateCheckoutInput(baseInput({ email: "jana.example.cz" })).ok).toBe(false);
    expect(validateCheckoutInput(baseInput({ phone: "abc" })).ok).toBe(false);
  });

  it("nedostupná platba (karta) = DENY", () => {
    expect(validateCheckoutInput(baseInput({ paymentMethodId: "karta" }))).toEqual({
      ok: false,
      error: "Vyberte dostupný způsob platby.",
    });
  });

  it("bez souhlasu s obchodními podmínkami = DENY", () => {
    expect(validateCheckoutInput(baseInput({ termsAccepted: false })).ok).toBe(false);
  });

  it("prázdný nebo podvržený košík = DENY", () => {
    expect(validateCheckoutInput(baseInput({ cart: "[]" }))).toEqual({
      ok: false,
      error: "Košík je prázdný.",
    });
    expect(validateCheckoutInput(baseInput({ cart: "nesmysl" })).ok).toBe(false);
  });

  it("cena z klienta se ignoruje — počítá se vždy z katalogu", () => {
    const result = validateCheckoutInput(
      baseInput({ cart: JSON.stringify([{ slug: "kulajda", quantity: 1, priceKc: 1 }]) })
    );
    expect(result.ok && result.value.pricedCart.lines[0].unitPriceKc).toBe(379);
  });
});

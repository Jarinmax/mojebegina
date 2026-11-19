import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { itemsTextSuffix } from "@/lib/eshop/invoicing/b2bInvoice";

describe("B2B faktura — text pod položkami", () => {
  it("uhrazená bez poznámky = „Faktura je již uhrazena – neplaťte.“", () => {
    expect(itemsTextSuffix({ paid: true, note: null })).toBe("Faktura je již uhrazena – neplaťte.");
  });
  it("uhrazená s poznámkou: text o úhradě + poznámka; poznámku, která úhradu už zmiňuje, nechá", () => {
    expect(itemsTextSuffix({ paid: true, note: "Děkujeme." })).toBe("Faktura je již uhrazena – neplaťte.\nDěkujeme.");
    expect(itemsTextSuffix({ paid: true, note: "Uhrazeno hotově." })).toBe("Uhrazeno hotově.");
  });
  it("neuhrazená = jen poznámka", () => {
    expect(itemsTextSuffix({ paid: false, note: "Děkujeme." })).toBe("Děkujeme.");
    expect(itemsTextSuffix({ paid: false, note: null })).toBeNull();
  });
});

// @vitest-environment jsdom
//
// Mobilní test odkryl blokér: "Nová příjemka" bez dodavatelů nenabízela
// jejich vytvoření. Tenhle test ověřuje přímo to, co mobilní test
// požadoval: tlačítko "+ Založit dodavatele", a že po úspěšném založení se
// nový dodavatel automaticky vybere BEZ reloadu a BEZ ztráty rozepsaných
// údajů v ostatních polích (žádný router.refresh/redirect — jen lokální
// React stav, viz NovaPrijemkaForm.tsx).
//
// "../../actions" je "use server" modul (přes lib/data/sklad.ts, server-
// only, DB klient) — v jsdom testu není importovatelný, mockováno, stejná
// konvence jako CallLogForm.test.tsx/FulfillmentStatusForm.test.tsx.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import NovaPrijemkaForm from "../NovaPrijemkaForm";

const calls = vi.hoisted(() => ({
  createSupplierResult: null as { ok: true; supplierId: string } | { ok: false; error: string } | null,
  createSupplierInputs: [] as Array<{ name: string; ico: string; dic: string }>,
}));

vi.mock("../../actions", () => ({
  createDraftGoodsReceiptAction: async () => null,
  createSupplierForReceiptAction: async (input: { name: string; ico: string; dic: string }) => {
    calls.createSupplierInputs.push(input);
    return calls.createSupplierResult;
  },
}));

afterEach(() => {
  cleanup();
  calls.createSupplierInputs.length = 0;
});

const SUPPLIERS = [{ id: "s-1", name: "Existující dodavatel", ico: null, dic: null }];
const LOCATIONS = [{ id: "loc-1", code: "default", name: "Výchozí sklad" }];

describe("NovaPrijemkaForm — '+ Založit dodavatele' (mobilní blokér)", () => {
  // Nahlášený blokér 7. 11. 2026: bez dodavatele nabízel výběr jen
  // zakázanou placeholder možnost ("required" select bez jediné platné
  // položky) a tlačítko "+ Založit dodavatele" šlo snadno přehlédnout —
  // na mobilu (iOS Safari) to uživatele uzamklo na nativní hlášce
  // "Vyberte položku ze seznamu" bez cesty ven. Výběr se proto bez
  // dodavatele vůbec nevykresluje a formulář pro založení je rovnou
  // rozbalený, žádné tlačítko ho nejde schovat.
  it("bez dodavatelů se výběr nezobrazí, sub-formulář pro založení je rovnou rozbalený a odeslání příjemky je zablokované", () => {
    render(<NovaPrijemkaForm suppliers={[]} stockLocations={LOCATIONS} />);
    expect(screen.getByText("Zatím žádný dodavatel není založen — nejdřív ho založte níže.")).toBeTruthy();
    expect(screen.queryByLabelText("Dodavatel")).toBeNull();
    expect(screen.queryByText("+ Založit dodavatele")).toBeNull();
    expect(screen.queryByText("Zrušit zakládání dodavatele")).toBeNull();

    expect(screen.getByLabelText("Název *")).toBeTruthy();
    expect(screen.getByLabelText("IČO (nepovinné)")).toBeTruthy();
    expect(screen.getByLabelText("DIČ (nepovinné)")).toBeTruthy();

    expect((screen.getByText("Založit příjemku") as HTMLButtonElement).disabled).toBe(true);
  });

  it("po založení prvního dodavatele se objeví výběr (s novým dodavatelem rovnou vybraným) a odeslání příjemky se odblokuje", async () => {
    calls.createSupplierResult = { ok: true, supplierId: "s-new" };
    render(<NovaPrijemkaForm suppliers={[]} stockLocations={LOCATIONS} />);

    fireEvent.change(screen.getByLabelText("Název *"), { target: { value: "První dodavatel s.r.o." } });
    await act(async () => {
      fireEvent.click(screen.getByText("Uložit dodavatele"));
    });

    const select = screen.getByLabelText("Dodavatel") as HTMLSelectElement;
    expect(select.value).toBe("s-new");
    expect((screen.getByText("Založit příjemku") as HTMLButtonElement).disabled).toBe(false);
    // Teď už existuje dodavatel, takže se vrátil normální (schovatelný) tok.
    expect(screen.getByText("+ Založit dodavatele")).toBeTruthy();
    expect(screen.queryByLabelText("Název *")).toBeNull();
  });

  it("tlačítko lze znovu skrýt ('Zrušit zakládání dodavatele')", () => {
    render(<NovaPrijemkaForm suppliers={SUPPLIERS} stockLocations={LOCATIONS} />);
    fireEvent.click(screen.getByText("+ Založit dodavatele"));
    expect(screen.getByLabelText("Název *")).toBeTruthy();
    fireEvent.click(screen.getByText("Zrušit zakládání dodavatele"));
    expect(screen.queryByLabelText("Název *")).toBeNull();
  });

  it("úspěšné založení: nový dodavatel se objeví ve výběru a automaticky se vybere, sub-formulář zmizí, OSTATNÍ rozepsaná pole zůstanou (bez reloadu)", async () => {
    calls.createSupplierResult = { ok: true, supplierId: "s-new" };
    render(<NovaPrijemkaForm suppliers={SUPPLIERS} stockLocations={LOCATIONS} />);

    // Rozepsaný údaj v JINÉM poli PŘED založením dodavatele — nesmí zmizet.
    fireEvent.change(screen.getByLabelText("Číslo dokladu (nepovinné)"), { target: { value: "FA-123" } });

    fireEvent.click(screen.getByText("+ Založit dodavatele"));
    fireEvent.change(screen.getByLabelText("Název *"), { target: { value: "Nový dodavatel s.r.o." } });
    fireEvent.change(screen.getByLabelText("IČO (nepovinné)"), { target: { value: "12345678" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Uložit dodavatele"));
    });

    expect(calls.createSupplierInputs).toEqual([{ name: "Nový dodavatel s.r.o.", ico: "12345678", dic: "" }]);

    const select = screen.getByLabelText("Dodavatel") as HTMLSelectElement;
    expect(select.value).toBe("s-new");
    expect(screen.getByText("Nový dodavatel s.r.o.")).toBeTruthy();
    // Sub-formulář po úspěchu zmizel.
    expect(screen.queryByLabelText("Název *")).toBeNull();
    // Rozepsaná hodnota v jiném poli zůstala beze změny — žádný
    // reload/redirect, který by ji smazal.
    expect((screen.getByLabelText("Číslo dokladu (nepovinné)") as HTMLInputElement).value).toBe("FA-123");
  });

  it("duplicitní IČO (hláška ze serveru) se zobrazí česky; sub-formulář zůstane otevřený s rozepsanými údaji, hlavní výběr se nezmění", async () => {
    calls.createSupplierResult = { ok: false, error: "Dodavatel s tímto IČO už existuje." };
    render(<NovaPrijemkaForm suppliers={SUPPLIERS} stockLocations={LOCATIONS} />);

    fireEvent.click(screen.getByText("+ Založit dodavatele"));
    fireEvent.change(screen.getByLabelText("Název *"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("IČO (nepovinné)"), { target: { value: "74337297" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Uložit dodavatele"));
    });

    expect(screen.getByText("Dodavatel s tímto IČO už existuje.")).toBeTruthy();
    expect((screen.getByLabelText("Název *") as HTMLInputElement).value).toBe("Test");
    expect((screen.getByLabelText("Dodavatel") as HTMLSelectElement).value).toBe("");
    // Nepřibyla žádná nová položka ve výběru dodavatelů.
    expect(screen.queryByText("Test")).toBeNull();
  });

  it("validační chyba ze serveru (prázdný název) se zobrazí česky", async () => {
    calls.createSupplierResult = { ok: false, error: "Název dodavatele je povinný." };
    render(<NovaPrijemkaForm suppliers={SUPPLIERS} stockLocations={LOCATIONS} />);

    fireEvent.click(screen.getByText("+ Založit dodavatele"));
    await act(async () => {
      fireEvent.click(screen.getByText("Uložit dodavatele"));
    });

    expect(screen.getByText("Název dodavatele je povinný.")).toBeTruthy();
  });

  it("chyba z předchozího pokusu se skryje, jakmile se formulář pro dodavatele zavře a znovu otevře", async () => {
    calls.createSupplierResult = { ok: false, error: "Dodavatel s tímto IČO už existuje." };
    render(<NovaPrijemkaForm suppliers={SUPPLIERS} stockLocations={LOCATIONS} />);

    fireEvent.click(screen.getByText("+ Založit dodavatele"));
    await act(async () => {
      fireEvent.click(screen.getByText("Uložit dodavatele"));
    });
    expect(screen.getByText("Dodavatel s tímto IČO už existuje.")).toBeTruthy();

    fireEvent.click(screen.getByText("Zrušit zakládání dodavatele"));
    fireEvent.click(screen.getByText("+ Založit dodavatele"));
    expect(screen.queryByText("Dodavatel s tímto IČO už existuje.")).toBeNull();
  });
});

// Security Phase 2.3 — zobrazí se jen přihlášenému uživateli, který zatím
// nemá membership v žádné organizaci. Dřívější mock tenhle stav neznal
// (zákazník byl vždy napevno daný), reálná autorizace ho ale umožňuje, a
// dashboard na něj musí reagovat vlastním stavem, ne pádem ani cizími daty.
export default function NoOrganizationNotice() {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
      Váš účet zatím není přiřazený k žádné organizaci Moje Begina. Ozvěte se
      nám, ať vám přístup nastavíme.
    </div>
  );
}

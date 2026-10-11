// Prodávající (provozovatel e-shopu) — JEDINÉ místo s jeho údaji. Hodnoty
// převzaté z obchodních podmínek a zásad GDPR dodaných vedením (účinné
// 22. 9. 2026) a z patičky begina.cz. Berou se odsud obchodní podmínky,
// zásady GDPR, patička webu, patička e-mailů, vzorový formulář pro
// odstoupení i PDF pro zákazníka — nikde jinde se nepíšou natvrdo.
export const SELLER = {
  name: "Jaroslav Viner",
  ico: "74337297",
  /** sídlo */
  address: "Mostecká 273/21, 118 00 Praha 1",
  email: "info@begina.cz",
  phone: "+420 774 199 975",
  phoneHref: "tel:+420774199975",
  /** provozovna — osobní odběr, reklamace, korespondence (VOP čl. VI a VIII, GDPR čl. I) */
  premises: {
    name: "Zahradní Bistro Begina",
    street: "Vitice 119",
    city: "281 06 Vitice, okres Kolín",
  },
} as const;

/** „Zahradní Bistro Begina, Vitice 119, 281 06 Vitice, okres Kolín“ */
export const SELLER_PREMISES = `${SELLER.premises.name}, ${SELLER.premises.street}, ${SELLER.premises.city}`;

/** Identifikace prodávajícího jako v čl. I obchodních podmínek (řádky). */
export const SELLER_IDENTITY_LINES = [
  SELLER.name,
  `IČO: ${SELLER.ico}`,
  `sídlo: ${SELLER.address}`,
  `e-mail: ${SELLER.email}`,
  `telefon: ${SELLER.phone}`,
] as const;

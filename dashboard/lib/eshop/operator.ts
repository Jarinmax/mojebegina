// Údaje provozovatele e-shopu — samostatně, aby je mohly použít i texty
// v content/* bez kruhového importu přes infoPages.ts.
/** Údaje provozovatele (převzaté ze stávající patičky begina.cz). */
export const OPERATOR = {
  name: "Jaroslav Viner",
  phone: "+420 774 199 975",
  phoneHref: "tel:+420774199975",
  email: "info@begina.cz",
  address: "Mostecká 273/21, 118 00 Praha 1",
  ico: "74337297",
} as const;

/**
 * Provozovna a výdejní místo e-shopu (zadání Lucie, 6. 11. 2026).
 * Odkaz „Zobrazit na mapě“ otevře přímo záznam Zahradní Bistro Begina
 * v Google Mapách (place_id ověřeno 7. 11. 2026, telefon +420 774 199 975),
 * ne areál Zahradnictví Jandl. Adresu v panelu ukazuje Google ze svého
 * profilu firmy (Firma na Googlu) — ta se mění tam, ne tady.
 */
export const PICKUP_PLACE = {
  name: "Zahradní Bistro Begina",
  area: "areál Zahradnictví Jandl",
  address: "Vitice 119, 281 06 Vitice (okr. Kolín)",
  googlePlaceId: "ChIJHxHJWwZzDEcRemk96mp2U24",
  mapHref:
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("Zahradní Bistro Begina, Vitice") +
    "&query_place_id=ChIJHxHJWwZzDEcRemk96mp2U24",
} as const;

/**
 * Doručovací adresa pro odstoupení od smlouvy, reklamace a vrácené zboží
 * (zadání Lucie, 6. 11. 2026). Sídlo (OPERATOR.address) zůstává adresou
 * pro identifikaci a fakturaci.
 */
export const DELIVERY_ADDRESS = {
  recipient: `${OPERATOR.name} – ${PICKUP_PLACE.name}`,
  area: `(${PICKUP_PLACE.area})`,
  address: PICKUP_PLACE.address,
  email: OPERATOR.email,
  /** na jeden řádek: „Jaroslav Viner – Zahradní Bistro Begina (areál …), Vitice 119, …“ */
  oneLine: `${OPERATOR.name} – ${PICKUP_PLACE.name} (${PICKUP_PLACE.area}), ${PICKUP_PLACE.address}`,
} as const;

/**
 * Slovensko (rozhodnutí Lucie 12. 11. 2026): e-shop tam nedoručuje;
 * zájemce má objednávku poslat e-mailem. Věta se ukazuje v pokladně,
 * v chybách serveru i na stránce Doprava.
 */
export const SLOVAKIA_ORDER_NOTE = `Na Slovensko přes e-shop nedoručujeme — objednávku na Slovensko nám prosím pošlete e-mailem na ${OPERATOR.email}.`;

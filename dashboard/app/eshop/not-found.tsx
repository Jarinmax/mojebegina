import ShopLink from "@/components/eshop/ShopLink";

// 404 v designu e-shopu (begina.cz i /eshop na moje.begina.cz).
export default function EshopNotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Stránka nebyla nalezena</h1>
      <p className="mt-2 text-sm text-neutral-600">Tuto stránku jsme nenašli. Možná se změnila adresa nebo už neexistuje.</p>
      <ShopLink href="/" className="mt-6 inline-flex bg-begina-primary-900 text-white text-sm font-medium rounded-lg px-4 py-2.5">
        Zpět do e-shopu
      </ShopLink>
    </div>
  );
}

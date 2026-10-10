import { notFound } from "next/navigation";

// Neznámá adresa e-shopu (i každá nepovolená adresa na begina.cz, kam ji
// přepíše proxy.ts) → e-shopová stránka 404 (app/eshop/not-found.tsx).
export default function NotFoundCatchAll() {
  notFound();
}

import type { Metadata } from "next";
import OptoutForm from "@/components/eshop/OptoutForm";
import { emailFromOptoutToken, reviewSecret } from "@/lib/eshop/reviews";

// Odhlášení z obchodních sdělení (17. 11. 2026) — podepsaný odkaz z e-mailu.
export const metadata: Metadata = { title: "Odhlášení z e-mailů", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OptoutPage({ params }: PageProps<"/eshop/odhlaseni/[token]">) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  const secret = reviewSecret();
  const email = secret ? emailFromOptoutToken(decoded, secret) : null;
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Odhlášení z e-mailů</h1>
      {email ? <OptoutForm token={decoded} email={email} /> : <p className="mt-4 text-neutral-700">Tento odkaz není platný. Napište nám prosím na info@begina.cz a odhlásíme vás ručně.</p>}
    </div>
  );
}

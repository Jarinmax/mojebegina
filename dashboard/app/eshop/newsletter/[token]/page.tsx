import type { Metadata } from "next";
import ConfirmForm from "./ConfirmForm";
import { emailFromNewsletterToken, reviewSecret } from "@/lib/eshop/reviews";

// Potvrzení odběru newsletteru (double opt-in, 28. 11. 2026) — podepsaný odkaz z e-mailu.
export const metadata: Metadata = { title: "Potvrzení odběru novinek", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewsletterConfirmPage({ params }: PageProps<"/eshop/newsletter/[token]">) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  const secret = reviewSecret();
  const email = secret ? emailFromNewsletterToken(decoded, secret) : null;
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Potvrzení odběru novinek</h1>
      {email ? <ConfirmForm token={decoded} email={email} /> : <p className="mt-4 text-neutral-700">Tento odkaz není platný. Napište nám prosím na info@begina.cz.</p>}
    </div>
  );
}

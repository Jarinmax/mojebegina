"use client";

import ShopLink from "@/components/eshop/ShopLink";
import { useActionState } from "react";
import { confirmNewsletterAction, type ConfirmState } from "./actions";

// Potvrzení až po kliknutí — samotné otevření odkazu (kontrola pošty,
// náhled v e-mailu) souhlas neudělí.
export default function ConfirmForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmNewsletterAction, { status: "idle" });
  if (state.status === "done")
    return (
      <div className="mt-4">
        <p className="font-medium">Hotovo, děkujeme! Novinky budeme posílat na {email}.</p>
        <ShopLink href="/" className="mt-4 inline-flex items-center bg-begina-primary-900 text-white font-medium rounded-lg px-4 h-11">
          Pokračovat na e-shop
        </ShopLink>
      </div>
    );
  if (state.status === "expired")
    return <p className="mt-4 text-neutral-700">Tento odkaz už neplatí (adresa byla odhlášena). Přihlaste se prosím znovu v patičce webu.</p>;
  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <p className="text-neutral-700">
        Potvrďte prosím, že chcete na adresu <strong>{email}</strong> dostávat newsletter Begina – max. 2× měsíčně recepty, tipy na podávání a novinky. Odhlásit se jde kdykoli odkazem v každém e-mailu.
      </p>
      {state.status === "error" && <p role="alert" className="text-[#B40001]">Potvrzení se nepodařilo. Napište nám prosím na info@begina.cz.</p>}
      <button type="submit" disabled={pending} className="self-start bg-begina-primary-900 text-white font-medium rounded-lg px-4 h-11 disabled:opacity-60">
        {pending ? "Potvrzuji…" : "Potvrdit odběr"}
      </button>
    </form>
  );
}

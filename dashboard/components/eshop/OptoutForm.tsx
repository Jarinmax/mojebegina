"use client";

import { useActionState } from "react";
import { optoutAction, type OptoutState } from "@/app/eshop/odhlaseni/[token]/actions";

// Odhlášení až po kliknutí na tlačítko — samotné otevření odkazu (např.
// kontrolou pošty) nikoho neodhlásí.
export default function OptoutForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<OptoutState, FormData>(optoutAction, { status: "idle" });
  if (state.status === "done") return <p className="mt-4 font-medium">Hotovo. Na adresu {email} už obchodní sdělení posílat nebudeme.</p>;
  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <p className="text-neutral-700">Odhlásíte adresu <strong>{email}</strong> z obchodních sdělení Begina (newsletter, nabídky, žádosti o hodnocení nákupu). E-maily k objednávkám (potvrzení, faktura) vám budeme posílat dál.</p>
      {state.status === "error" && <p role="alert" className="text-[#B40001]">Odhlášení se nepodařilo. Napište nám prosím na info@begina.cz.</p>}
      <button type="submit" disabled={pending} className="self-start bg-begina-primary-900 text-white font-medium rounded-lg px-4 h-11 disabled:opacity-60">
        {pending ? "Odhlašuji…" : "Odhlásit se"}
      </button>
    </form>
  );
}

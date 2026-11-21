"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";

// Security Phase 2.4 — zákaznický přihlašovací formulář. Jen e-mail +
// heslo. Účty zakládáme zatím sami ručně (viz Fáze 2.3), proto tu není
// žádná self-service registrace.
// `next` už ověřený na serveru (safeNextPath v app/login/page.tsx).
export default function LoginForm({ next = "/" }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    // Safari may autofill credentials without firing React's onChange event.
    // Read the submitted DOM values so autofill works even when React state
    // has not been synchronized with the inputs.
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    // Auth request jde přes proxy na upstream Neon Auth server — může
    // selhat i mimo běžnou "špatné heslo" odpověď (nedostupný/špatně
    // nakonfigurovaný upstream, síťová chyba, neočekávaný tvar odpovědi).
    // Bez try/catch by takový pád nechal tlačítko navždy na "Přihlašuji…"
    // bez jakékoli hlášky.
    try {
      const { error } = await authClient.signIn.email({ email, password });

      if (error) {
        setBusy(false);
        setError("Nesprávný e-mail nebo heslo.");
        return;
      }

      // Plná navigace (ne router.push) — vynutí nový request se čerstvou
      // session cookie, aby server na "/" hned viděl přihlášeného uživatele.
      window.location.href = next;
    } catch {
      setBusy(false);
      setError("Přihlášení se nezdařilo. Zkuste to prosím znovu.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="email" className="text-xs text-neutral-500 mb-1 block">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>
      <div>
        <label htmlFor="password" className="text-xs text-neutral-500 mb-1 block">
          Heslo
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      {error && <p className="text-sm text-begina-accent-700">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg py-2.5 disabled:opacity-50"
      >
        {busy ? "Přihlašuji…" : "Přihlásit"}
      </button>
    </form>
  );
}

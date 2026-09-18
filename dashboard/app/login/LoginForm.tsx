"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";

// Security Phase 2.4 — zákaznický přihlašovací formulář. Jen e-mail +
// heslo. Účty zakládáme zatím sami ručně (viz Fáze 2.3), proto tu není
// žádná self-service registrace.
export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await authClient.signIn.email({ email, password });

    if (error) {
      setBusy(false);
      setError("Nesprávný e-mail nebo heslo.");
      return;
    }

    // Plná navigace (ne router.push) — vynutí nový request se čerstvou
    // session cookie, aby server na "/" hned viděl přihlášeného uživatele.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="email" className="text-xs text-neutral-500 mb-1 block">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>
      <div>
        <label htmlFor="password" className="text-xs text-neutral-500 mb-1 block">
          Heslo
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      {error && <p className="text-sm text-begina-accent-700">{error}</p>}

      <button
        type="submit"
        disabled={busy || !email || !password}
        className="w-full text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg py-2.5 disabled:opacity-50"
      >
        {busy ? "Přihlašuji…" : "Přihlásit"}
      </button>
    </form>
  );
}

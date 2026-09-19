"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";

// Security Phase 1.1A — aktivace účtu i "zapomenuté heslo" vedou přes
// stejnou better-auth cestu (reset-password): pokud uživatel ještě nemá
// credential, server ho při tomhle volání rovnou vytvoří (viz
// node_modules/@neondatabase/auth/.../api/routes/password.mjs) — appka
// mezi "první nastavení" a "reset" nijak nerozlišuje.
type Props = {
  token: string;
};

export default function NastavitHesloForm({ token }: Props) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError("Hesla se neshodují.");
      return;
    }

    setBusy(true);
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    });

    if (error) {
      setBusy(false);
      setError(
        error.code === "PASSWORD_TOO_SHORT" || error.code === "PASSWORD_TOO_LONG"
          ? "Heslo nemá povolenou délku."
          : error.code === "INVALID_TOKEN"
            ? "Odkaz už není platný. Požádejte o nový."
            : "Nepodařilo se nastavit heslo. Zkuste to prosím znovu."
      );
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-begina-primary-900">
          Heslo je nastaveno. Teď se s ním můžete přihlásit.
        </p>
        <a
          href="/login"
          className="w-full text-center text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg py-2.5"
        >
          Pokračovat na přihlášení
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="password" className="text-xs text-neutral-500 mb-1 block">
          Nové heslo
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>
      <div>
        <label htmlFor="password-confirm" className="text-xs text-neutral-500 mb-1 block">
          Nové heslo znovu
        </label>
        <input
          id="password-confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      {error && <p className="text-sm text-begina-accent-700">{error}</p>}

      <button
        type="submit"
        disabled={busy || !password || !passwordConfirm}
        className="w-full text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg py-2.5 disabled:opacity-50"
      >
        {busy ? "Ukládám…" : "Nastavit heslo"}
      </button>
    </form>
  );
}

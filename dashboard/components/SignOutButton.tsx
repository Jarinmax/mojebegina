"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

// Security Phase 2.4 — reálné odhlášení dostupné z /profil (dřívější
// interní testovací stránka /login už signOut tlačítko neobsahuje, protože
// nepřihlášeného uživatele nechává jen přihlásit se).
export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    await authClient.signOut();
    // Plná navigace — vynutí nový request bez staré session cookie.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className="w-full text-sm font-medium text-begina-primary-900 border border-begina-primary-700 rounded-lg py-2.5 disabled:opacity-50"
    >
      {busy ? "Odhlašuji…" : "Odhlásit se"}
    </button>
  );
}

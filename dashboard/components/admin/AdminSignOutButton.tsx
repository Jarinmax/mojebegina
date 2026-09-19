"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export default function AdminSignOutButton() {
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
      className="text-xs font-medium text-neutral-600 hover:text-begina-primary-900 disabled:opacity-50"
    >
      {busy ? "Odhlašuji…" : "Odhlásit se"}
    </button>
  );
}

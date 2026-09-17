"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export default function LoginForm({ loggedIn }: { loggedIn: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSignUp() {
    setBusy(true);
    const { error } = await authClient.signUp.email({ email, password, name });
    setBusy(false);
    if (error) {
      setMessage(`Chyba registrace: ${error.message}`);
      return;
    }
    window.location.reload();
  }

  async function handleSignIn() {
    setBusy(true);
    const { error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) {
      setMessage(`Chyba přihlášení: ${error.message}`);
      return;
    }
    window.location.reload();
  }

  async function handleSignOut() {
    setBusy(true);
    await authClient.signOut();
    window.location.reload();
  }

  if (loggedIn) {
    return (
      <button
        onClick={handleSignOut}
        disabled={busy}
        style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #333", background: "#fff", color: "#111", cursor: "pointer" }}
      >
        Odhlásit se (signOut)
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        placeholder="Jméno (jen pro první registraci)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
      />
      <input
        placeholder="E-mail"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
      />
      <input
        placeholder="Heslo (min. 8 znaků)"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSignUp}
          disabled={busy || !email || !password}
          style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #333", background: "#fff", color: "#111", cursor: "pointer" }}
        >
          Registrovat (první test)
        </button>
        <button
          onClick={handleSignIn}
          disabled={busy || !email || !password}
          style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #333", background: "#fff", color: "#111", cursor: "pointer" }}
        >
          Přihlásit
        </button>
      </div>
      {message && <p style={{ fontSize: 13, color: "#b00" }}>{message}</p>}
    </div>
  );
}

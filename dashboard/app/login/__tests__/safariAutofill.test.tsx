// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/client", () => ({
  authClient: { signIn: { email: signInEmail } },
}));

import LoginForm from "../LoginForm";

describe("Safari credential autofill", () => {
  beforeEach(() => {
    signInEmail.mockReset();
    signInEmail.mockResolvedValue({ error: new Error("invalid credentials") });
  });

  it("submits autofilled DOM values even when no input event updated React state", async () => {
    render(<LoginForm />);

    const email = screen.getByLabelText("E-mail") as HTMLInputElement;
    const password = screen.getByLabelText("Heslo") as HTMLInputElement;

    // Simulate Safari/password-manager autofill: DOM values change without
    // dispatching React's onChange event.
    email.value = "viner.jaroslav@gmail.com";
    password.value = "stored-password";

    const submit = screen.getByRole("button", { name: "Přihlásit" });
    expect(submit).toBeEnabled();

    fireEvent.submit(screen.getByRole("button", { name: "Přihlásit" }).closest("form")!);

    await waitFor(() => {
      expect(signInEmail).toHaveBeenCalledWith({
        email: "viner.jaroslav@gmail.com",
        password: "stored-password",
      });
    });
    expect(await screen.findByText("Nesprávný e-mail nebo heslo.")).toBeTruthy();
  });
});

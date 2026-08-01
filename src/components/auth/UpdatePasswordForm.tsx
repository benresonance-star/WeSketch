"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<"idle" | "submitting">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (password !== confirmation) {
      setMessage("Passwords do not match.");
      return;
    }

    setState("submitting");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage(error.message);
      setState("idle");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <div>
        <p className="eyebrow">Account recovery</p>
        <h1>Choose a new password</h1>
        <p className="auth-copy">
          Enter a new password for your WeSketch account.
        </p>
      </div>
      <label>
        New password
        <input
          autoComplete="new-password"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      <label>
        Confirm new password
        <input
          autoComplete="new-password"
          minLength={8}
          onChange={(event) => setConfirmation(event.target.value)}
          required
          type="password"
          value={confirmation}
        />
      </label>
      {message ? <p className="auth-message">{message}</p> : null}
      <button disabled={state === "submitting"} type="submit">
        {state === "submitting" ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}

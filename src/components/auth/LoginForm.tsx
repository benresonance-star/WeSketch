"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "submitting">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage(null);
    const supabase = createClient();
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin
    ).replace(/\/$/, "");

    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${siteUrl}/auth/callback`,
            },
          });

    if (result.error) {
      setMessage(result.error.message);
      setState("idle");
      return;
    }

    if (mode === "sign-up" && !result.data.session) {
      setMessage("Check your email to confirm the account, then sign in.");
      setState("idle");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <div>
        <p className="eyebrow">Phase 2 persistence</p>
        <h1>{mode === "sign-in" ? "Sign in to WeSketch" : "Create an account"}</h1>
        <p className="auth-copy">
          Your projects are private and synchronized through Supabase.
        </p>
      </div>
      <label>
        Email
        <input
          autoComplete="email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label>
        Password
        <input
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {message ? <p className="auth-message">{message}</p> : null}
      <button disabled={state === "submitting"} type="submit">
        {state === "submitting"
          ? "Please wait…"
          : mode === "sign-in"
            ? "Sign in"
            : "Create account"}
      </button>
      <button
        className="text-button"
        onClick={() => {
          setMode((current) =>
            current === "sign-in" ? "sign-up" : "sign-in",
          );
          setMessage(null);
        }}
        type="button"
      >
        {mode === "sign-in"
          ? "Need an account? Sign up"
          : "Already have an account? Sign in"}
      </button>
    </form>
  );
}

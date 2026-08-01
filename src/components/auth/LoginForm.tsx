"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up" | "reset";

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

    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/auth/callback?next=/update-password`,
      });
      setState("idle");
      setMessage(
        error
          ? error.message
          : "If an account exists for this email, a password reset link has been sent.",
      );
      return;
    }

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
        <h1>
          {mode === "sign-in"
            ? "Sign in to WeSketch"
            : mode === "sign-up"
              ? "Create an account"
              : "Reset your password"}
        </h1>
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
      {mode !== "reset" ? (
        <label>
          Password
          <input
            autoComplete={
              mode === "sign-in" ? "current-password" : "new-password"
            }
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
      ) : null}
      {message ? <p className="auth-message">{message}</p> : null}
      <button disabled={state === "submitting"} type="submit">
        {state === "submitting"
          ? "Please wait…"
          : mode === "sign-in"
            ? "Sign in"
            : mode === "sign-up"
              ? "Create account"
              : "Email reset link"}
      </button>
      {mode === "sign-in" ? (
        <button
          className="text-button"
          onClick={() => {
            setMode("reset");
            setMessage(null);
          }}
          type="button"
        >
          Forgot password?
        </button>
      ) : null}
      <button
        className="text-button"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          setMessage(null);
        }}
        type="button"
      >
        {mode === "sign-in"
          ? "Need an account? Sign up"
          : mode === "sign-up"
            ? "Already have an account? Sign in"
            : "Back to sign in"}
      </button>
    </form>
  );
}

import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims.sub) {
    redirect("/");
  }

  return (
    <main className="auth-shell">
      <LoginForm />
    </main>
  );
}

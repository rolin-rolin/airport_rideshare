"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function signInWithGoogle() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
      // Pre-filters Google's account chooser to nd.edu accounts. This is a
      // hint only, not enforcement -- the callback route re-checks the
      // domain server-side since a crafted authorize URL can omit it.
      queryParams: { hd: "nd.edu" },
    },
  });

  if (error || !data.url) {
    redirect("/auth/auth-code-error");
  }

  redirect(data.url);
}

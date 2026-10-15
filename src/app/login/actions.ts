"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { POST_AUTH_NEXT_COOKIE, safeNextPath } from "@/lib/post-auth-redirect";

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();

  // Remembered across the Google round trip so /auth/callback can return
  // the user to what they were doing (e.g. the trip they tried to join).
  const cookieStore = await cookies();
  cookieStore.set(POST_AUTH_NEXT_COOKIE, safeNextPath(formData.get("next")), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

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

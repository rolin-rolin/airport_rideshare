"use server";

import { createClient } from "@/utils/supabase/server";

const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN!;

export async function sendMagicLink(
  _prevState: { error: string | null; sent: boolean },
  formData: FormData,
) {
  const email = String(formData.get("email") ?? "").trim();

  const domain = email.split("@")[1]?.toLowerCase();
  if (domain !== ALLOWED_EMAIL_DOMAIN) {
    return {
      error: `Please use your school email address (@${ALLOWED_EMAIL_DOMAIN}).`,
      sent: false,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message, sent: false };
  }

  return { error: null, sent: true };
}

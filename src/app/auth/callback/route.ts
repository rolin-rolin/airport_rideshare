import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN!;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // hd is a client-side hint only (a crafted authorize URL can omit
      // it), so re-verify the domain and Google's email verification claim
      // server-side before treating this as an authenticated nd.edu user.
      const domain = user?.email?.split("@")[1]?.toLowerCase();
      const emailVerified = user?.user_metadata?.email_verified === true;

      if (domain === ALLOWED_EMAIL_DOMAIN && emailVerified) {
        return NextResponse.redirect(`${origin}/dashboard`);
      }

      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/auth/not-authorized`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
